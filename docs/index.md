---
title: EspDesktop — Touch Controls for Your Mac
titleTemplate: :title
description: "Pair a 4-inch ESP32 touchscreen with the EspDesktop Mac app to launch apps, open folders and websites, and run shortcuts."
---

# EspDesktop

**A small touchscreen for the things you do on your Mac.**

EspDesktop pairs one Mac with a [4-inch Guition 4848S040 touchscreen](/screens/4848s040) using a menu-bar app.

## Where to Buy

- [Guition 4848S040 on AliExpress](https://s.click.aliexpress.com/e/_c3sIhvBv) has a guide price of about £20. The current price and shipping depend on the listing.
- [3D-printable case stand on MakerWorld](https://makerworld.com/en/models/2581572-guition-esp32s3-4848s040-case-stand#profileId-2847301) fits this display.

## Get Started

1. [Install the display firmware](/getting-started/install) and connect the display to WiFi.
2. [Install and pair the EspDesktop Mac app](/getting-started/mac-app) on macOS 13 or newer. Keep both devices on the same local network.
3. Open the display’s web page, select an empty tile, then choose **Companion** to [add a Mac control](/features/setup#add-a-mac-control).

## What You Can Control

These controls are available in stable [EspDesktop v1.2.0](https://github.com/jtenniswood/espdesktop/releases/tag/v1.2.0), the release this guide uses. Check the installed version in the display’s **System → System → Firmware** section or the Mac app’s **Updates** tab.

- [Launch apps and open websites](/mac-controls/apps).
- [Open Finder folders](/mac-controls/folders) you’ve chosen in the Mac app.
- [Run keyboard shortcuts](/mac-controls/shortcuts) from the touchscreen.
- Lock your Mac with **Companion → Local Machine** in v1.2.0. Development builds call this card **Lock Machine**. You can customise its label, icon and colours in the card editor.
- Show a Mac statistic on a [**Companion Stat** subpage tile](/features/subpages#mac-statistics).

Keyboard shortcuts and Mac Lock need [Accessibility permission](/mac-controls/security).

You can group controls into [subpages](/features/subpages) and [configure the display](/features/setup), including brightness, appearance, sleep, backups and updates.

### Preview features

Window Control cards are available only in development builds that enable the preview. For progress, see the [Window Control issue](https://github.com/jtenniswood/espdesktop/issues/309).
