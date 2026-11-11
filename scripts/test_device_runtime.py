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
    (evidence.output / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    summary = (f"# Device HTTP runtime test: {report['status'].upper()}\n\n"
               f"Target: `{args.host}`; samples: {evidence.counts['http_sample']}; "
               f"observed: {report['duration_seconds']} seconds.\n\n"
               f"Firmware: `{evidence.firmware.get('esphome_version', 'unavailable')}`; "
               f"built `{evidence.firmware.get('compilation_time', 'unavailable')}`.\n\n## Failures\n\n" +
               ("\n".join(f"- {kind}: {count}" for kind, count in evidence.failures.items()) or "None detected.") +
               "\n\n## Limits\n\n" + "\n".join("- " + line for line in report["limits"]) + "\n")
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
