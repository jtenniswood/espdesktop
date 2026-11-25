---
title: Touchscreen Compatibility and Setup FAQ
description: Find out which touchscreen and macOS versions work with EspDesktop, how local pairing works, and what permissions Mac controls need.
outline: [2, 3]
---

# Mac control FAQ

## Setup and pairing

### Which display works with Mac controls?

Mac Companion is available on the **4-inch Guition ESP32-S3 4848S040** with public firmware and the **7-inch Guition JC1060P470 V3** with test firmware. [Compare the two sizes before buying](/getting-started/choose-a-display).

### Which Macs does EspDesktop support? {#which-macos-versions-does-espdesktop-support}

The EspDesktop Mac app requires **Apple silicon and macOS 13 or newer**. Intel Macs are unsupported, including 2019 Intel MacBook Pro and iMac models. Follow the [Mac app setup guide](/screens/4848s040#download) to download it and pair your display.

### Does EspDesktop need Home Assistant?

EspDesktop runs Mac controls without Home Assistant. With the standard firmware, connect the display to 2.4 GHz Wi-Fi on the same local network as your Mac. Compatible development builds also support direct USB control. See [Display connections (USB & IP)](/settings/display-connections). For a touchscreen that controls Home Assistant devices, see the [EspDesktop and EspControl comparison](/reference/espdesktop-or-espcontrol).

### Can I use EspDesktop over USB without Wi-Fi?

Yes, with compatible development builds of the Mac app and display firmware. You can use Mac controls and edit the display’s layout over a USB data cable with Wi-Fi off. [Connect over USB](/settings/display-connections#connect-over-usb).

### Can I use several EspDesktop displays with one Mac?

EspDesktop v1.2.6 supports multiple Guition 4848S040 displays connected to one Mac. Open **Settings → Displays → Add Display** and pair each one with its own code. You can connect or disconnect one display while the others stay available. See [Mac app settings](/settings/mac-app).

### Why can't I see my display in the Mac app?

Confirm that the Mac and display are on the same local network and allow EspDesktop local-network access if macOS asks. Some guest WiFi or network-isolation settings prevent discovery. See [how to enter the display’s IP address or local name](/settings/display-connections#connect-over-your-local-network).

### Do the Mac app and display firmware need to match?

Use the Mac app and display firmware from the same EspDesktop release. A newer development build may use Companion features that an older release app does not understand.

## Mac controls

### Why don't keyboard shortcuts work?

Enable EspDesktop in **System Settings → Privacy & Security → Accessibility**. See [Mac Companion permissions](/mac-controls/security) for the controls that use it.

### Why can't the display open an app or folder?

The app or folder must be approved in EspDesktop. Open **Apps** or **Folders** in the Mac app and confirm the item is still available. Removing it from the app disables its associated cards.

### How do I replace a display or reset pairing?

In **Settings → Displays**, choose **Forget** beside the display you’re replacing. To reuse a previously paired display, tap **Paired** in the touchscreen’s Settings and confirm **Reset pairing**. Enter the new code in the Mac app.

## More help

See [Troubleshooting](/getting-started/troubleshooting) or [report a problem](https://github.com/jtenniswood/espdesktop/issues).
