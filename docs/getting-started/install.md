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

Configure WiFi through the display’s setup hotspot:

1. Wait up to 90 seconds for the `EspDesktop_XXXX` hotspot shown on the display. `XXXX` is the last four MAC-address characters; custom hotspot names are preserved.
2. Connect your phone or computer to the hotspot. If its offline setup page does not open, visit the address shown on the display (normally `http://192.168.4.1`).
3. Choose your 2.4 GHz network from **Available Networks**, or enter its name manually. Enter the password and select **Save**.
4. When **WiFi details saved** appears, reconnect your phone or computer to home WiFi, then note the display's address.

Open that address in a browser to reach the display's setup page. Choose **System → Mac Companion** when pairing, then follow [Install and Pair the Mac App](/getting-started/mac-app).

## Choose Your First Cards

On an empty display, the web page offers a three-step setup:

1. Connect the Mac app, then select apps for the home screen, up to your display’s card limit.
2. Choose which supported apps should have shortcut subpages. Each page reserves one card for **Back**.
3. Choose whether shortcut pages open automatically when their app is in focus on your Mac.

Choose **Save setup**, then **Apply Configuration** in Layout to restart the display and show your cards. Keyboard shortcuts need Accessibility access in the Mac app.

**Skip setup** opens the normal editor for a custom layout. Setup completion is saved on the display, so reopening the page or using another browser does not restart it. Existing layouts are left intact. Resetting the display’s customization makes setup available again.

To run the wizard again, open **Screen → App Subpages → Set up home-screen apps**. It selects your current apps and shortcut-page choices. **Cancel** leaves the layout untouched; **Replace layout** replaces the home-screen cards and their shortcut pages, keeping other display settings.

You can change apps and shortcut pages later in **Layout**, and automatic switching in **Screen → App Subpages**.

## Next

- [Install and pair the Mac app](/getting-started/mac-app)
- [Explore Mac Controls](/card-types/companion)
- [Configure your control surface](/features/setup)
- For Home Assistant panels and controls, use the [EspControl documentation](https://jtenniswood.github.io/espcontrol/). For an ESP32-P4 panel running EspControl, see its [C6 WiFi recovery guide](https://jtenniswood.github.io/espcontrol/getting-started/c6-recovery).
