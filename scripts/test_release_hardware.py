#!/usr/bin/env python3
"""Record an operator-guided S3 test and verify its release candidate evidence."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import sys
import time

from companion_release import digest
from test_device_runtime import HttpProbe, METRICS

DEVICE = "guition-esp32-s3-4848s040"
REPORT_SCHEMA = 2
NAVIGATION = "Open the nested Safari shortcut, run it on the Mac, then use Back on the panel."
STEPS = (
    ("paired_mac", "Confirm the candidate Mac app is installed and the panel is paired."),
    *((f"navigation_{cycle}", NAVIGATION) for cycle in range(1, 6)),
    ("wake", "Let the screen sleep. Tap once to wake it and confirm the tap runs no action."),
    ("offline_editor", "Block internet access while keeping the local network available. "
                       "Open the embedded editor, rename a tile, and change the theme and Night Schedule."),
    ("reboot", "Restart the panel. Confirm the tile, theme and schedule changes survive and the Mac reconnects."),
)


def candidate(manifest, run, release_tag=None):
    record = json.loads(manifest.read_text())
    version = record.get("releaseVersion")
    artifacts = record.get("artifacts", {})
    ota = artifacts.get(f"{DEVICE}.ota.bin", {}) if isinstance(artifacts, dict) else {}
    app_hash = ota.get("appElfSha256") if isinstance(ota, dict) else None if isinstance(record, dict) else None
    if (not isinstance(version, str) or not re.fullmatch(r"v?\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?", version)
            or (release_tag is not None and version != release_tag)
            or not isinstance(app_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", app_hash)
            or not isinstance(record.get("supportedDevices"), list) or DEVICE not in record["supportedDevices"]
            or not isinstance(run, str) or not re.fullmatch(r"[1-9][0-9]*", run)):
        raise ValueError("The candidate manifest, build run or release tag is invalid.")
    return {"run": run, "release": version, "fingerprint": digest(manifest), "app_elf_sha256": app_hash}


def memory_values(memory):
    if not isinstance(memory, dict) or set(memory) != set(METRICS):
        raise ValueError("The S3 must report internal heap and PSRAM for each sample.")
    for key, value in memory.items():
        if (type(value) not in (float, int) or not math.isfinite(value) or value < 0
                or (key.endswith("percent") and value > 100)
                or (key.endswith("bytes") and type(value) is not int)):
            raise ValueError("The memory sample contains an invalid value.")
    if memory["heap_free_percent"] < 5:
        raise ValueError("Free internal heap fell below 5%.")
    return memory


def verify_report(report, expected):
    if (not isinstance(report, dict) or report.get("schema") != REPORT_SCHEMA
            or report.get("status") != "passed" or report.get("candidate") != expected):
        raise ValueError("A passing hardware report for the selected candidate is required.")
    firmware = report.get("firmware")
    if (not isinstance(firmware, dict) or firmware.get("model") != DEVICE
            or firmware.get("project_version") != expected["release"]
            or firmware.get("app_elf_sha256") != expected["app_elf_sha256"]
            or any(not isinstance(firmware.get(key), str) or not firmware[key]
                   for key in ("esphome_version", "compilation_time"))):
        raise ValueError("The report must identify the tested S3 release firmware.")
    steps = report.get("steps")
    if not isinstance(steps, list) or len(steps) != len(STEPS):
        raise ValueError("The hardware report does not contain the complete scenario.")
    for step, (name, _) in zip(steps, STEPS):
        if (not isinstance(step, dict) or step.get("id") != name or step.get("operator_passed") is not True
                or step.get("restarted") is not (name == "reboot")):
            raise ValueError(f"The report is missing a passing {name} checkpoint.")
        memory_values(step.get("before"))
        memory_values(step.get("after"))
    saved = report.get("native_save")
    if (not isinstance(saved, dict) or set(saved) != {"before", "saved", "reboot"}
            or any(type(value) is not int or not 0 <= value <= 0xFFFFFFFF for value in saved.values())
            or saved["before"] == saved["saved"] or saved["saved"] != saved["reboot"]):
        raise ValueError("The hardware report must confirm a native save survived reboot.")


def run(probe, output, expected=None, confirm=input):
    output.mkdir(parents=True, exist_ok=False)
    report = {"schema": REPORT_SCHEMA, "status": "failed", "candidate": expected, "steps": []}
    try:
        initial = probe.sample()
        firmware = report["firmware"] = initial["firmware"]
        if firmware["model"] != DEVICE or (expected and (
                firmware["project_version"] != expected["release"]
                or firmware.get("app_elf_sha256") != expected["app_elf_sha256"])):
            raise ValueError("The panel must be running the intended S3 firmware.")
        memory_values(initial["memory"])
        previous = initial

        def sample(expect_restart=False):
            nonlocal previous
            current = probe.sample()
            if (current["firmware"] != firmware
                    or any(current[key] != initial[key] for key in ("hostname", "mac_suffix"))):
                raise ValueError("The device or firmware changed during the test.")
            restarted = current["boot_id"] != previous["boot_id"]
            if restarted != expect_restart or (not restarted and current["uptime_ms"] < previous["uptime_ms"]):
                raise ValueError("The expected reboot was missing." if expect_restart else "The panel rebooted unexpectedly.")
            previous = current
            return memory_values(current["memory"])

        saved_config = None
        before_config = None
        for name, instruction in STEPS:
            before = sample()
            if name == "offline_editor":
                before_config = probe.native_config_snapshot(require_durable_v2=False)
            started = time.monotonic()
            if confirm(f"{instruction}\nType pass when confirmed, or fail to stop: ").strip().lower() != "pass":
                raise ValueError(f"Operator did not confirm {name}.")
            after = sample(expect_restart=name == "reboot")
            if name in ("paired_mac", "reboot"):
                pair = probe.json("/connectors/status").get("mac_companion", {})
                if not isinstance(pair, dict) or pair.get("paired") is not True or pair.get("connected") is not True:
                    raise ValueError("The paired Mac is disconnected.")
            if name == "offline_editor":
                saved_config = probe.native_config_snapshot()
                if saved_config[0] == before_config[0] or saved_config[1] == before_config[1]:
                    raise ValueError("The offline editor did not change the saved native document.")
            if name == "reboot":
                reboot_config = probe.native_config_snapshot()
                if reboot_config != saved_config:
                    raise ValueError("The saved native document changed after reboot.")
                report["native_save"] = {"before": before_config[0], "saved": saved_config[0],
                                         "reboot": reboot_config[0]}
            print(f"{name}: internal heap {before['heap_free_percent']:.1f}% → {after['heap_free_percent']:.1f}% free, "
                  f"PSRAM {before['psram_free_percent']:.1f}% → {after['psram_free_percent']:.1f}% free.")
            report["steps"].append({"id": name, "operator_passed": True,
                                    "restarted": name == "reboot", "before": before, "after": after,
                                    "seconds": round(time.monotonic() - started, 2)})
        report["status"] = "passed"
        if expected:
            verify_report(report, expected)
    except (ValueError, OSError, EOFError, KeyboardInterrupt) as error:
        report["status"] = "failed"
        report["failure"] = str(error) if isinstance(error, ValueError) else type(error).__name__
    finally:
        path = output / "report.json"
        path.write_text(json.dumps(report, allow_nan=False, separators=(",", ":")) + "\n")
        print(f"{report['status'].upper()}: {path}", file=sys.stderr)
        if "failure" in report:
            print(report["failure"], file=sys.stderr)
    return 0 if report["status"] == "passed" else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    record = commands.add_parser("record", help="run the scenario without writing to the panel")
    record.add_argument("--host", required=True)
    record.add_argument("--output", type=Path, default=None)
    record.add_argument("--candidate-run")
    record.add_argument("--manifest", type=Path)
    verify = commands.add_parser("verify", help="validate release evidence read from stdin")
    verify.add_argument("--candidate-run", required=True)
    verify.add_argument("--manifest", type=Path, required=True)
    verify.add_argument("--release-tag", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "verify":
            expected = candidate(args.manifest, args.candidate_run, args.release_tag)
            verify_report(json.load(sys.stdin), expected)
            print(expected["fingerprint"])
            return 0
        if not args.host or re.search(r"[/@\s]", args.host):
            parser.error("--host must be a hostname or IP address")
        if bool(args.manifest) != bool(args.candidate_run):
            parser.error("--manifest and --candidate-run must be supplied together")
        expected = candidate(args.manifest, args.candidate_run) if args.manifest else None
        output = args.output or Path("build/release-hardware") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        return run(HttpProbe(args.host, 80, 5), output, expected)
    except (ValueError, OSError) as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
