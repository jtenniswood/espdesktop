#!/usr/bin/env python3
"""Observe EspDesktop HTTP health, firmware identity, restarts and memory; no device writes."""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from dataclasses import dataclass, field
import hashlib
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.request

MAX_BODY = 16384
MAX_PANEL_CONFIG = 512 * 1024
METRICS = ("heap_free_percent", "heap_largest_bytes", "psram_free_percent", "psram_largest_bytes")
NAVIGATION_METRICS = ("pages_built", "pages_evicted", "page_build_ms", "page_open_frame_ms", "back_frame_ms")


def navigation_values(value):
    if (not isinstance(value, dict) or any(type(value.get(key)) is not int or not 0 <= value[key] <= 0xFFFFFFFF
                                          for key in NAVIGATION_METRICS)):
        raise ValueError("Missing or invalid navigation diagnostics.")
    return {key: value[key] for key in NAVIGATION_METRICS}


def display_benchmark_values(value):
    counters = ("sample_time_us", "completed_frames", "last_submit_to_scanout_us", "touch_bucket_us")
    if (not isinstance(value, dict) or value.get("presentation") not in ("sync", "async")
            or any(type(value.get(key)) is not int or value[key] < 0 for key in counters)
            or value["touch_bucket_us"] == 0):
        raise ValueError("invalid display benchmark counters")
    fields = [("touch_to_scanout", 51), ("idle_us_by_core", 2)]
    if "workload_to_scanout" in value:
        fields.append(("workload_to_scanout", 51))
        if (type(value.get("workload_events")) is not int or value["workload_events"] < 0
                or type(value.get("workload_finished")) is not bool):
            raise ValueError("invalid display workload counters")
        counters += ("workload_events", "workload_finished")
    for key in ("touch_to_driver_ready", "workload_to_driver_ready", "pointer_release_to_page"):
        if key in value:
            fields.append((key, 51))
    if "workload_copied_bytes" in value:
        if (type(value["workload_copied_bytes"]) is not int or value["workload_copied_bytes"] < 0
                or value.get("frame_copy_strategy") not in ("regions", "bounding_rectangle", "deferred", "combined")):
            raise ValueError("invalid display frame copy diagnostics")
        counters += ("workload_copied_bytes", "frame_copy_strategy")
    if "workload_kind" in value:
        if value["workload_kind"] not in ("tiles", "pages", "mixed", "pointer"):
            raise ValueError("invalid display workload kind")
        counters += ("workload_kind",)
    if value.get("workload_kind") == "pointer":
        pointer_counters = ("pointer_presses", "pointer_page_changes")
        if any(type(value.get(key)) is not int or value[key] < 0 for key in pointer_counters):
            raise ValueError("invalid display pointer counters")
        counters += pointer_counters
    for key, length in fields:
        counter_list = value.get(key)
        if (not isinstance(counter_list, list) or len(counter_list) != length
                or any(type(n) is not int or n < 0 for n in counter_list)):
            raise ValueError("invalid display benchmark counter list")
    return {key: value[key] for key in (*counters, "presentation", *(key for key, _ in fields))}


def histogram_p95_bucket(histogram):
    rank = (95 * sum(histogram) + 99) // 100
    if rank:
        for index, count in enumerate(histogram):
            rank -= count
            if rank <= 0:
                return index
    return None


