---
title: Touchscreen Compatibility and Setup FAQ
description: Find out which touchscreens, Macs, and Windows PCs work with EspDesktop, how local pairing works, and what permissions controls need.
outline: [2, 3]
---

# EspDesktop setup and controls FAQ

## Setup and pairing

### Which display can I pair with EspDesktop? {#which-display-works-with-mac-controls}

The macOS and Windows companion apps support the **4-inch Guition ESP32-S3 4848S040**. See [Supported Display](/screens/4848s040) for the model and [Install](/screens/4848s040#install) for the firmware steps.

### Which Macs does EspDesktop support? {#which-macos-versions-does-espdesktop-support}

The EspDesktop Mac app requires **Apple silicon and macOS 13 or newer**. Intel Macs are unsupported, including 2019 Intel MacBook Pro and iMac models. Follow the [Mac app setup guide](/macos) to download it and pair your display.

### Which Windows PCs does EspDesktop support?

EspDesktop for Windows supports Intel, AMD, and Arm PCs. See the [Windows setup guide](/windows) for installer and pairing steps.

### Does EspDesktop need Home Assistant?

EspDesktop’s computer controls work independently of Home Assistant. With the standard firmware, connect the display to 2.4 GHz Wi-Fi on the same local network as your computer. Compatible macOS development builds also support direct USB control. See [Display connections (USB & IP)](/settings/display-connections). For a touchscreen that controls Home Assistant devices, see the [EspDesktop and EspControl comparison](/reference/espdesktop-or-espcontrol).

### Can I use EspDesktop over USB without Wi-Fi?

Yes, with compatible development builds of the Mac app and display firmware. You can use Mac controls and edit the display’s layout over a USB data cable with Wi-Fi off. [Connect over USB](/settings/display-connections#connect-over-usb).

### Can I use several EspDesktop displays with one Mac?

EspDesktop v1.2.6 supports multiple Guition 4848S040 displays connected to one Mac. Open **Settings → Displays → Add Display** and pair each one with its own code. You can connect or disconnect one display while the others stay available. See [Mac app settings](/settings/mac-app).

### Why can't EspDesktop see my display? {#why-can-t-i-see-my-display-in-the-mac-app}

Confirm that your computer and display are on the same local network. Some guest Wi-Fi networks prevent connected devices from finding each other. On macOS, allow Local Network access when prompted. On either platform, use **Enter address manually** to add the display by IP address. [Troubleshoot discovery](/getting-started/troubleshooting#the-display-does-not-appear-in-espdesktop).

### Do the Mac app and display firmware need to match?

Use the Mac app and display firmware from the same EspDesktop release. A newer development build may use Companion features that an older release app does not understand.

## Touchscreen controls {#mac-controls}

### Why don't keyboard shortcuts work?

On macOS, enable EspDesktop in **System Settings → Privacy & Security → Accessibility**. On Windows, turn on **Allow keyboard shortcuts and screen lock** under **Display → Windows integration** in EspDesktop. [Keyboard shortcut setup](/mac-controls/shortcuts#enable-keyboard-shortcuts).

### Why can't the display open an app or folder?

The app or folder must be approved in EspDesktop. Open **Apps** or **Folders** in EspDesktop and confirm the item is still available. Removing it from the app disables its associated cards.

### How do I replace a display or reset pairing?

Choose **Forget** under **Settings → Displays** on macOS or **Forget display** under **Display** on Windows. To reuse a paired display, tap **Paired** in the touchscreen’s Settings and confirm **Reset pairing**. Enter the new code in EspDesktop.

## More help

See [Troubleshooting](/getting-started/troubleshooting) or [report a problem](https://github.com/jtenniswood/espdesktop/issues).
