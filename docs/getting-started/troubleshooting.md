---
title: Troubleshoot Mac Controls
description: Resolve common EspDesktop Mac app pairing, network, permissions, and control issues.
---

# Troubleshoot Mac controls

## The display does not appear in EspDesktop

- Confirm the display and Mac are connected to the same local network.
- Allow local-network access for EspDesktop if macOS requested it.
- Check that guest WiFi or router client isolation is not separating devices.
- In the Mac app, choose **Enter address manually** and enter the display's IP address or `.local` name.

Discovery only locates a display; it does not configure its WiFi. For a first-time firmware install, follow [Install EspDesktop](/screens/4848s040#install).

## The display will not pair

Select the display in the Mac app and click **Continue** to open its pairing page in your browser. Enter the code from that page in the Mac app before it expires (after 15 minutes). If this display was paired previously, choose **Forget** beside it in **Mac Settings → Displays** and reset its pairing from the connector page before trying again.

<a href="/images/mac-companion-enter-pairing-code.png"><img src="/images/mac-companion-enter-pairing-code.png" alt="Mac Companion app showing the empty fields for entering the display’s pairing code" width="1224" height="1600" loading="lazy"></a>

The Mac stores its credential in Keychain and checks the paired display certificate. If the certificate changed, forget the display and pair again rather than accepting the change silently.

If the Mac app asks you to unlock your Mac or allow Keychain access, do that first, then choose **Retry** on the **Display** tab.

If you have one display paired, **Support → Restart Setup** clears its pairing and takes you through first-run setup again. With several displays paired, use **Forget** and **Add Display** on the **Displays** page to set up one display again. Your app and folder choices are kept.

## A card does not work

- **App or folder:** confirm it is still approved in the Mac app’s **Apps** or **Folders** page.
- **Keyboard shortcut or Mac Lock:** enable EspDesktop under **System Settings → Privacy & Security → Accessibility**. If these cards stopped working after replacing the app, remove the old EspDesktop entry and add the installed app again.

If an older card is marked unavailable, replace or remove it in the web editor. EspDesktop keeps the card’s settings in saved layouts and backups so you can identify it.

For the control's exact requirements, see [Mac Controls](/#what-you-can-control).

## The touchscreen says to unlock your Mac

Unlock the paired Mac and make sure EspDesktop is running and connected. If the connection was lost while your Mac was locked, the display unlocks after the app reconnects and reports that your Mac is unlocked.

## A Mac app or display update breaks compatibility

Install the Mac app and display firmware from the same EspDesktop release. If you are testing a development build, use the matching display firmware as well. See [Companion Compatibility](/reference/companion-compatibility).

## WiFi setup and reset recovery

The `EspDesktop_XXXX` setup hotspot can take up to 90 seconds to appear. Connect to the hotspot named on the display and open its shown address if the offline setup page does not open automatically. A custom hotspot name or address is preserved. After **WiFi details saved**, reconnect your phone or computer to home WiFi and follow the display's instructions. USB Improv provisioning is also available after installation.

<img src="/images/device-setup-wifi-screen.jpg" alt="EspDesktop touchscreen showing the Wi-Fi setup hotspot name and browser address" width="2803" height="2803" loading="lazy">

If an ESP32-P4 panel running EspControl can’t join WiFi, see the [C6 WiFi recovery guide](https://jtenniswood.github.io/espcontrol/getting-started/c6-recovery).

[Save a backup](/settings/backup#export-a-backup) before using **System → System → Factory Reset**. Partial reset retains WiFi and Mac pairing. Complete reset requires typing **RESET**, erases saved WiFi and Mac pairing, and requires pairing the Mac again. It disables WiFi networks compiled into the firmware so newly provisioned credentials remain selected after reboot. Installed firmware remains in place.

## Still stuck?

Open **Support** in the Mac app or [report an issue](https://github.com/jtenniswood/espdesktop/issues).
