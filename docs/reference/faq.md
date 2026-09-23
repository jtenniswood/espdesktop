---
title: EspDesktop Mac Control FAQ
description: Answers about installing the EspDesktop Mac app, pairing a display, permissions, controls, and media support.
outline: [2, 3]
---

# Mac Control FAQ

## Setup and Pairing

### Which display works with Mac controls?

Mac Companion currently works with the **4-inch Guition ESP32-S3 4848S040**. See [Supported Display](/screens/4848s040) for the model and [Install](/getting-started/install) for the firmware steps.

### Do I need Home Assistant?

No. The EspDesktop Mac app and Mac Companion connector provide the controls described on this site. For Home Assistant panels and smart-home controls, use the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).

### Why can't I see my display in the Mac app?

Confirm that the Mac and display are on the same local network and allow EspDesktop local-network access if macOS asks. Some guest WiFi or network-isolation settings prevent discovery. Choose **Enter address manually** in the app and enter the display's IP address or `.local` name if needed.

### Do the Mac app and display firmware need to match?

Use the Mac app and display firmware from the same EspDesktop release. A newer development build may use Companion features that an older release app does not understand.

## Mac Controls

### Why don't keyboard shortcuts or window controls work?

Enable EspDesktop in **System Settings → Privacy & Security → Accessibility**. The app must have permission for keyboard shortcuts and window actions. Window tiling and arrangement require macOS 15 or newer.

### Why can't the display open an app or folder?

The app or folder must be approved in EspDesktop. Open **Applications** or **Folders** in the Mac app and confirm the item is still available. Removing it from the app disables its associated cards.

### How do I replace a display or reset pairing?

Choose **Forget Display** in the Mac app, then reset pairing from **Connectors → Mac Companion** on the display. Pair the replacement using its new temporary code.

## More Help

See [Troubleshooting](/getting-started/troubleshooting) or [report a problem](https://github.com/jtenniswood/espdesktop/issues). For Home Assistant content, visit [EspControl docs](https://jtenniswood.github.io/espcontrol/).
