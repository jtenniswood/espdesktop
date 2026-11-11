---
title: Touchscreen Compatibility and Setup FAQ
description: Find out which touchscreen and macOS versions work with EspDesktop, how local pairing works, and what permissions Mac controls need.
outline: [2, 3]
---

# Mac Control FAQ

## Setup and Pairing

### Which display works with Mac controls?

Mac Companion currently works with the **4-inch Guition ESP32-S3 4848S040**. See [Supported Display](/screens/4848s040) for the model and [Install](/getting-started/install) for the firmware steps.

### Which macOS versions does EspDesktop support?

The EspDesktop Mac app requires **macOS 13 or newer**. Follow the [Mac app setup guide](/getting-started/mac-app) to download it and pair your display.

### Does EspDesktop need Home Assistant?

EspDesktop connects the touchscreen directly to the Mac Companion app over your local network. For a touchscreen that controls Home Assistant devices, see the [EspControl docs](https://jtenniswood.github.io/espcontrol/).

### Why can't I see my display in the Mac app?

Confirm that the Mac and display are on the same local network and allow EspDesktop local-network access if macOS asks. Some guest WiFi or network-isolation settings prevent discovery. Choose **Enter address manually** in the app and enter the display's IP address or `.local` name if needed.

### Do the Mac app and display firmware need to match?

Use the Mac app and display firmware from the same EspDesktop release. A newer development build may use Companion features that an older release app does not understand.

## Mac Controls

### Why don't keyboard shortcuts work?

Enable EspDesktop in **System Settings → Privacy & Security → Accessibility**. See [Mac Companion permissions](/mac-controls/security) for the controls that use it.

### Why can't the display open an app or folder?

The app or folder must be approved in EspDesktop. Open **Apps** or **Folders** in the Mac app and confirm the item is still available. Removing it from the app disables its associated cards.

### How do I replace a display or reset pairing?

Choose **Forget Display** in the Mac app, then reset pairing from **System → Mac Companion** on the display. Pair the replacement using its new temporary code.

## More Help

See [Troubleshooting](/getting-started/troubleshooting) or [report a problem](https://github.com/jtenniswood/espdesktop/issues).
