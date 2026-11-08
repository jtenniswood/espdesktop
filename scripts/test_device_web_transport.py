#!/usr/bin/env python3
"""Validate a running EspDesktop device's HTTP and event-stream recovery."""

from __future__ import annotations

import argparse
import http.client
import json
import math
import os
from pathlib import Path
import socket
import statistics
import time
from datetime import datetime, timezone
import urllib.request

from test_device_runtime import read_boot_clock


MAX_BODY = 2 * 1024 * 1024


class CheckFailure(RuntimeError):
    pass


class SmallWindowConnection(http.client.HTTPConnection):
    def connect(self):
        super().connect()
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024)


class SmallWindowHandler(urllib.request.HTTPHandler):
    def http_open(self, request):
        return self.do_open(SmallWindowConnection, request)


class DeviceHTTP:
    def __init__(self, host, port, timeout, username=None, password=None):
        self.base = f"http://{host}:{port}"
        self.timeout = timeout
        self.latencies = []
        self.http_checks = 0
        self.reconnects = 0
        self.uptimes = []
        self.openers = []
        for slow in (False, True):
            handlers = [SmallWindowHandler()] if slow else []
            # Device requests stay on the LAN even when the shell has a proxy.
            handlers.append(urllib.request.ProxyHandler({}))
            if username is not None:
                manager = urllib.request.HTTPPasswordMgrWithDefaultRealm()
                manager.add_password(None, self.base, username, password)
                handlers += [urllib.request.HTTPDigestAuthHandler(manager),
                             urllib.request.HTTPBasicAuthHandler(manager)]
            self.openers.append(urllib.request.build_opener(*handlers))

    def open(self, path, slow=False):
        headers = {"Accept": "text/event-stream"} if path == "/events" else {}
        response = self.openers[int(slow)].open(
            urllib.request.Request(self.base + path, headers=headers), timeout=self.timeout)
        if response.status != 200:
            response.close()
            raise CheckFailure(f"{path}: expected HTTP 200, got {response.status}")
        return response

    def get(self, path):
        started = time.monotonic()
        with self.open(path) as response:
            body = response.read(MAX_BODY + 1)
        if len(body) > MAX_BODY:
            raise CheckFailure(f"{path}: response exceeds {MAX_BODY} bytes")
        self.http_checks += 1
        self.latencies.append(time.monotonic() - started)
        return body

    def stream(self, slow=False):
        response = self.open("/events", slow=slow)
        try:
            if not response.headers.get("Content-Type", "").startswith("text/event-stream"):
                raise CheckFailure("/events did not return an event stream")
            # Consume only the initial ping, not the entity dump that follows.
            uptime = read_boot_clock(response)
            if self.uptimes and uptime < self.uptimes[-1]:
                raise CheckFailure("Device uptime decreased: possible reboot")
            self.uptimes.append(uptime)
            self.reconnects += 1
            return response
        except BaseException:
            response.close()
            raise

    def reconnect(self):
        self.stream().close()


def run_suite(args, client=None):
    client = client or DeviceHTTP(args.host, args.port, args.timeout,
                                 args.web_username, args.web_password)
    report = {"schema_version": 2, "target": f"{args.host}:{args.port}",
              "firmware_label": args.firmware_label,
              "started_at": datetime.now(timezone.utc).isoformat(), "checks": [],
              "parameters": {key: getattr(args, key) for key in
                             ("reconnects", "stall_seconds", "stalled_clients", "interval", "timeout")},
              "manual_checks": ["Observe the physical screen for blue flashes and verify touch.",
                                "Repeat with the affected local/Mac configuration and artwork workload."]}
    report["coverage_limitations"] = [
        "Firmware logs and internal stalled-client timeout cleanup are not observed.",
        "HTTP/SSE recovery does not verify physical screen, touch or Mac actions.",
    ]
    before = None
    started = time.monotonic()

    def check(name, action):
        begin = time.monotonic()
        try:
            detail = action()
            report["checks"].append({"name": name, "status": "passed", "detail": detail,
                                     "seconds": round(time.monotonic() - begin, 3)})
            print(f"PASS {name}", flush=True)
            return detail
        except Exception as error:
            report["checks"].append({"name": name, "status": "failed",
                                     "detail": f"{type(error).__name__}: {error}"})
            print(f"FAIL {name}: {type(error).__name__}: {error}", flush=True)
            raise CheckFailure(name) from error

    def preflight():
        nonlocal before
        version = json.loads(client.get("/espdesktop/version"))
        if not isinstance(version, dict) or not isinstance(version.get("device_slug"), str) or not version["device_slug"]:
            raise CheckFailure("Target did not identify an EspDesktop device profile")
        report["device"] = {key: version.get(key) for key in
                            ("project_name", "project_version", "firmware_version", "device_slug")}
        before = client.get("/api/v1/config")
        if not before:
            raise CheckFailure("Native configuration is empty")
        if not client.get("/"):
            raise CheckFailure("Editor response is empty")
        client.reconnect()
        return "Version, native configuration, editor HTML and event-stream ping are available"

    def burst():
        for _ in range(args.reconnects):
            client.reconnect()
            client.get("/espdesktop/version")
        return f"{args.reconnects} reconnects with an HTTP health check after each"

    def stalls():
        streams = []
        try:
            for _ in range(args.stalled_clients):
                streams.append(client.stream(slow=True))
            deadline = time.monotonic() + args.stall_seconds
            while time.monotonic() < deadline:
                client.get("/espdesktop/version")
                client.reconnect()
                time.sleep(min(args.interval, max(0, deadline - time.monotonic())))
        finally:
            for stream in streams:
                stream.close()
        return f"{args.stalled_clients} non-reading streams held for {args.stall_seconds:g}s"

    def recovery():
        for _ in range(10):
            client.get("/espdesktop/version")
            client.reconnect()
        client.get("/")
        return "Ten reconnects and editor HTML after the stalled clients close"

    def unchanged():
        after = client.get("/api/v1/config")
        if after != before:
            raise CheckFailure("Native configuration changed during the test")
        return "Configuration is byte-for-byte unchanged; no settings were written"

    try:
        check("preflight", preflight)
        check("rapid_reconnects", burst)
        check("stalled_clients", stalls)
        check("post_stall_recovery", recovery)
    except CheckFailure:
        pass
    except KeyboardInterrupt:
        report["interrupted"] = True
    finally:
        if before is not None:
            try:
                check("configuration_preserved", unchanged)
            except CheckFailure:
                pass
    report["metrics"] = {"http_checks": client.http_checks, "event_reconnects": client.reconnects,
                          "uptime_start": client.uptimes[0] if client.uptimes else None,
                          "uptime_end": client.uptimes[-1] if client.uptimes else None,
                          "mean_http_ms": round(statistics.mean(client.latencies) * 1000, 1) if client.latencies else None,
                          "max_http_ms": round(max(client.latencies) * 1000, 1) if client.latencies else None}
    report["seconds"] = round(time.monotonic() - started, 3)
    report["status"] = "interrupted" if report.get("interrupted") else (
        "failed" if any(item["status"] == "failed" for item in report["checks"]) else "passed")
    return report


