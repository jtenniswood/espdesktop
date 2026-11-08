---
title: Contributing
description:
  How to get started if you want to contribute fixes, card types, firmware changes, or web configurator improvements to EspDesktop.
---

# Contributing

Thanks for wanting to help improve EspDesktop.

The project has a developer guide for people who want to work on the firmware,
the web configurator, docs, or generated files:

[Read the EspDesktop developer reference on GitHub](https://github.com/jtenniswood/espdesktop/blob/main/dev-docs/README.md)

Those pages cover the project layout, local build tools, how the web
configurator is bundled, how to flash a development build, where logs come from,
and what needs to change when adding or fixing a card type.

## Before Opening a Pull Request

- Check the existing [issues](https://github.com/jtenniswood/espdesktop/issues)
  to see if the change is already being discussed.
- Keep the change focused so it is easier to test.
- Run the checks listed in the developer reference before submitting code
  changes.
- If your change affects how users configure or use the panel, update the docs
  in this site too.

For small fixes, a pull request is usually enough. For larger changes, especially
new card types or firmware behaviour, opening an issue first makes it easier to
agree what should change before you spend time building it.

## Pull Request Testing

Pull requests should make the next step obvious. The PR template asks for the
practical impact, documentation decision, testing status, and whether a physical
device test is needed before merge.

When a pull request changes firmware, device configuration, shared display
files, or web files used by the device, an automated workflow posts suggested
device testing notes. Treat those notes as the starting point for manual device
testing after the automated checks pass.

For a flashed panel, use the [device runtime tests](https://github.com/jtenniswood/espdesktop/blob/main/dev-docs/device-runtime-tests.md) to
observe HTTP health, restart evidence, firmware identity, and memory without
changing the display or calling the native ESPHome API. CI checks the runner itself with offline
fixtures; live device tests run separately against an explicit address.

A successful compile or CI run confirms that the project builds. It does not
replace testing on the affected display when the change touches the on-device
experience.

Firmware-related pull requests automatically compile every supported factory and
P4 recovery image. The **Firmware Compile Gate** check fails if any required
build fails. Changes outside firmware inputs skip compilation. PR, nightly and
release build summaries report application size, OTA partition capacity and remaining
headroom; less than 128 KiB free produces a warning, and an oversized image fails
the build. Sizes use the compiled application binary and partition table, not the
larger USB factory image.

## Testing Web Connections on a Device

After flashing a branch, run this from the repository root with Python's standard
library. Replace the address with the display you are authorized to test:

```sh
python scripts/test_device_web_transport.py --host 192.168.1.50 \
  --firmware-label "my-test-branch"
```

The suite checks the version, editor and saved configuration, opens and closes
80 event streams, holds two non-reading streams for 45 seconds while checking
healthy connections, then checks recovery. It reports uptime regressions as
possible reboots and verifies that saved configuration is unchanged. It does
not read firmware logs or prove that the server's internal timeout-cleanup path
ran; the report states these coverage limits.

The command uses GET requests only. It does not flash, change settings, import
backups or invoke controls. Exercise local/Mac cards and artwork while it runs
to include that workload. Avoid editing settings during the run, because that
will fail the configuration comparison. Screen, touch and Mac actions still
need separate physical checks.

Timestamped JSON and Markdown reports go under `.cache/device-web-transport/`.
Use `--report-dir` for another location. `--firmware-label` is user supplied;
the device's reported version is recorded separately. Exit codes are `0` for a
passed run, `1` for failed checks, `2` for setup/argument errors and `130` for
interruption. Reports exclude configuration contents and credentials.

For web authentication, use `--web-username-env` and `--web-password-env` with
environment-variable names containing the existing credentials. Native HA API
monitoring and encryption-key arguments are removed with the firmware API.
Use `scripts/test_device_runtime.py` for HTTP diagnostics, firmware identity,
restart and memory checks.

HTTP-only checks need only Python's standard library:

```sh
npm run test:device-web -- --host 192.168.1.50
```

That mode explicitly reports native API checks and cleanup-log coverage as not
monitored. `--reconnects`, `--stall-seconds`, `--stalled-clients`, `--interval` and
`--timeout` can adjust the load. Shortening the run can prevent the firmware's
stalled-client timeout from being reached. Use `--stalled-clients 1` on a
constrained device or when other browser tabs are occupying its HTTP sockets.

The fake-device runner tests are included in CI and can be run independently
with `npm run check:device-web-transport-tests`; CI never contacts a physical panel. The
suite cannot detect a blue frame on the physical display or verify touch, so
those observations still need a person or a separate recording on an affected
device.