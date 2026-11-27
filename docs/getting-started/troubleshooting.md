---
title: Fix USB, Wi-Fi and Companion pairing problems
description: Fix a missing USB port, Wi-Fi setup hotspot, pairing error or unresponsive keyboard shortcut on the EspDesktop 4848S040.
---

# Troubleshoot EspDesktop setup and controls {#troubleshoot-mac-controls}

Find the symptom you see on your 4848S040 or computer.

| What you see | First check |
| --- | --- |
| [The installer shows no USB port](#no-usb-port-appears) | Try a USB-C cable that carries data. |
| [The firmware installer will not load](#the-firmware-installer-will-not-load) | Open the installer in desktop Chrome or Edge. |
| [The Wi-Fi hotspot does not appear](#wifi-setup-and-reset-recovery) | Give the display up to 90 seconds and check the network name shown on the screen. |
| [EspDesktop cannot find the display](#the-display-does-not-appear-in-espdesktop) | Check that the computer and display are on the same local network. |
| [The display appears but will not pair](#the-display-will-not-pair) | Check for the code or a reset prompt on the touchscreen. |
| [Keyboard shortcuts or Lock Machine do nothing](#a-card-does-not-work) | Check the shortcut permission for your platform. |

## No USB port appears

1. Connect the 4848S040 directly to the computer with a known USB-C data cable. Try another cable or USB port if needed.
2. In desktop Chrome or Edge, open [the EspDesktop installer](/screens/4848s040#flash-the-firmware) and select **Install EspDesktop**.
3. Pick the port that appeared when you connected the display. If you cannot identify it before flashing starts, cancel and compare the port list with the display disconnected.

The port should appear in the browser's device picker before you start flashing.

## The firmware installer will not load

| Installer message | What to do |
| --- | --- |
| **Your browser does not support WebSerial. Use Chrome or Edge on desktop.** | Reopen the guide in desktop Chrome or Edge. |
| **Could not check for WebInstall firmware. Check your connection.** | Check your internet connection, then choose **Try again**. |
| **Could not check for WebInstall firmware (HTTP …).** | Retry once and check whether the [latest stable release](https://github.com/jtenniswood/espdesktop/releases/latest) lists 4848S040 firmware assets. Include the HTTP status if you report the problem. |
| **Browser-installable firmware for this display has not been published yet.** | The installer could not find its firmware manifest. Check the official releases for 4848S040 assets. If a stable release contains them, report the message and release version so the hosted installer can be checked. |
| **Failed to load the USB installer.** | Reload in a current Chrome or Edge window. If the message returns, include the full message and browser version when reporting it. |

A working installer shows an **Install EspDesktop** button and opens the USB port picker when selected.

## The display does not appear in EspDesktop

On Windows, open **Display** and choose **Enter address manually**. Enter the IP address shown on the touchscreen. [Windows pairing steps](#windows-pairing).

- Confirm the display and Mac are connected to the same local network.
- Allow local-network access for EspDesktop if macOS requested it.
- Check that guest WiFi or router client isolation is not separating devices.
- In the Mac app, choose **Enter address manually** and enter the display's IP address or `.local` name.

Discovery only locates a display; it does not configure its WiFi. For a first-time firmware install, follow [Install EspDesktop](/screens/4848s040#install).

## The display will not pair

For Windows, see [Windows pairing](#windows-pairing).

On macOS, follow these steps.

Select the display in the Mac app and choose **Continue**. Enter the four letters shown on the touchscreen and choose **Connect**. If the code screen is closed, tap **Pair** on the display’s Setup screen or **Unpaired** in its Settings. You can also choose **Open pairing webpage**, then **Copy** and paste the code into the Mac app.

If the touchscreen asks **Reset pairing?**, confirm to replace the display’s saved pairing. If the Mac shows **Pairing Required**, open **Settings → Displays**, choose **Re-pair** beside the display, and enter the current code. The code stays valid until pairing succeeds.

<a href="/images/mac-companion-enter-pairing-code.png"><picture><source type="image/avif" srcset="/images/mac-companion-enter-pairing-code-480.avif 480w, /images/mac-companion-enter-pairing-code-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/mac-companion-enter-pairing-code.png" alt="EspDesktop Mac app with four pairing code boxes, a Connect button, and the Open pairing webpage link" width="1224" height="1600" loading="lazy"></picture></a>

The Mac stores its credential in Keychain and checks the paired display certificate. If the certificate changed, forget the display and pair again rather than accepting the change silently.

| Pairing message | What to do |
| --- | --- |
| **Could not open the display pairing page.** | Confirm the display is on the same local network as your Mac. If the app still cannot open the page, go back and enter the display’s current IP address or `.local` name. |
| **Enter the pairing code shown on the display.** | Enter the code from the touchscreen or use **Open pairing webpage** to copy the code, then select **Connect**. |
| **Unlock your Mac and allow EspDesktop to access Keychain, then try again.** | Unlock the Mac and allow Keychain access if prompted. Return to the pairing code step and select **Connect** again. |

When pairing works, the Mac app shows **You’re connected**.

If you have one display paired, **Support → Restart Setup** clears its pairing and takes you through first-run setup again. With several displays paired, use **Forget** and **Add Display** on the **Displays** page to set up one display again. Your app and folder choices are kept.

### Windows pairing

1. [Install the display firmware](/screens/4848s040#install) if needed, then connect the display and PC to the same local network.
2. In the Windows app’s **Display** settings, select the display and choose **Next**. If it doesn’t appear, choose **Enter address manually**.
3. Enter the code shown on the touchscreen and choose **Pair display**. If the display is already paired, confirm **Reset pairing** on the touchscreen first. If no prompt appears, open pairing from the touchscreen’s Settings or choose **Open pairing page**.
4. Choose **Open display editor** to [set up your first layout](/features/first-run).

## A card does not work

- **App or folder** — check that it is still approved in EspDesktop’s **Apps** or **Folders** page.
- **Keyboard shortcut or Lock Machine** — check the [permission for your platform](/mac-controls/shortcuts#enable-keyboard-shortcuts). If the cards stopped working after replacing the macOS app, remove the old EspDesktop entry from **Accessibility** and add the installed app again.
- **Sound** — check that the microphone or speaker is connected. For app volume, start playback in the selected app. [Sound setup and requirements](/card-types/sound).

If a card is missing from the picker, confirm that EspDesktop shows the display as connected, then reload the editor and check [card availability](/features/adding-a-card#which-cards-work-with-my-computer). If a saved card is unavailable on your platform, use **Layout** to replace or remove it.

## The touchscreen says to unlock your computer {#the-touchscreen-says-to-unlock-your-mac}

Unlock your computer and make sure EspDesktop is running and connected. If the connection dropped while your computer was locked, the touchscreen unlocks after EspDesktop reconnects and reports that the computer is unlocked.

## A Mac app or display update breaks compatibility

Install the Mac app and display firmware from the same EspDesktop release. If you are testing a development build, use the matching display firmware as well. See [Companion Compatibility](/reference/companion-compatibility).

## WiFi setup and reset recovery

The `EspDesktop_XXXX` setup hotspot can take up to 90 seconds to appear. Connect to the hotspot named on the display and open its shown address if the offline setup page does not open automatically. A custom hotspot name or address is preserved. After **WiFi details saved**, reconnect your phone or computer to home WiFi and follow the display's instructions. USB Improv provisioning is also available after installation.

<a href="/images/device-setup-wifi-screen.jpg">
<picture>
  <source type="image/avif" srcset="/images/device-setup-wifi-screen-480.avif 480w, /images/device-setup-wifi-screen-960.avif 960w" sizes="(min-width: 768px) 480px, 90vw">
  <img src="/images/device-setup-wifi-screen.jpg" alt="Configure your Wi-Fi screen showing the temporary hotspot name and the address to open in a browser" width="2803" height="2803" loading="lazy">
</picture>
</a>

If an ESP32-P4 panel running EspControl can’t join WiFi, see the [C6 WiFi recovery guide](https://jtenniswood.github.io/espcontrol/getting-started/c6-recovery).

[Save a backup](/settings/backup#export-a-backup) before using **System → System → Factory Reset**. Partial reset retains WiFi and Companion pairing. Complete reset requires typing **RESET**, erases saved WiFi and Companion pairing, and requires pairing your computer again. It disables WiFi networks compiled into the firmware so newly provisioned credentials remain selected after reboot. Installed firmware remains in place.

## Still stuck?

Open **Support** in the Mac app or [report an issue](https://github.com/jtenniswood/espdesktop/issues). Include the display model, macOS or Windows version, EspDesktop app and firmware versions, and the exact message you saw. Leave out Wi-Fi passwords and pairing codes.
