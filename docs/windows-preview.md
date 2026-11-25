---
title: Try EspDesktop for Windows 11
description: Install the Windows companion preview and pair your Guition 4848S040 touchscreen to launch apps, open folders and control your PC.
---

# EspDesktop for Windows 11 preview

Use a 4-inch Guition 4848S040 to launch approved Windows apps, open File Explorer folders and websites, send keyboard shortcuts, control speaker and microphone levels, or lock your PC. The companion runs in the notification area and can start when you sign in.

## Install the preview

1. Sign in to GitHub and open the latest successful run for the Windows companion branch. [Windows EspDesktop builds](https://github.com/jtenniswood/espdesktop/actions/workflows/windows-espdesktop.yml?query=branch%3Awindows-companion)
2. Under **Artifacts**, download **espdesktop-windows-x64-installer** for an Intel or AMD PC, or **espdesktop-windows-arm64-installer** for Windows on Arm. To check your PC, open **Settings → System → About → System type**.
3. Unzip the artifact and run the setup file. The preview installer is unsigned, so Windows may ask you to confirm that you trust it.
4. Open **EspDesktop** from Start. The app installs for the current user.

## Pair your display

1. Connect the display and Windows PC to the same local network. Use a 4848S040 with EspDesktop firmware that supports Companion pairing. It can pair with one computer at a time. To move it from another computer, reset the existing Companion pairing on the display first.
2. In the Windows app’s **Display** settings, select the display and choose **Next**. If it doesn’t appear, choose **Enter address manually**.
3. Choose **Open pairing page** to get the code, or press and hold the display’s Wi-Fi icon. Enter the code and choose **Pair display**.
4. Choose **Open display editor** on the paired display’s card. In the editor, use **Connectors → Mac Companion** to check pairing with your Windows PC.

Choose **Add display** to pair another panel with the same PC. Each panel has its own connection and editor. App and folder approvals apply to every paired panel.

With current firmware and a connected Windows companion, the card picker shows Windows-compatible alternatives for Mac-only features. Existing Mac-only cards stay in the layout and show a macOS requirement in their settings.

## Add controls

- Approve apps and folders in the Windows app before adding **Applications** and **Folder** cards.
- Enable **Allow keyboard shortcuts and screen lock** in the Windows app to use **Keyboard Shortcut** and **Lock Machine** cards. The editor’s Command and Control options both send Windows Ctrl. Option sends Alt.
- For an app with a shortcut subpage, choose when it opens under **Screen → Appearance → App Subpages**. [App subpage options](/features/subpages#app-page-behavior)
- Add a **Website** card to open a page in your default browser. New windows and active-site highlighting depend on the browser.

## Switch OBS scenes

In OBS Studio on the same Windows PC, open **Tools → WebSocket Server Settings** and enable the server. In EspDesktop, open **OBS Studio**, enter the port and password shown in OBS, and select **Connect to OBS**. Once connected, open or reload the display editor and add an **OBS Scene** card. Choose the scene you want the card to select.

Scene cards switch Program in normal mode and select Preview in OBS Studio Mode. In Studio Mode, **Take Live** moves a different Preview scene to Program. Use **Transition** to cycle through the transitions configured in OBS, or select a named transition in the card settings. Use current EspDesktop firmware for these controls. EspDesktop saves the connection for the next launch and protects the password with your Windows account.

The preview setup and compatibility details are in the [Windows branch guide](https://github.com/jtenniswood/espdesktop/blob/windows-companion/windows/README.md).
