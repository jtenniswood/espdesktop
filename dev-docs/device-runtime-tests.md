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

The release check has two steps.

1. With the candidate Mac app connected, run one nested Mac shortcut and tap Back.
2. Restart the display and wait for the Mac app to reconnect.

The runner checks the reboot and Mac connection, measures memory, and records
page-open and Back first-frame timings.
The session verifies the running firmware’s embedded ELF digest against the
candidate OTA image, including rebuilds with the same version tag.
The operator performs and confirms the steps. The runner makes read-only
requests to the panel and saves the measurements to `report.json` for
diagnosis. Publication uses the confirmation of the installed Mac app.

For a development baseline, omit the candidate run and manifest to record
the same measurements.

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

### Compare S3 presentation builds

Build the `guition-esp32-s3-4848s040-benchmark.yaml` reference and
`guition-esp32-s3-4848s040-combined-copy.yaml` candidate from the same
revision, with the same embedded editor and pinned ESPHome version.
Leave `s3_run_render_workload` off for the hands-on comparison.
Use the app-only OTA artifacts for an already configured test S3. Use the
factory artifacts for a separate clean-install check on a spare S3 through
ESP Web Tools.
Keep a pre-test backup and the current working OTA artifact available.

Run `npm run test:device-runtime -- --host PANEL_IP --duration 120` for
each build. Start the interaction sequence after the first sample. Repeat
the same taps, page opens, Back gestures and artwork/web editor workload,
then allow a final HTTP sample before stopping. Also record a separate idle
run. Use the same camera frame rate and screen framing for both runs. For
each comparable tap, count frames from finger contact to the first visible
response and divide by the frame rate to get the delay in seconds.
The report records both core CPU busy percentages, largest free blocks and
a histogram of touch detection to observed scan-out completion. The latter
tracks the next submitted frame within 250 ms of a touch and can include an
unrelated redraw or a missed tap. The final count represents 250 ms or
more. Use the video to validate actual visual feedback and check for tearing.

After each OTA, check that the panel keeps its name and saved layout. Run
the same existing Home Assistant automation that calls a panel action and
check both its trace and the expected action on the panel or connected Mac.

For a matched run without an operator, compile each profile with
`esphome -s s3_run_render_workload true compile BUILDS_YAML`. The test image
opens a temporary nine-tile scene 35 seconds after boot, presses two spaced
tiles every 100 ms for 200 steps, and returns to the previous screen. Run
the collector immediately after OTA using `--duration 90 --interval 1` so
it covers the entire workload. Accept a completed run only when the report's
`display_benchmark.workload` shows 200 events and 200 samples. The workload
histogram measures software events until the device loop handles frame
completion. Compare it with `workload_to_driver_ready`, which timestamps
the RGB interrupt that signals the old buffer is reusable before the loop
can observe it. Require 200 samples in both histograms. Physical touch
stays in its own histograms and touch-to-visible evidence needs video.

The optional `guition-esp32-s3-4848s040-dirty-regions.yaml` profile keeps
synchronous presentation and tracks up to 16 updated rectangles per frame.
It uses the bounding rectangle if the region list fills or copying the
regions would move as many pixels. Compare `display_benchmark.workload.copied_bytes`
with the synchronous reference for the same 200-event run.

Add `-s s3_run_page_workload true` to both build commands to alternate
between two complete screens instead of changing two tiles. Allow about
150 seconds for collection and confirm the report marks the workload as
`pages`. Use this comparison to check page changes and the full-frame
copy fallback, alongside the sparse tile results.

The opt-in `guition-esp32-s3-4848s040-deferred-copy.yaml` profile tests
skipping the copy for full-width rows overwritten by the next frame.
Use the same tile and page workload flags when comparing it with the
synchronous reference. Compare copy bytes as well as device-loop p95:
any remaining copy moves earlier in the next frame.

