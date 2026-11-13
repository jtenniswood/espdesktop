---
title: EspDesktop vs EspControl on the 4848S040
description: Choose the correct Guition 4848S040 firmware for Mac app shortcuts or Home Assistant controls.
---

# EspDesktop or EspControl for the Guition 4848S040?

Choose **EspDesktop** to control a Mac. Choose **EspControl** to control Home Assistant. Both projects have setup guides for the 4-inch Guition ESP32-S3 4848S040, and each has its own firmware installer.

| I want to… | Project and setup |
| --- | --- |
| Launch Mac apps, open folders or websites, run keyboard shortcuts or lock the Mac | **EspDesktop**. Use the [4848S040 Mac setup guide](/screens/4848s040) and pair the free Mac app. |
| Toggle lights, run Home Assistant scripts or see sensor readings on a touchscreen | **EspControl**. Use the [4848S040 Home Assistant setup guide](https://jtenniswood.github.io/espcontrol/screens/4848s040). |

## What do I need for Mac control?

EspDesktop pairs directly with its Mac app on the local network. The Mac must have Apple silicon and run macOS 13 or newer. The 4848S040 connects to 2.4 GHz Wi-Fi. Mac control works without a Home Assistant installation.

## What do I need for Home Assistant control?

EspControl connects to Home Assistant through the ESPHome integration. Follow the [EspControl Home Assistant actions guide](https://jtenniswood.github.io/espcontrol/getting-started/home-assistant-actions) to allow the display to control devices after it has been added. EspControl also lists [other supported screens](https://jtenniswood.github.io/espcontrol/screens/).

## Already installed the other firmware?

Use the installation guide for the project you want to switch to. Before replacing the firmware, save any layout you want to keep using that project's backup procedure. Set up the display again after switching and keep backups with the project that made them.

If you are choosing a Mac desk controller, [compare touchscreen and physical-key options](/reference/mac-touchscreen-controller).
