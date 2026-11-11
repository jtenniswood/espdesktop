---
title: Install EspDesktop Firmware on the Guition 4848S040
description: Flash your Guition ESP32-S3 4848S040 from Chrome or Edge using a USB-C data cable, then connect the EspDesktop touchscreen to 2.4 GHz WiFi.
next: false
---

# Install EspDesktop on the 4848S040

Install EspDesktop on the [4-inch Guition ESP32-S3 4848S040](/screens/4848s040).

## Get Started

1. [Install the display firmware](#flash-the-firmware), then [connect the touchscreen to WiFi](#connect-the-display-to-wifi).
2. [Install and pair the EspDesktop menu-bar app](/getting-started/mac-app) using the code shown in the display’s settings.
3. Use the setup wizard to pick your first apps, or [build your own layout](/features/setup#add-a-mac-control) in the display’s browser editor.

You choose which apps and folders the display can open. Keyboard shortcuts and Mac Lock use macOS Accessibility access. [How pairing and permissions work](/mac-controls/security)

## Before You Start

- Use Chrome or Edge on a desktop computer.
- Have a USB-C **data** cable and your 2.4 GHz WiFi name and password ready.
- Keep the display and a Mac running macOS 13 or newer on the same local network.

## Flash the Firmware

Connect the display to your computer with the USB-C cable, then choose **Install EspDesktop** below. When asked, select the serial port that appeared when you plugged in the display.

<!--@include: ../generated/screens/4848s040-install.md-->

Wait for the flash to finish before disconnecting the cable. The display restarts when installation is complete.

::: tip If no device appears
Try another USB-C cable. Some cables only provide power; the first install needs a data-capable cable. Chrome or Edge may also ask you to allow access to the serial device.
:::

## Connect the Display to WiFi

Configure WiFi through the display’s setup hotspot:

1. Wait up to 90 seconds for the `EspDesktop_XXXX` hotspot shown on the display. `XXXX` is the last four MAC-address characters; custom hotspot names are preserved.
2. Connect your phone or computer to the hotspot. If its offline setup page does not open, visit the address shown on the display (normally `http://192.168.4.1`).
3. Choose your 2.4 GHz network from **Available Networks**, or enter its name manually. Enter the password and select **Save**.
4. When **WiFi details saved** appears, reconnect your phone or computer to home WiFi, then note the display's address.

## Next

[Download and install the Mac app](/getting-started/mac-app)
