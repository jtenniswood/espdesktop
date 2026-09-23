---
title: Install EspDesktop on the 4848S040
description: Flash the EspDesktop firmware to the supported 4-inch Guition 4848S040, connect it to WiFi, then pair the Mac app.
---

# Install EspDesktop on the 4848S040

Mac control currently requires the **4-inch Guition ESP32-S3 4848S040**. This guide installs the display firmware; next, install and pair the [EspDesktop Mac app](/getting-started/mac-app).

## Before You Start

- Use Chrome or Edge on a desktop computer.
- Have a USB-C **data** cable and your 2.4 GHz WiFi name and password ready.
- Keep the display and Mac on the same local network.

## Flash the Firmware

Connect the display to your computer with the USB-C cable, then choose **Install EspDesktop** below. When asked, select the serial port that appeared when you plugged in the display.

<!--@include: ../generated/screens/4848s040-install.md-->

Wait for the flash to finish before disconnecting the cable. The display restarts when installation is complete.

::: tip If no device appears
Try another USB-C cable. Some cables only provide power; the first install needs a data-capable cable. Chrome or Edge may also ask you to allow access to the serial device.
:::

## Connect the Display to WiFi

1. Wait for the display's setup hotspot to appear. This can take up to 90 seconds.
2. Connect your phone or computer to the hotspot. If its setup page does not open, visit `http://192.168.4.1`.
3. Select your 2.4 GHz WiFi network and enter its password.
4. When the display reconnects, note the address shown on screen.

Open that address in a browser to reach the display's setup page. Choose **Connectors → Mac Companion** when pairing, then follow [Install and Pair the Mac App](/getting-started/mac-app).

## Next

- [Install and pair the Mac app](/getting-started/mac-app)
- [Build Mac control cards](/card-types/companion)
- [Configure your control surface](/features/setup)
- If a supported ESP32-P4 display cannot join WiFi, follow the [C6 WiFi recovery guide](https://jtenniswood.github.io/espcontrol/getting-started/c6-recovery).
- For Home Assistant panels and controls, use the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).
