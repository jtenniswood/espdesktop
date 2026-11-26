---
title: EspDesktop Windows setup
description: Install EspDesktop for Windows and pair your Guition 4848S040 touchscreen to launch apps, open folders and control your PC.
---

# Windows setup

Use a 4-inch Guition 4848S040 to launch approved Windows apps, open File Explorer folders and websites, send keyboard shortcuts, control speaker and microphone levels, or lock your PC. The companion runs in the notification area and can start when you sign in.

## Install EspDesktop

1. Open [GitHub Releases](https://github.com/jtenniswood/espdesktop/releases) and choose the latest release that lists Windows installers under **Assets**.
2. Download the setup file ending in **x64-Setup.exe** for Intel or AMD PCs, or **arm64-Setup.exe** for Windows on Arm. To check your PC, open **Settings → System → About → System type**.
3. Run the setup file. The installer is unsigned, so Windows may ask you to confirm that you trust it.
4. Open **EspDesktop** from Start. The app installs for the current user.

## Update EspDesktop

Open **Updates → Check for updates** in the Windows app, or leave **Automatically check for updates** enabled. Choose **Release downloads** to get a newer installer, then run the setup file for your PC. The installer keeps your settings and display pairing.

## Pair your display

1. Connect the display and Windows PC to the same local network. Use a 4848S040 with EspDesktop firmware that supports Companion pairing. [Install EspDesktop firmware](/screens/4848s040#install) if the display is new. It can pair with one computer at a time. To move it from another computer, reset the existing Companion pairing on the display first.
2. In the Windows app’s **Display** settings, select the display and choose **Next**. If it doesn’t appear, choose **Enter address manually**.
3. Choose **Open pairing page** to get the code, or press and hold the display’s Wi-Fi icon. Enter the code and choose **Pair display**.
4. Choose **Open display editor** on the paired display’s card. In the editor, open **System → Connectors → Companion** to check pairing.

Choose **Add display** to pair another panel with the same PC. Each panel has its own connection and editor. App and folder approvals apply to every paired panel.

With current firmware and a connected Windows companion, the card picker shows Windows-compatible alternatives for Mac-only features. Existing Mac-only cards stay in the layout and show a macOS requirement in their settings.

## Add controls

- Approve apps and folders in EspDesktop. Follow the shared guides to [launch apps](/mac-controls/apps) or [open folders in File Explorer](/mac-controls/folders).
- Follow [keyboard shortcut setup](/mac-controls/shortcuts#enable-keyboard-shortcuts) before adding **Keyboard Shortcut** or **Lock Machine** cards. With current firmware and a connected PC, the editor shows **Ctrl**, **Alt**, and **Shift**. Existing custom shortcuts saved with Command or Control send Ctrl on Windows. Option sends Alt.
- A **Custom** shortcut sends keys to the approved app in front. An **Application** preset sends keys once its selected app is in front. If Windows keeps another window active, bring the preset’s app forward and tap again.
- A **Keyboard Shortcut** card in **Application** mode holds one shortcut from the paired computer’s catalogue. [Browse Windows shortcut presets](/reference/shortcut-presets). If a card was saved for the other platform, reopen it and choose the app and shortcut again.
- Pair current display firmware to browse the full Windows preset list. With older compatible firmware, the editor shows the starter shortcuts. Keep the Windows companion updated to get the latest presets.
- A new app shortcut subpage starts with the first seven available shortcuts. You can change the selection in the editor. Choose when the subpage opens under **Screen → Appearance → App Subpages**. [App subpage options](/features/subpages#app-page-behavior)
- Add a [Website card](/mac-controls/websites) to open a page in your default browser.

## Control system sound

Add a [Sound card](/card-types/sound) to adjust speakers or microphones, or [control an app’s volume](/card-types/sound#app-volume).

## Switch OBS scenes

In OBS Studio on the same Windows PC, open **Tools → WebSocket Server Settings** and enable the server. In EspDesktop, open **OBS Studio**, enter the port and password shown in OBS, and select **Connect to OBS**. Once connected, open or reload the display editor and add an **OBS Scene** card. Choose the scene you want the card to select.

Scene cards switch Program in normal mode and select Preview in OBS Studio Mode. In Studio Mode, **Take Live** moves a different Preview scene to Program. Use **Transition** to cycle through the transitions configured in OBS, or select a named transition in the card settings. Use current EspDesktop firmware for these controls. EspDesktop saves the connection for the next launch and protects the password with your Windows account.

For build and compatibility details, see the [Windows app guide](https://github.com/jtenniswood/espdesktop/blob/main/windows/README.md).
