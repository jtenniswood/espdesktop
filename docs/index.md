---
title: EspDesktop — Touch Controls for Your Mac
titleTemplate: :title
description: "Pair a 4-inch ESP32 touchscreen with the EspDesktop Mac app to launch apps, run shortcuts, manage windows, adjust volume, and view Mac status."
---

# EspDesktop

**A small touchscreen for the things you do on your Mac.**

EspDesktop pairs the **4-inch Guition 4848S040** with a native macOS menu-bar app. Build a personal control surface to launch approved apps, open folders and websites, run keyboard shortcuts, arrange windows, adjust volume, and see Mac status.

Start with [the supported display](/screens/4848s040), then [install the firmware](/getting-started/install) and [pair the Mac app](/getting-started/mac-app).

## What You Can Control

- **Apps and folders** — launch approved Mac applications and open Finder folders you've chosen.
- **Shortcuts and windows** — replay keyboard shortcuts and control or arrange the active window.
- **Websites** — open approved `http://` and `https://` links in an app you choose.
- **Volume** — adjust the selected Mac speaker or microphone.
- **Mac status** — show processor, memory, storage, network, battery, and IP address.

Organise controls into subpages using the display's built-in setup page. No Home Assistant account is needed for Mac controls.

## Get Started

1. Install EspDesktop firmware on a 4848S040 display and connect it to WiFi.
2. Install the EspDesktop app on a Mac running macOS 13 or newer.
3. Pair the app and display on the same local network.
4. Approve the apps and folders the display may use, then add Mac cards.

Keyboard shortcuts and window controls need macOS Accessibility permission. Window tiling and arrangement need macOS 15 or newer.

## Home Assistant

Looking for lights, media players, sensors, or other Home Assistant controls? See the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).
