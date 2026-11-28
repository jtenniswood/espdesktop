"""Run the unattended pointer comparison and restore a configured S3."""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

from companion_release import esp32_application_elf_sha256
from test_device_runtime import HttpProbe


DEVICE_MODEL = "guition-esp32-s3-4848s040"
ESP32_S3_CHIP_ID = 9
PRESSES = 200
PAGE_CHANGES = 50


def application_digest(path):
    with path.open("rb") as image:
        header = image.read(14)
    if len(header) != 14 or int.from_bytes(header[12:14], "little") != ESP32_S3_CHIP_ID:
        raise ValueError(f"{path} is not an ESP32-S3 application image")
    return esp32_application_elf_sha256(path)


def connector_enabled(probe):
    enabled = probe.json("/api/v1/home-assistant").get("enabled")
    if type(enabled) is not bool:
        raise ValueError("The S3 did not report its Home Assistant connector setting")
    return enabled


def verify_state(probe, identity, layout, home_assistant, digest):
    state = probe.sample()
    if (any(state[key] != identity[key] for key in ("hostname", "mac_suffix"))
            or state["firmware"]["model"] != DEVICE_MODEL):
        raise ValueError("The device at this address is no longer the selected S3")
    if state["firmware"]["app_elf_sha256"] != digest:
        return False
    if probe.native_config_snapshot(require_durable_v2=False) != layout:
        raise ValueError("The S3 layout changed during the comparison")
    if connector_enabled(probe) != home_assistant:
        raise ValueError("The Home Assistant connector setting changed during the comparison")
    return True


def install(args, probe, identity, layout, home_assistant, image, digest):
    state = probe.sample()
    if (state["hostname"], state["mac_suffix"], state["firmware"]["model"]) != (
            identity["hostname"], identity["mac_suffix"], DEVICE_MODEL):
        raise ValueError("The device at this address is no longer the selected S3")
    if state["firmware"]["app_elf_sha256"] != digest:
        subprocess.run([args.esphome, "upload", "--device", args.host, "--file", image], check=True)
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        try:
            if verify_state(probe, identity, layout, home_assistant, digest):
                print(f"Verified {image.name}, saved layout, hostname and Home Assistant setting", flush=True)
                return
        except OSError:
            pass
        time.sleep(1)
    raise RuntimeError(f"The S3 did not boot {image.name}")


def summarize(path, strategy):
    report = json.loads((path / "report.json").read_text())
    benchmark = report["display_benchmark"]
    workload = benchmark["workload"]
    driver = benchmark["workload_to_driver_ready"]
    page = benchmark["pointer_release_to_page"]
    if (report["status"] != "passed" or not workload["finished"]
            or workload["kind"] != "pointer" or workload["copy_strategy"] != strategy
            or workload["events"] != PRESSES or workload["pointer_presses"] != PRESSES
            or workload["samples"] != PRESSES or driver["samples"] != PRESSES
            or workload["pointer_page_changes"] != PAGE_CHANGES or page["samples"] != PAGE_CHANGES
            or benchmark["touch_samples"]):
        raise ValueError(f"{path} did not capture the complete unattended pointer workload")

    width_ms = benchmark["touch_bucket_us"] / 1000
    timing = {}
    for name, histogram in (("press", workload), ("driver_ready", driver), ("page_transition", page)):
        bucket = histogram["p95_bucket"]
        timing[name] = [bucket * width_ms, (bucket + 1) * width_ms]

    with (path / "events.jsonl").open() as source:
        events = (json.loads(line) for line in source)
        active = [event for event in events if event.get("event") == "http_sample"
                  and 0 < event["display_benchmark"]["workload_events"] < PRESSES]
    if len(active) < 2:
        raise ValueError(f"{path} has insufficient active CPU and memory samples")
    first, last = active[0]["display_benchmark"], active[-1]["display_benchmark"]
    events_observed = last["workload_events"] - first["workload_events"]
    if events_observed < 150:
        raise ValueError(f"{path} has insufficient coverage of the active workload")
    elapsed_us = last["sample_time_us"] - first["sample_time_us"]
    return {
        "copy_strategy": strategy,
        "presses": PRESSES,
        "page_changes": PAGE_CHANGES,
        "frames_timed": {
            "press": workload["samples"], "driver_ready": driver["samples"],
            "page_transition": page["samples"],
        },
        "latency_p95_ms": timing,
        "cpu_ms_per_press": [round((elapsed_us - (end - start)) / events_observed / 1000, 2)
                             for start, end in zip(first["idle_us_by_core"], last["idle_us_by_core"])],
        "minimum_largest_free_blocks_bytes": {key: min(event["memory"][key] for event in active)
                                              for key in ("heap_largest_bytes", "psram_largest_bytes")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="Test S3 address or hostname")
    parser.add_argument("--reference", required=True, type=Path, help="Reference pointer-test OTA image")
    parser.add_argument("--candidate", required=True, type=Path, help="Combined-copy pointer-test OTA image")
    parser.add_argument("--restore", required=True, type=Path, help="Exact OTA image of the currently running build")
    parser.add_argument("--output", required=True, type=Path, help="New directory for both reports and the comparison")
    parser.add_argument("--esphome", default="esphome", help="Path to the pinned ESPHome executable")
    args = parser.parse_args()

    images = [args.reference, args.candidate, args.restore]
    digests = [application_digest(image) for image in images]
    if len(set(digests)) != len(images):
        raise ValueError("The reference, candidate and restore images must be different builds")
    probe = HttpProbe(args.host, 80, 3)
    identity = probe.sample()
    if identity["firmware"]["model"] != DEVICE_MODEL or identity["firmware"]["app_elf_sha256"] != digests[2]:
        raise ValueError("Restore image does not match the selected S3's running build")
    layout = probe.native_config_snapshot(require_durable_v2=False)
    home_assistant = connector_enabled(probe)
    args.output.mkdir(parents=True)

    results = {}
    try:
        for name, strategy, image, digest in zip(
                ("reference", "candidate"), ("bounding_rectangle", "combined"), images, digests):
            install(args, probe, identity, layout, home_assistant, image, digest)
            time.sleep(7)
            report_path = args.output / name
            collected = subprocess.run([sys.executable, Path(__file__).with_name("test_device_runtime.py"),
                                        "--host", args.host, "--duration", "88", "--interval", "1",
                                        "--output", report_path])
            if collected.returncode:
                raise RuntimeError(f"The {name} run failed. See {report_path / 'report.md'}")
            results[name] = summarize(report_path, strategy)
    finally:
        install(args, probe, identity, layout, home_assistant, args.restore, digests[2])
    comparison = args.output / "comparison.json"
    comparison.write_text(json.dumps(results, indent=2) + "\n")
    print(f"Comparison saved to {comparison}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
