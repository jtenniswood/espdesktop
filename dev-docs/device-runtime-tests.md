---
title: Device Runtime Tests
description: Validate a flashed EspDesktop panel and collect HTTP health, restart, firmware and memory evidence.
---

# Device Runtime Tests

Use this suite after flashing a test build. It checks HTTP device identity and
capabilities, reads firmware and memory diagnostics, and detects restarts. It
makes only GET requests. It does not flash, change settings, wake the display,
open cards, or use the Home Assistant/native ESPHome connection.

## Run a health check

Use Python 3.12 or newer from the repository root. The runner uses the Python
standard library; it does not need an ESPHome SDK. The flashed firmware must
provide `/api/v1/diagnostics` version 1. Older firmware without this endpoint
fails the test rather than silently skipping diagnostics.

Start with a passive two-minute check, replacing the example address:

```sh
npm run test:device-runtime -- --host 192.168.1.50 --duration 120
```

The target is explicit; the runner does not discover other panels. HTTP uses
port 80 unless `--http-port` is supplied. Samples are ten seconds apart by
default; `--interval` changes this. Increase `--duration` for a longer observation.
Recorded memory ranges can help investigate leaks but do not establish a cause.

Optionally require the exact ESPHome version and firmware build timestamp:

```sh
npm run test:device-runtime -- --host 192.168.1.50 \
  --expect-version 2026.10.2 --expect-build '2026-11-08 12:26:52 +0000'
```

For protected devices, set `ESPDESKTOP_HTTP_USERNAME` and
`ESPDESKTOP_HTTP_PASSWORD`. These are read from the environment and are not
included in reports. The diagnostics endpoint uses the panel's web authentication.

## Read the result

Each run creates a fresh directory under `build/device-tests/` containing:

- `report.md`: a readable result and its limitations.
- `report.json`: identity, build, failures, sample counts, and memory ranges.
- `events.jsonl`: timestamped health samples and failures.

Use `--output path/to/new-directory` to select the location. Existing directories
are refused so earlier evidence is preserved. Reports include the target address
and device identity; review them before sharing. Saved layouts, entity values,
credentials and device logs are not collected.

Exit status `0` means the observed window passed. Status `1` means a failure or
incomplete coverage, including a restart, identity/build change, missing heap
diagnostics, interruption, or an HTTP outage that later recovered. Status `2`
indicates invalid arguments. At least two successful HTTP samples are required;
very short durations can fail coverage. `--min-heap-percent` changes the default
5% minimum free-heap threshold.

The panel supplies a boot identifier and 64-bit uptime. A changed boot identifier
or decreasing uptime fails the test. A restart or network outage does not prove
a crash or its cause. Device logs are not collected; panics before HTTP delivery
can require [USB logs](https://jtenniswood.github.io/espcontrol/reference/collect-usb-logs).

## Run the release hardware session

Run the following after installing the candidate firmware and Mac app. Use the
run ID and download the manifest from the `release-candidate-compatibility`
artifact of that run.

```sh
python3 scripts/test_release_hardware.py record --host PANEL_IP \
  --candidate-run RUN_ID --manifest companion-compatibility.json
```

The release check has three steps.

1. With the candidate Mac app connected, run one nested Mac shortcut and tap Back.
2. In the display's embedded editor, select a tile and open **Edit → Card Settings**.
   Change its **Label**, click **Save**, and wait for the card editor to close.
3. Restart the display. Confirm the saved label in the editor and check that the Mac reconnects.

The runner checks the saved native configuration before and after reboot and
reports generation numbers. Layout content stays on the local network. It also
measures memory and records page-open and Back first-frame timings.
The session verifies the running firmware’s embedded ELF digest against the
candidate OTA image, including rebuilds with the same version tag.
The operator performs and confirms the steps. The runner makes read-only
requests to the panel. Give the resulting `report.json` to **Publish Release**.

For a development baseline, omit the candidate run and manifest. This records
the same measurements and cannot be used to publish a release.

## Test physical behavior separately

While observing health, use the physical panel and paired Mac to check the
changed feature: layout preservation, touch, local cards, Mac controls and volume,
app icons, artwork, clocks, sleep/wake and network recovery. The passive runner
cannot confirm these behaviors. Retired `--modal-entity`, `--modal-cycles`,
`--modal-dwell` and `--api-port` options are no longer supported.

The runner's offline tests are included in fast/CI checks. Run them alone with
`npm run check:device-runtime-tests`; they use local HTTP fixtures and test doubles
without contacting hardware. Firmware host tests execute the production
diagnostics handler, including authentication, unavailable startup, stable boot
identity, 64-bit uptime and memory/build serialization.

### S3 secondary-page cache

On the 4848S040 with a native layout, Home stays ready while secondary
screens are built when visited. Up to four secondary screens are retained.
A nested screen keeps its Back destination resident. On the application loop,
memory pressure releases hidden app icon pixels, hidden artwork buffers, and
then the least recently used secondary screens.

For a comparison, capture `/api/v1/diagnostics` at Home before and after
opening an existing nested shortcut page and using Back five times. The
`navigation` object records builds, evictions, the last cold build, and the
latest open and Back first-frame times in milliseconds. Compare the largest
internal heap and PSRAM blocks with the same layout and build at each
checkpoint. Use the same shortcut and return path for each visit.