def write_report(report, directory):
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = directory / f"device-web-{stamp}.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    device = report.get("device", {})
    rows = ["# Device web transport test", "", f"Result: **{report['status'].upper()}**", "",
            f"Target: `{report['target']}`", "",
            f"Device profile: `{device.get('device_slug', 'unknown')}`; firmware: `{device.get('firmware_version', 'unknown')}`.",
            f"Firmware label: {report['firmware_label'] or '(not supplied)'} (user supplied).", "",
            f"Started: {report['started_at']}; duration: {report['seconds']} seconds.",

            "| Check | Result | Details |", "| --- | --- | --- |"]
    for item in report["checks"]:
        detail = str(item.get("detail") or "").replace("|", "\\|").replace("\n", " ")
        rows.append(f"| {item['name']} | {item['status']} | {detail} |")
    rows += ["", "```json", json.dumps(report["metrics"], indent=2), "```", "", "Manual checks still required:", ""]
    rows += [f"- {value}" for value in report["manual_checks"]]
    rows += ["", "Coverage limits:", ""]
    rows += [f"- {value}" for value in report["coverage_limitations"]]
    path.with_suffix(".md").write_text("\n".join(rows) + "\n", encoding="utf-8")
    return path


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="Device IP address or hostname (no URL)")
    parser.add_argument("--port", type=int, default=80)
    parser.add_argument("--timeout", type=float, default=5)
    parser.add_argument("--reconnects", type=int, default=80)
    parser.add_argument("--stall-seconds", type=float, default=45)
    parser.add_argument("--stalled-clients", type=int, choices=(1, 2), default=2)
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--web-username-env", help="Environment variable holding the existing web username")
    parser.add_argument("--web-password-env", help="Environment variable holding the existing web password")
    parser.add_argument("--firmware-label", default="", help="Label for comparing reports; not a verified device revision")
    parser.add_argument("--report-dir", type=Path, default=Path(".cache/device-web-transport"))
    args = parser.parse_args(argv)
    if any(c in args.host for c in "/:@?#") or not args.host:
        parser.error("--host must be a hostname or IPv4 address, without credentials or a URL")
    for name in ("timeout", "stall_seconds", "interval"):
        if not math.isfinite(getattr(args, name)) or getattr(args, name) <= 0:
            parser.error(f"--{name.replace('_', '-')} must be a finite positive number")
    if not 1 <= args.reconnects <= 10000 or not 1 <= args.port <= 65535:
        parser.error("Use 1–10000 reconnects and ports in 1–65535")
    if bool(args.web_username_env) != bool(args.web_password_env):
        parser.error("Supply both web credential environment-variable names")
    for name in ("web_username", "web_password"):
        variable = getattr(args, name + "_env")
        if variable and not os.environ.get(variable):
            parser.error(f"Environment variable {variable} is missing or empty")
        setattr(args, name, os.environ[variable] if variable else None)
    return args


def main(argv=None):
    args = parse_args(argv)
    report = run_suite(args)
    path = write_report(report, args.report_dir)
    print(f"{report['status'].upper()}: {report['metrics']['http_checks']} HTTP checks, "
          f"{report['metrics']['event_reconnects']} event-stream reconnects")
    print(f"Reports: {path} and {path.with_suffix('.md')}")
    return 130 if report["status"] == "interrupted" else int(report["status"] != "passed")


if __name__ == "__main__":
    raise SystemExit(main())
