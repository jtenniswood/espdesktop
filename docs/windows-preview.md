---
title: Try EspDesktop for Windows 11
description: Install the Windows companion preview and pair your Guition 4848S040 touchscreen to launch apps, open folders and control your PC.
---

# EspDesktop for Windows 11 preview

Use a 4-inch Guition 4848S040 to launch approved Windows apps, open File Explorer folders and websites, send keyboard shortcuts, control speaker and microphone levels, or lock your PC. The companion runs in the notification area and can start when you sign in.

<span id="install-the-preview"></span>

## Install EspDesktop

1. Open [GitHub Releases](https://github.com/jtenniswood/espdesktop/releases) and choose the latest release that lists Windows installers under **Assets**.
2. Download the setup file ending in **x64-Setup.exe** for Intel or AMD PCs, or **arm64-Setup.exe** for Windows on Arm. To check your PC, open **Settings → System → About → System type**.
3. Run the setup file. The installer is unsigned, so Windows may ask you to confirm that you trust it.
4. Open **EspDesktop** from Start. The app installs for the current user.

To update, run the newer setup file. The installer keeps your settings and display pairing.

## Pair your display

1. Connect the display and Windows PC to the same local network. Use a 4848S040 with EspDesktop firmware that supports Companion pairing. [Install EspDesktop firmware](/screens/4848s040#install) if the display is new. It can pair with one computer at a time. To move it from another computer, reset the existing Companion pairing on the display first.
2. In the Windows app’s **Display** settings, select the display and choose **Next**. If it doesn’t appear, choose **Enter address manually**.
3. Choose **Open pairing page** to get the code, or press and hold the display’s Wi-Fi icon. Enter the code and choose **Pair display**.
4. Choose **Open display editor** on the paired display’s card. In the editor, open **System → Connectors → Companion** to check pairing.

Choose **Add display** to pair another panel with the same PC. Each panel has its own connection and editor. App and folder approvals apply to every paired panel.

With current firmware and a connected Windows companion, the card picker shows Windows-compatible alternatives for Mac-only features. Existing Mac-only cards stay in the layout and show a macOS requirement in their settings.

## Add controls

- Approve apps and folders in EspDesktop. Follow the shared guides to [launch apps](/mac-controls/apps) or [open folders in File Explorer](/mac-controls/folders).
- Follow [keyboard shortcut setup](/mac-controls/shortcuts#enable-keyboard-shortcuts) before adding **Keyboard Shortcut** or **Lock Machine** cards. Existing custom shortcuts saved with Command or Control send Ctrl on Windows. Option sends Alt.
- For an app with a shortcut subpage, choose when it opens under **Screen → Appearance → App Subpages**. [App subpage options](/features/subpages#app-page-behavior)
- Add **Display brightness** for a slider or **Screen brightness** for brighter and dimmer buttons. These cards need current firmware and a supported built-in screen or primary DDC/CI monitor. [Screen brightness controls](/settings/screen#mac-display-brightness)
- Add a [Website card](/mac-controls/websites) to open a page in your default browser.

## Switch OBS scenes

In OBS Studio on the same Windows PC, open **Tools → WebSocket Server Settings** and enable the server. In EspDesktop, open **OBS Studio**, enter the port and password shown in OBS, and select **Connect to OBS**. Once connected, open or reload the display editor and add an **OBS Scene** card. Choose the scene you want the card to select.

Scene cards switch Program in normal mode and select Preview in OBS Studio Mode. In Studio Mode, **Take Live** moves a different Preview scene to Program. Use **Transition** to cycle through the transitions configured in OBS, or select a named transition in the card settings. Use current EspDesktop firmware for these controls. EspDesktop saves the connection for the next launch and protects the password with your Windows account.

For build and compatibility details, see the [Windows app guide](https://github.com/jtenniswood/espdesktop/blob/main/windows/README.md).