The opt-in `guition-esp32-s3-4848s040-combined-copy.yaml` profile defers
the copy after a confirmed full-screen replacement and uses changed
rectangles after partial redraws. Add `-s s3_run_mixed_workload true` to the
reference and candidate compile commands to change pages every fourth
event and update two tiles between page changes. Check the workload is
reported as `mixed` and compare its 200 samples to the synchronous reference.

For unattended touch testing, compile the reference and combined-copy
profile with `-s s3_run_render_workload true -s s3_run_pointer_workload true`.
This sends press and release coordinates through the same ESPHome LVGL touch
listener as the GT911. It exercises private tiles, including Open page and
Back, without invoking saved card actions. Start collection before the
workload begins and allow 120 seconds. Verify 200 submitted points, 200
handled presses, and 200 observations in both press timing histograms.
Verify 50 page changes and 50 samples in `pointer_release_to_page`, which
times the release that activated Open page or Back through the first
completed frame on the destination. These measurements start at software
input and end at frame completion.

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

## Test USB and network together on the 4848S040

Use the S3's [USB development profile](../devices/guition-esp32-s3-4848s040/usb-dev.yaml)
and the Mac app from the same branch. The profile gives USB to Companion and
keeps the normal Wi-Fi setup. ESPHome logs are available over the network
instead of the USB cable.

1. Before changing the connection, save the panel's network address and keep a
   second display connected over the network.
2. In the app's **Displays** settings, open the S3's **Network** menu and choose
   **Use USB**. The app checks the paired display's identity before switching. For a new panel, choose **Add Display**, select **Connect by
   USB**, and enter the code from the panel's **Settings → Paired** screen.
3. Run an approved shortcut and check a live Mac stat on the USB display. Use
   the second display to confirm its network connection still works.
4. Unplug and reconnect the USB cable. If macOS gives it a different port name,
   select the new port under **USB → Change port**. Verify the same display
   reconnects using its saved pairing and the other display stays connected.
5. Choose **USB → Use Network** and check that the app finds the same S3.
   Switch back to USB. Confirm each switch keeps one saved display and requires
   no pairing code. The app prompts for a network address if local discovery is
   unavailable. Repeat with two USB displays if both have the USB development
   firmware.
   Try a different panel's address or USB port and check that the saved
   connection and pairing stay intact on both displays.

6. In **Displays**, select **Device** while connected by USB with Wi-Fi connected.
   Confirm the browser opens the display’s current IP and the display stays on
   USB in the Mac app. Right-click **Device** and choose **Open USB Editor**,
   then repeat the normal **Device** click while the USB editor is loading.
   With updated firmware, the browser should open while the USB transfer continues.
   Save a layout change and confirm it persists after reopening the USB editor.
7. Disconnect the cable during a save and reconnect it. The editor keeps the
   submitted layout and reads back the saved one before retrying. If the
   layout changed in the meantime, check that the editor leaves it alone and
   offers **Export Unsaved Layout**.
8. In the USB editor, confirm **System** shows no Wi-Fi switch, including
   when the display serves an older embedded editor. On a display that is
   out of Wi-Fi range, confirm **Device** opens the editor over USB and
   Mac controls still work. If Wi-Fi was switched off in a previous build,
   choose **Use Network** while connected by USB. Check that it turns on Wi-Fi
   and finds the paired display.

Record the exact Mac build, firmware source revision, board profile, and
embedded editor SHA-256 for each USB test. Compile both USB profiles
explicitly. The regular PR firmware matrix is not USB profile coverage.

Fresh setup with the panel's Wi-Fi radio off is tracked in
[issue #307](https://github.com/jtenniswood/espdesktop/issues/307).

For a second USB display, use another 4848S040 with the USB development profile,
or an ESP32-P4 profile that includes Companion and exposes its native USB
Serial/JTAG port. For the 7-inch JC1060P470 V3 profile, add the
[Companion native USB package](../common/addon/companion_native_usb.yaml) to the
local test build. Choose **Use USB** on each saved display. With both
connected, switch one to **Network** and verify the other stays on USB.
