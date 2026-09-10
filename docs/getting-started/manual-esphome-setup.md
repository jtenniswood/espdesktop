---
title: Manual ESPHome Setup
description: Build a matching firmware revision with the standalone ESPHome tools.
---

# Manual ESPHome Setup

Use the standalone ESPHome command line to build and install firmware. For ordinary installation, use the [browser installer](/getting-started/install).

::: warning Development builds
The current removal branch is not ready to flash. Wait for successful factory builds and device-testing guidance on [PR #55](https://github.com/jtenniswood/espdesktop/pull/55).
:::

## Choose the Correct Package

| Panel | Package file |
| --- | --- |
| 10.1-inch JC8012P4A1 original panel, rear case `2627` or lower | `devices/guition-esp32-p4-jc8012p4a1/packages.yaml` |
| 10.1-inch JC8012P4A1 new panel, rear case `2628` or higher | `devices/guition-esp32-p4-jc8012p4a1-v2/packages.yaml` |
| 7-inch JC1060P470 V1 / original panel, no version marking on case or board date code before `2622` | `devices/guition-esp32-p4-jc1060p470/packages.yaml` |
| 7-inch JC1060P470 V2 / new panel, case marked `V2` or board date code `2622` or higher | `devices/guition-esp32-p4-jc1060p470-v2/packages.yaml` |
| 4.3-inch JC4880P443 | `devices/guition-esp32-p4-jc4880p443/packages.yaml` |
| 4-inch ESP32-P4 86 Panel | `devices/esp32-p4-86/packages.yaml` |
| 4-inch 4848S040 | `devices/guition-esp32-s3-4848s040/packages.yaml` |

## Create a Configuration

Use the ESPHome version pinned in the checkout's `.github/esphome.env`. Keep the package and external component code on the same revision when testing a branch.

For a validated release, a 4848S040 configuration can use:

```yaml
substitutions:
  name: "espdesktop-desk"
  friendly_name: "EspDesktop Desk"

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

packages:
  setup:
    url: https://github.com/jtenniswood/espdesktop/
    file: devices/guition-esp32-s3-4848s040/packages.yaml
    refresh: 1sec
```

Keep WiFi credentials in a local `secrets.yaml` and do not commit that file. Select the package matching your hardware from the table above.

## Validate and Install

```sh
esphome config espdesktop.yaml
esphome compile espdesktop.yaml
esphome run espdesktop.yaml
```

Connect the correct panel by USB for its first installation and select its serial port when prompted. Wireless installation is available once the panel is reachable on your network. Do not interrupt an upload.

Open the panel's web address after startup. Configure cards under **Screen** and pair supported Mac builds from **Settings → Mac Companion**. Keep the Mac app and display on matching builds.

Use [Collect USB Logs](/reference/collect-usb-logs) if startup fails.