def display_benchmark_summary(first, last):
    span = last["sample_time_us"] - first["sample_time_us"]
    frames = last["completed_frames"] - first["completed_frames"]
    bucket_us = first["touch_bucket_us"]
    if (span <= 0 or frames < 0 or bucket_us != last["touch_bucket_us"]
            or first["presentation"] != last["presentation"]):
        return None
    histogram = [end - start for start, end in zip(first["touch_to_scanout"], last["touch_to_scanout"])]
    idle_us = [end - start for start, end in zip(first["idle_us_by_core"], last["idle_us_by_core"])]
    if min(histogram) < 0 or min(idle_us) < 0:
        return None
    report = {"presentation": last["presentation"], "duration_seconds": span / 1_000_000,
              "completed_frames": frames, "touch_samples": sum(histogram),
              "touch_bucket_us": bucket_us, "touch_to_scanout_histogram": histogram,
              "touch_p95_bucket": histogram_p95_bucket(histogram),
              "cpu_busy_percent_by_core": [round(100 * (1 - min(elapsed, span) / span), 2)
                                           for elapsed in idle_us]}
    if "workload_to_scanout" in first and "workload_to_scanout" in last:
        workload = [end - start for start, end in zip(first["workload_to_scanout"], last["workload_to_scanout"])]
        events = last["workload_events"] - first["workload_events"]
        if min(workload) < 0 or events < 0:
            return None
        report["workload"] = {"events": events, "finished": last["workload_finished"],
                              "samples": sum(workload), "histogram": workload,
                              "p95_bucket": histogram_p95_bucket(workload)}
        if "workload_kind" in last:
            if first.get("workload_kind") != last["workload_kind"] and first["workload_events"] > 0:
                return None
            report["workload"]["kind"] = last["workload_kind"]
        if last.get("workload_kind") == "pointer":
            for key in ("pointer_presses", "pointer_page_changes"):
                difference = last[key] - first.get(key, 0)
                if difference < 0:
                    return None
                report["workload"][key] = difference
        if "workload_copied_bytes" in first and "workload_copied_bytes" in last:
            copied_bytes = last["workload_copied_bytes"] - first["workload_copied_bytes"]
            if copied_bytes < 0 or first["frame_copy_strategy"] != last["frame_copy_strategy"]:
                return None
            report["workload"]["copied_bytes"] = copied_bytes
            report["workload"]["copy_strategy"] = last["frame_copy_strategy"]
    for key in ("touch_to_driver_ready", "workload_to_driver_ready"):
        if key in first and key in last:
            ready = [end - start for start, end in zip(first[key], last[key])]
            if min(ready) < 0:
                return None
            report[key] = {"samples": sum(ready), "histogram": ready,
                           "p95_bucket": histogram_p95_bucket(ready)}
    if "pointer_release_to_page" in last:
        first_pages = first.get("pointer_release_to_page", [0] * 51)
        pages = [end - start for start, end in zip(first_pages, last["pointer_release_to_page"])]
        if min(pages) < 0:
            return None
        report["pointer_release_to_page"] = {
            "samples": sum(pages), "histogram": pages, "p95_bucket": histogram_p95_bucket(pages),
        }
    return report


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite positive number")
    return number


def read_boot_clock(response):
    """Bounded SSE ping reader also used by the web transport stress runner."""
    event, identifier, consumed = "", None, 0
    while consumed < 65536:
        line = response.readline(4097)
        consumed += len(line)
        if not line or len(line) > 4096:
            break
        line = line.decode("utf-8").strip()
        if not line:
            if event == "ping" and identifier is not None:
                if not 0 <= identifier <= 0xFFFFFFFF:
                    raise ValueError("invalid boot clock")
                return identifier
            event, identifier = "", None
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("id:"):
            identifier = int(line[3:].strip())
    raise ValueError("event stream did not supply a boot clock")


