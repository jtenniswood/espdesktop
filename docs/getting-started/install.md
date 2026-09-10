---
title: Install EspDesktop Firmware
description:
  How to flash EspDesktop firmware to a supported ESP32 touchscreen, connect it to WiFi, and pair the Mac app.
---

# Install

Flash the EspDesktop firmware to your supported ESP32 display directly from your browser — no special software or technical knowledge required.

::: tip Prefer ESPHome?
If you want to compile and install the firmware yourself, use the [Manual Setup guide](/getting-started/manual-esphome-setup).
:::

## Flash the Firmware

Connect the display to your computer with the USB-C cable, choose your panel, then click the install button.

<EspInstallSelector />

## Having Unreliable Wifi on a P4 Panel?

P4 panels use a separate ESP32-C6 Wifi processor. If a P4 panel repeatedly
disconnects, disappears from your network, cannot finish initial setup, or reports
C6 update timeouts, use the [C6 Wifi recovery installer](/getting-started/c6-recovery).
It repairs the C6 over USB without requiring a working network connection.

This recovery does not apply to the ESP32-S3 4848S040 panel.

::: tip Which cable?
If the install button doesn't detect your device, try a different USB-C cable. Charge-only cables (often thinner and cheaper) won't work — you need one that supports data transfer.
:::

### Step by Step

1. **Plug in the display** using the USB-C cable. If your computer asks to install drivers, allow it.
2. **Choose your panel** above, then click **Install EspDesktop**. A dialog will ask you to choose a serial port — select the one that appeared when you plugged in the display.
3. **Wait for the flash to complete.** This takes a few minutes. You'll see a progress bar. Don't disconnect the cable until it finishes.
4. **The display restarts** and shows a loading screen.

## Connect to WiFi

After flashing, the display needs to connect to your WiFi network.

1. **The display creates a hotspot.** It can take up to **90 seconds** to appear. Connect to it from your phone or laptop.
2. **A setup page opens automatically** (captive portal). If it doesn't, open a browser and go to `192.168.4.1`.
3. **Choose your WiFi network** from the list and enter your password.
4. **The display reconnects** and shows a loading screen while it joins your network. Once connected, the screen will show your device's address (something like `192.168.1.xxx`).

::: tip If the hotspot doesn't appear
Power-cycle the display by unplugging and re-plugging the USB-C cable. The hotspot only appears when the display can't connect to a saved WiFi network, and it may take up to **90 seconds** after startup or a WiFi outage.
:::

## Pair and Configure

Open the display's address in a browser. In **Settings**, the expanded **Mac Companion** box appears first. Follow [Mac App](/getting-started/mac-app) to pair the 4848S040 with your Mac.

Use **Screen** to add [cards](/card-types/) and **Settings** to adjust display preferences. Apply the configuration when prompted.

::: warning Development builds
PR #55 changes the feature set described here. Its firmware cleanup and device validation are incomplete; do not flash that branch yet. The installer above uses published release artifacts, which may differ from this development documentation.
:::

Continue with [Screen Setup](/features/setup) or [Troubleshooting](/getting-started/troubleshooting).
