---
title: Troubleshoot Mac Controls
description: Resolve common EspDesktop Mac app pairing, network, permissions, and control issues.
---

# Troubleshoot Mac Controls

## The Display Does Not Appear in EspDesktop

- Confirm the display and Mac are connected to the same local network.
- Allow local-network access for EspDesktop if macOS requested it.
- Check that guest WiFi or router client isolation is not separating devices.
- In the Mac app, choose **Enter address manually** and enter the display's IP address or `.local` name.

Discovery only locates a display; it does not configure its WiFi. For a first-time firmware install, follow [Install EspDesktop](/getting-started/install).

## The Display Will Not Pair

Open **Connectors → Mac Companion** on the display to show a fresh code. Enter it in the Mac app before it expires (after 15 minutes). If this display was paired previously, choose **Forget Display** in the app and reset its pairing from the connector page before trying again.

The Mac stores its credential in Keychain and checks the paired display certificate. If the certificate changed, forget the display and pair again rather than accepting the change silently.

If the Mac app asks you to unlock your Mac or allow Keychain access, do that first, then choose **Retry** on the **Display** tab.

## A Card Does Not Work

- **App or folder:** confirm it is still approved in the Mac app's **Applications** or **Folders** page.
- **Keyboard shortcut or window:** enable EspDesktop under **System Settings → Privacy & Security → Accessibility**.
- **Window arrangement:** requires macOS 15 or newer; some applications do not support every window action.
- **Statistics:** the Mac app must be connected and sharing Mac readings.

For the control's exact requirements, see [Mac Controls](/card-types/companion).

## A Mac App or Display Update Breaks Compatibility

Install the Mac app and display firmware from the same EspDesktop release. If you are testing a development build, use the matching display firmware as well. See [Companion Compatibility](/reference/companion-compatibility).

## Still Stuck?

Open **Support** in the Mac app or [report an issue](https://github.com/jtenniswood/espdesktop/issues). For Home Assistant touchscreen help, use the [EspControl docs](https://jtenniswood.github.io/espcontrol/).

## WiFi setup and reset recovery

The `EspDesktop_XXXX` setup hotspot can take up to 90 seconds to appear. Connect to the hotspot named on the display and open its shown address if the offline setup page does not open automatically. A custom hotspot name or address is preserved. After **WiFi details saved**, reconnect your phone or computer to home WiFi and follow the display's instructions. USB Improv provisioning is also available after installation.

Save a backup before using **Settings → System → Factory Reset**. Partial reset retains WiFi, the Home Assistant connection and Mac pairing. Complete reset requires typing **RESET**, erases saved WiFi and the Home Assistant API key, and requires pairing the Mac again. It disables WiFi networks compiled into the firmware so newly provisioned credentials remain selected after reboot. Installed firmware remains in place.