class HttpProbe:
    def __init__(self, host, port, timeout):
        host = f"[{host}]" if ":" in host and not host.startswith("[") else host
        self.base = f"http://{host}:{port}"
        self.timeout = timeout
        manager = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        username = os.environ.get("ESPDESKTOP_HTTP_USERNAME")
        if username:
            manager.add_password(None, self.base, username, os.environ.get("ESPDESKTOP_HTTP_PASSWORD", ""))
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
            urllib.request.HTTPDigestAuthHandler(manager), urllib.request.HTTPBasicAuthHandler(manager))

    def json(self, path):
        with self.opener.open(urllib.request.Request(self.base + path,
                headers={"User-Agent": "EspDesktop-device-test"}), timeout=self.timeout) as response:
            if "application/json" not in response.headers.get("Content-Type", ""):
                raise ValueError("expected JSON content type")
            data = response.read(MAX_BODY + 1)
        if len(data) > MAX_BODY:
            raise ValueError("oversized JSON response")
        result = json.loads(data)
        if not isinstance(result, dict):
            raise ValueError("expected a JSON object")
        return result

    def native_config_snapshot(self, *, require_durable_v2=True):
        """Return the generation and an in-memory fingerprint of the v2 response."""
        request = urllib.request.Request(self.base + "/api/v1/config", headers={
            "User-Agent": "EspDesktop-device-test", "X-Panel-Config-Version": "2",
        })
        with self.opener.open(request, timeout=self.timeout) as response:
            headers = response.headers
            durable = headers.get("X-Panel-Config-Durable-Version")
            if (headers.get_content_type() != "application/vnd.espdesktop.panel-config" or
                    headers.get("X-Panel-Config-Version") != "2" or durable not in ("1", "2")):
                raise ValueError("expected a native v2 panel configuration response")
            if require_durable_v2 and durable != "2":
                raise ValueError("expected a saved native v2 panel configuration")
            generation = headers.get("X-Panel-Config-Generation", "")
            if not re.fullmatch(r"[0-9]{1,10}", generation) or int(generation) > 0xFFFFFFFF:
                raise ValueError("invalid native configuration generation")
            data = response.read(MAX_PANEL_CONFIG + 1)
        if (not 32 <= len(data) <= MAX_PANEL_CONFIG or data[:8] != b"EPCF\x02\x00\x10\x00" or
                int.from_bytes(data[8:12], "little") != len(data) - 16):
            raise ValueError("invalid native configuration response")
        return int(generation), hashlib.sha256(data).digest()

    def sample(self):
        identity = self.json("/api/v1/identity")
        capabilities = self.json("/api/v1/capabilities")
        health = self.json("/api/v1/diagnostics")
        if identity.get("restart_required") is not False:
            raise ValueError("device requires a restart")
        if capabilities.get("api", {}).get("version") != 1 or health.get("version") != 1:
            raise ValueError("unsupported device diagnostics API")
        hostname, suffix = identity.get("hostname"), identity.get("mac_suffix")
        if not isinstance(hostname, str) or not hostname:
            raise ValueError("missing device hostname")
        if not isinstance(suffix, str) or not re.fullmatch(r"(?:[a-f0-9]{4}|[a-f0-9]{6})", suffix):
            raise ValueError("invalid device MAC suffix")
        if health.get("hostname") != hostname or health.get("mac_suffix") != suffix:
            raise ValueError("identity and diagnostics refer to different devices")
        for key, maximum in (("boot_id", 0xFFFFFFFF), ("uptime_ms", 0xFFFFFFFFFFFFFFFF), ("reset_reason", 255)):
            value = health.get(key)
            if type(value) is not int or not 0 <= value <= maximum:
                raise ValueError(f"invalid {key}")
        firmware = health.get("firmware")
        if not isinstance(firmware, dict) or any(not isinstance(firmware.get(k), str) or not firmware[k]
                for k in ("esphome_version", "compilation_time", "project_version", "model")):
            raise ValueError("missing firmware identity")
        app_hash = firmware.get("app_elf_sha256")
        if app_hash is not None and (not isinstance(app_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", app_hash)):
            raise ValueError("invalid application ELF digest")
        memory = health.get("memory")
        if not isinstance(memory, dict) or "heap_free_percent" not in memory:
            raise ValueError("missing memory diagnostics")
        for key in METRICS:
            if key not in memory:
                continue  # Panels without PSRAM can omit its percentage.
            value = memory[key]
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0 or (key.endswith("percent") and value > 100):
                raise ValueError("invalid memory diagnostics")
        # Whitelist fields so unrelated JSON/config values never enter reports.
        result = {"hostname": hostname, "mac_suffix": suffix,
                **{key: health[key] for key in ("boot_id", "uptime_ms", "reset_reason")},
                "firmware": {key: firmware[key] for key in ("esphome_version", "compilation_time", "project_version", "model", "app_elf_sha256") if key in firmware},
                "memory": {key: memory[key] for key in METRICS if key in memory}}
        if "navigation" in health:
            result["navigation"] = navigation_values(health["navigation"])
        if "display_benchmark" in health:
            result["display_benchmark"] = display_benchmark_values(health["display_benchmark"])
        return result


@dataclass
class Evidence:
    output: Path
    started: float = field(default_factory=time.monotonic)
    failures: Counter = field(default_factory=Counter)
    counts: Counter = field(default_factory=Counter)
    metrics: dict = field(default_factory=dict)
    firmware: dict = field(default_factory=dict)
    identity: dict = field(default_factory=dict)
    previous: dict | None = None
    memory_minimum: float = 5.0
    benchmark_first: dict | None = None

    def event(self, kind, failure=False, **details):
        if failure:
            self.failures[kind] += 1
        self.counts[kind] += 1
        record = {"elapsed_seconds": round(time.monotonic() - self.started, 3),
                  "event": kind, "failure": failure, **details}
        with (self.output / "events.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, allow_nan=False) + "\n")
        if failure:
            print(f"FAIL {kind}: {json.dumps(details)}", flush=True)

    def sample(self, data, expected_version=None, expected_build=None):
        current_identity = {key: data[key] for key in ("hostname", "mac_suffix")}
        if self.identity and self.identity != current_identity:
            self.event("identity_changed", failure=True)
        if self.firmware and self.firmware != data["firmware"]:
            self.event("firmware_changed", failure=True)
        if self.previous and (data["boot_id"] != self.previous["boot_id"] or data["uptime_ms"] < self.previous["uptime_ms"]):
            self.event("reboot", failure=True, reset_reason=data["reset_reason"])
        self.identity, self.firmware, self.previous = current_identity, data["firmware"], data
        if self.benchmark_first is None:
            self.benchmark_first = data.get("display_benchmark")
        if expected_version and self.firmware["esphome_version"] != expected_version:
            self.event("wrong_firmware_version", failure=True)
        if expected_build and self.firmware["compilation_time"] != expected_build:
            self.event("wrong_build_timestamp", failure=True)
        for metric, value in data["memory"].items():
            current = self.metrics.setdefault(metric, {"first": value, "last": value, "minimum": value, "maximum": value})
            current.update(last=value, minimum=min(current["minimum"], value), maximum=max(current["maximum"], value))
            if metric == "heap_free_percent" and value < self.memory_minimum:
                self.event("memory_pressure", failure=True, value=value)
        self.event("http_sample", **data)


def final_report(evidence, args, interrupted=False):
    if evidence.counts["http_sample"] < 2:
        evidence.event("incomplete_http_coverage", failure=True)
    if "heap_free_percent" not in evidence.metrics:
        evidence.event("missing_memory_diagnostics", failure=True)
    if interrupted:
        evidence.event("interrupted", failure=True)
    report = {"status": "failed" if evidence.failures else "passed", "host": args.host,
              "duration_seconds": round(time.monotonic() - evidence.started, 2),
              "requested_duration_seconds": args.duration, "firmware": evidence.firmware,
              "http_identity": evidence.identity, "failures": dict(evidence.failures),
              "counts": dict(evidence.counts), "memory": evidence.metrics,
              "limits": ["Passing describes only the observed HTTP test window.",
                         "Restarts and network outages fail the test; the runner cannot establish their cause.",
                         "Device logs are not collected. Panics before HTTP delivery may need USB serial capture.",
                         "No screen, touch, Mac control or modal actions are exercised; test these separately."]}
    benchmark_last = (evidence.previous or {}).get("display_benchmark")
    if not evidence.failures and evidence.benchmark_first is not None and benchmark_last is not None:
        report["display_benchmark"] = display_benchmark_summary(evidence.benchmark_first, benchmark_last)
    (evidence.output / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    summary = (f"# Device HTTP runtime test: {report['status'].upper()}\n\n"
               f"Target: `{args.host}`; samples: {evidence.counts['http_sample']}; "
               f"observed: {report['duration_seconds']} seconds.\n\n"
               f"Firmware: `{evidence.firmware.get('esphome_version', 'unavailable')}`; "
               f"built `{evidence.firmware.get('compilation_time', 'unavailable')}`.\n\n## Failures\n\n" +
               ("\n".join(f"- {kind}: {count}" for kind, count in evidence.failures.items()) or "None detected.") +
               "\n\n## Limits\n\n" + "\n".join("- " + line for line in report["limits"]) + "\n")
    if benchmark := report.get("display_benchmark"):
        cpu = ", ".join(f"core {i}: {busy:.2f}%" for i, busy in enumerate(benchmark["cpu_busy_percent_by_core"]))
        bucket = benchmark["touch_p95_bucket"]
        latency = "no touch samples"
        if bucket is not None:
            width_ms = benchmark["touch_bucket_us"] / 1000
            low = bucket * width_ms
            if bucket == len(benchmark["touch_to_scanout_histogram"]) - 1:
                latency = f"at least {low:g} ms"
            else:
                latency = f"{low:g} to <{low + width_ms:g} ms"
        summary += ("\n## S3 display benchmark\n\n"
                    f"- Presentation: {benchmark['presentation']}\n"
                    f"- CPU busy: {cpu}\n"
                    f"- Touch to observed scan-out (p95): {latency} "
                    f"({benchmark['touch_samples']} samples)\n")
        for metric, label in (("heap_largest_bytes", "Internal RAM"), ("psram_largest_bytes", "PSRAM")):
            if metric in evidence.metrics:
                summary += f"- {label}: smallest observed largest free block was {evidence.metrics[metric]['minimum']:,} bytes\n"
    (evidence.output / "report.md").write_text(summary)
    return report


async def run_suite(args, probe_factory=HttpProbe):
    args.output.mkdir(parents=True, exist_ok=False)
    evidence = Evidence(args.output, memory_minimum=args.min_heap_percent)
    probe = probe_factory(args.host, args.http_port, args.timeout)
    interrupted = False
    deadline = time.monotonic() + args.duration
    print(f"Testing {args.host} over HTTP for {args.duration:g}s; reports: {args.output}", flush=True)
    try:
        while time.monotonic() < deadline:
            try:
                data = await asyncio.to_thread(probe.sample)
                evidence.sample(data, args.expect_version, args.expect_build)
            except Exception as exc:
                evidence.event("http_error", failure=True, error=type(exc).__name__, status=getattr(exc, "code", None))
            await asyncio.sleep(min(args.interval, max(0, deadline - time.monotonic())))
    except asyncio.CancelledError:
        interrupted = True
    report = final_report(evidence, args, interrupted)
    print(f"{report['status'].upper()}: {dict(evidence.failures)}; report: {args.output / 'report.md'}", flush=True)
    return 0 if report["status"] == "passed" else 1


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="explicit device hostname or IP (no URL)")
    parser.add_argument("--duration", type=positive, default=120)
    parser.add_argument("--interval", type=positive, default=10)
    parser.add_argument("--timeout", type=positive, default=5)
    parser.add_argument("--http-port", type=int, default=80)
    parser.add_argument("--expect-version")
    parser.add_argument("--expect-build", help="exact ESPHome compilation timestamp")
    parser.add_argument("--min-heap-percent", type=positive, default=5)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if re.search(r"[/@\s]", args.host) or not args.host:
        parser.error("--host must be a hostname/IP, not a URL")
    if not 1 <= args.http_port <= 65535 or args.min_heap_percent > 100:
        parser.error("invalid port or heap threshold")
    if args.output is None:
        args.output = Path("build/device-tests") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    args.output = args.output.resolve()
    if args.output.exists():
        parser.error("--output must name a new directory, to preserve existing evidence")
    return args


def main(argv=None):
    try:
        return asyncio.run(run_suite(arguments(argv)))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
