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

## Connect and edit over USB

Use the [4848S040 USB development profile](https://github.com/jtenniswood/espdesktop/blob/main/devices/guition-esp32-s3-4848s040/usb-dev.yaml), a USB data cable, and a Windows build with USB support. The regular Wi-Fi firmware does not provide this USB connection.

- For a new display, choose **Display → Add display → Connect by USB**. Select its COM port and enter the pairing code shown on the display.
- For a paired display, choose **Use USB** and select its COM port. Windows verifies the paired display before saving the change. If Windows assigns a different port after reconnecting the cable, choose **Change USB port**.
- Choose **Open USB editor** to change the layout in your browser with Wi-Fi and internet access off. The browser connects to EspDesktop on your PC, and EspDesktop sends the changes over the cable. If the display has a network address, **Open network editor** opens that address while controls stay on USB.
- Choose **Toggle display Wi-Fi** to turn Wi-Fi off for offline use. Choose **Use network** to turn it back on and reconnect using the same pairing. If the display is not found automatically, enter the address shown on the display.

If the cable comes out during a save, keep the editor tab open and reconnect. EspDesktop checks what was saved before retrying. If the save cannot be confirmed, use **Export unsaved layout** in the tab.

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

In the display editor, add a **Sound** card on Home or in a subpage. Choose one **Type** per card.

- **Audio Output** adjusts the default speaker or headphone volume.
- **Audio Input** adjusts the default microphone level.
- **Output Mute** toggles speaker or headphone mute.
- **Input State** toggles microphone mute and shows whether the input is live or muted. If Windows detects no audio input, the card shows **No audio input** and becomes available again when an input is detected.

These four cards follow the computer’s default audio devices. For independent sliders, use **Input per device level** to select a connected microphone or **Output per application** to select an app approved in EspDesktop’s **Apps** settings.

Start playing sound in the selected app to create a Windows audio session. The app slider becomes unavailable when Windows no longer has a session for it. Moving a level slider above zero unmutes the selected device or app. Use the latest Windows companion for these two controls.

## Switch OBS scenes

In OBS Studio on the same Windows PC, open **Tools → WebSocket Server Settings** and enable the server. In EspDesktop, open **OBS Studio**, enter the port and password shown in OBS, and select **Connect to OBS**. Once connected, open or reload the display editor and add an **OBS Scene** card. Choose the scene you want the card to select.

Scene cards switch Program in normal mode and select Preview in OBS Studio Mode. In Studio Mode, **Take Live** moves a different Preview scene to Program. Use **Transition** to cycle through the transitions configured in OBS, or select a named transition in the card settings. Use current EspDesktop firmware for these controls. EspDesktop saves the connection for the next launch and protects the password with your Windows account.

For build and compatibility details, see the [Windows app guide](https://github.com/jtenniswood/espdesktop/blob/main/windows/README.md).
