---
title: EspDesktop vs EspControl on the 4848S040
description: Choose Guition 4848S040 firmware for Mac and Windows controls or a Home Assistant dashboard.
---

# EspDesktop or EspControl for the Guition 4848S040?

Choose **EspDesktop** to control a Mac or Windows PC. Choose **EspControl** to control Home Assistant devices from the touchscreen. Each project has its own firmware installer for the 4-inch Guition ESP32-S3 4848S040.

| I want to… | Project and setup |
| --- | --- |
| Launch apps, open folders or websites, run keyboard shortcuts or lock the computer | **EspDesktop**. Follow the [macOS setup](/screens/4848s040#setup-on-macos) or [Windows 11 setup](/windows-preview) guide. |
| Trigger a saved EspDesktop action from a Home Assistant automation | **EspDesktop**. [Enable the ESPHome integration for your display](/getting-started/home-assistant-actions). |
| Toggle lights, run Home Assistant scripts or see sensor readings on a touchscreen | **EspControl**. Use the [4848S040 Home Assistant setup guide](https://jtenniswood.github.io/espcontrol/screens/4848s040). |

<span id="what-do-i-need-for-mac-control"></span>

## What do I need for computer control?

Pair the display with the EspDesktop app on your local network. The 4848S040 connects to 2.4 GHz Wi-Fi. The Mac app requires Apple silicon and macOS 13 or newer. The Windows preview requires Windows 11.

## What do I need for Home Assistant control?

EspControl connects to Home Assistant through the ESPHome integration. Follow the [EspControl Home Assistant actions guide](https://jtenniswood.github.io/espcontrol/getting-started/home-assistant-actions) to allow the display to control devices after it has been added. EspControl also lists [other supported screens](https://jtenniswood.github.io/espcontrol/screens/).

## Already installed the other firmware?

Use the installation guide for the project you want to switch to. Before replacing the firmware, save any layout you want to keep using that project's backup procedure. Set up the display again after switching and keep backups with the project that made them.

If you are choosing a Mac desk controller, [compare touchscreen and physical-key options](/reference/mac-touchscreen-controller).
