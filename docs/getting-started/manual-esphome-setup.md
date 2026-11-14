---
title: "Install EspDesktop with ESPHome Device Builder"
titleTemplate: :title
description:
  How to add EspDesktop to ESPHome manually, compile the firmware, and install it by USB or OTA.
---

# Install EspDesktop with ESPHome Device Builder

The normal [browser install](/screens/4848s040#set-up-espdesktop) is the easiest route. Use this page if you prefer to manage EspDesktop from ESPHome, want to compile the firmware yourself, or need to install from the ESPHome Device Builder dashboard.

## What You Need

- A supported ESP32 panel.
- ESPHome 2026.10.2, matching this repository’s pinned toolchain, using Device Builder in Home Assistant or the ESPHome command line on your computer.
- A USB-C data cable for the first install.
- Your WiFi name and password, unless you are using an advanced wired Ethernet option.

::: tip First install or update?
Use USB for a blank screen or a screen that is not already running EspDesktop. Once EspDesktop is installed and connected to WiFi, later ESPHome installs can usually be done wirelessly with OTA.
:::

## Choose the Correct Package File

Each screen uses a different ESPHome package file. For the JC8012P4A1, confirm ESP32-P4 silicon first: V3 production silicon takes precedence over the case date. Pick the one that matches your panel:

| Panel | Package file |
| --- | --- |
| 10.1-inch JC8012P4A1 original panel, rear case `2627` or lower | `devices/guition-esp32-p4-jc8012p4a1/packages.yaml` |
| 10.1-inch JC8012P4A1 new panel, rear case `2628` or higher | `devices/guition-esp32-p4-jc8012p4a1-v2/packages.yaml` |
| 10.1-inch JC8012P4A1 V3, ESP32-P4 v3.x production silicon | `devices/guition-esp32-p4-jc8012p4a1-v3/packages.yaml` |
| 7-inch JC1060P470 V1 / original panel, no version marking on case or board date code before `2622` | `devices/guition-esp32-p4-jc1060p470/packages.yaml` |
| 7-inch JC1060P470 V2 / new panel, case marked `V2` or board date code `2622` or higher | `devices/guition-esp32-p4-jc1060p470-v2/packages.yaml` |
| 4.3-inch JC4880P443 | `devices/guition-esp32-p4-jc4880p443/packages.yaml` |
| 4-inch ESP32-P4 86 Panel | `devices/esp32-p4-86/packages.yaml` |
| 4-inch 4848S040 | `devices/guition-esp32-s3-4848s040/packages.yaml` |

## ESPHome Device Builder

1. Open **Home Assistant > ESPHome Device Builder**.
2. Select **New Device**.
3. Enter a name, such as `espdesktop-kitchen`.
4. When ESPHome creates the starter YAML, replace it with the template below.
5. Change `name`, `friendly_name`, WiFi details, and the `file` line for your screen.
6. Click **Save**, then open the device menu and choose **Validate**.

```yaml
substitutions:
  name: "espdesktop-kitchen"
  friendly_name: "EspDesktop Kitchen"

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

packages:
  setup:
    url: https://github.com/jtenniswood/espdesktop/
    file: devices/guition-esp32-p4-jc1060p470/packages.yaml
    refresh: 1sec
```

If you do not use ESPHome secrets, replace the two `!secret` lines with your WiFi details:

```yaml
wifi:
  ssid: "Your WiFi Name"
  password: "Your WiFi Password"
```

## Advanced: Password-Protect the Web Page

EspDesktop's built-in web page can be protected with a username and password when you compile and install the firmware yourself. This is useful if other people can reach your local network and you do not want them opening the display setup page.

First, add these entries to your ESPHome `secrets.yaml` file:

```yaml
espdesktop_web_username: "admin"
espdesktop_web_password: "choose-a-strong-password"
```

Then point the EspDesktop web auth substitutions at those secrets and add the `web_server_auth` package to your EspDesktop device YAML:

```yaml
substitutions:
  espdesktop_web_username: !secret espdesktop_web_username
  espdesktop_web_password: !secret espdesktop_web_password

packages:
  setup:
    url: https://github.com/jtenniswood/espdesktop/
    file: devices/guition-esp32-p4-jc1060p470/packages.yaml
    refresh: 1sec
  web_server_auth:
    url: https://github.com/jtenniswood/espdesktop/
    file: common/addon/web_server_auth.yaml
    refresh: 1sec
```

After saving, validate the device and install the firmware again. The next time you open the display address in a browser, it will ask for the username and password. EspDesktop uses Digest authentication so the password is not sent directly across your network.

Safari may ask for the password repeatedly when loading card statistics or saving settings. Each protected request requires Digest authentication; the display does not use login cookies over its unencrypted HTTP connection.

If the username or password substitution is missing, ESPHome validation will fail instead of building firmware with placeholder credentials.

Use a different password for each display. For example, one display can point the substitutions at hallway secrets and another can point them at office secrets:

```yaml
substitutions:
  espdesktop_web_username: !secret espdesktop_hallway__web_username
  espdesktop_web_password: !secret espdesktop_hallway__web_password
```

This protects the local web page, but it is not a replacement for normal network security, so do not expose the display directly to the internet.

## Advanced: Ethernet Options

Some supported ESP32-P4 panels include wired Ethernet. ESPHome cannot run WiFi and Ethernet in the same firmware, so this option is Ethernet-only and is intended for manual installs.

Use this template for Ethernet-capable models. Do not add a `wifi:` block. Change the `file` line to match your screen:

| Panel | Ethernet package file |
| --- | --- |
| 7-inch JC1060P470 Ethernet model | `devices/guition-esp32-p4-jc1060p470/packages.yaml` |
| 7-inch JC1060P470 new panel Ethernet model | `devices/guition-esp32-p4-jc1060p470-v2/packages.yaml` |
| ESP32-P4 86 Panel ETH-2RO | `devices/esp32-p4-86/packages.yaml` |

```yaml
substitutions:
  name: "espdesktop-office"
  friendly_name: "EspDesktop Office"
  network_transport: ethernet
  disable_updates: "true"

packages:
  setup:
    url: https://github.com/jtenniswood/espdesktop/
    file: devices/guition-esp32-p4-jc1060p470/packages.yaml
    refresh: 1sec
```

If Ethernet is unplugged or your network does not give the display an IP address, the display will show an Ethernet setup message. It will not create a WiFi hotspot in this mode.

If you start from a copied device `esphome.yaml` starter file instead of the template above, set `network_transport: "ethernet"` in `substitutions`. Older copied starters may still contain a top-level `wifi:` block; remove that block before validating the Ethernet build.

The `disable_updates: "true"` substitution removes EspDesktop's built-in GitHub firmware update checker and update controls. ESPHome OTA stays enabled, so you can still install firmware manually once the display is online.

The Ethernet firmware is intentionally different from the normal WiFi firmware:

- It uses the panel's built-in wired Ethernet port instead of WiFi.
- It does not include WiFi, the captive portal, or the first-boot WiFi setup hotspot.
- It keeps the ESP32-C6 hosted WiFi/Bluetooth co-processor disabled because it is not needed for wired networking.
- It does not support Bluetooth proxy.
- It uses a higher backlight PWM frequency on this panel to avoid the visible shimmer that can appear when Ethernet is active.

When switching a display between WiFi firmware and Ethernet firmware, install the new firmware over USB. OTA updates can fail during this change because the currently running firmware and the new firmware use different network hardware.

To switch back to WiFi later, remove `network_transport: ethernet` from the manual Ethernet template, add your `wifi:` block again, then recompile and install the firmware over USB. If you are using the current JC1060P470 `esphome.yaml` starter file, set `network_transport: "wifi"` instead.

::: warning Keep the device name simple
Use lowercase letters, numbers, and hyphens for `name`. For example, `espdesktop-kitchen` is better than `Kitchen Touchscreen`.
:::

## Install by USB

Use this for the first install.

1. Plug the display into the computer running ESPHome, or into the Home Assistant machine if you are using the add-on.
2. In ESPHome Device Builder, open the device menu and choose **Install**.
3. Choose the USB serial option if it is available.
4. Wait for compiling and flashing to finish before unplugging the display.

If ESPHome cannot access the USB port directly, choose **Manual download** instead. For a blank screen, select the factory firmware option if ESPHome asks which format to use. Then open [ESPHome Web Tools](https://web.esphome.io/) in Chrome or Edge, connect to the display, and flash the downloaded file.

## After the Display Boots

1. Wait for the display to join WiFi.
2. Open the display address in a browser, for example `http://espdesktop.local`.
3. Configure cards, active colour, brightness, and other settings from the built-in web page.
4. Pair the EspDesktop Mac app if you want Mac controls, app icons, volume, or artwork. Local cards work without a Mac connection.

## Updating Later

Because the package uses `refresh: 1sec`, ESPHome checks GitHub for EspDesktop updates each time it compiles. To update manually, open ESPHome Device Builder and run **Install** again. If the display is online, use OTA so you do not need to reconnect USB.

Configure the display through its web page. The 4-inch 4848S040 can expose selected cards through the [Home Assistant ESPHome integration](/getting-started/home-assistant-actions).
