---
title: Install EspDesktop on the 4848S040
description: Flash the EspDesktop firmware to the supported 4-inch Guition 4848S040 and connect it to WiFi.
next: false
---

# Install EspDesktop on the 4848S040

Install EspDesktop on the **4-inch Guition ESP32-S3 4848S040** and connect the display to WiFi.

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

Configure WiFi through the display’s setup hotspot:

1. Wait up to 90 seconds for the `EspDesktop_XXXX` hotspot shown on the display. `XXXX` is the last four MAC-address characters; custom hotspot names are preserved.
2. Connect your phone or computer to the hotspot. If its offline setup page does not open, visit the address shown on the display (normally `http://192.168.4.1`).
3. Choose your 2.4 GHz network from **Available Networks**, or enter its name manually. Enter the password and select **Save**.
4. When **WiFi details saved** appears, reconnect your phone or computer to home WiFi, then note the display's address.

## Next

[Download and install the Mac app](/getting-started/mac-app)
