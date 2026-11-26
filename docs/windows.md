---
title: EspDesktop Windows setup
description: Install EspDesktop for Windows and pair your Guition 4848S040 touchscreen.
---

# Windows setup

## Install EspDesktop

The installer requires Windows build **22000 or later**. Run **winver** to check your build.

1. Open [GitHub Releases](https://github.com/jtenniswood/espdesktop/releases) and choose the latest release that lists Windows installers under **Assets**.
2. Download the setup file ending in **x64-Setup.exe** for Intel or AMD PCs, or **arm64-Setup.exe** for Windows on Arm. To check your PC, open **Settings → System → About → System type**.
3. Run the setup file. The installer is unsigned, so Windows may ask you to confirm that you trust it.
4. Open **EspDesktop** from Start. The app installs for the current user.

## Pair your display

1. [Install the display firmware](/screens/4848s040#install) if needed, then connect the display and PC to the same local network.
2. In the Windows app’s **Display** settings, select the display and choose **Next**. If it doesn’t appear, choose **Enter address manually**.
3. Select **Open pairing page** to get the code. Enter it and choose **Pair display**.
4. Choose **Open display editor** to [set up your first layout](/features/first-run).

[Get pairing help](/getting-started/troubleshooting#the-display-will-not-pair).

### Connect over USB in a development build

Windows development builds with USB support can control a display over a USB data cable with Wi-Fi off. Use USB-enabled Companion firmware. For the 4848S040, the experimental `usb-dev.yaml` profile enables Companion control over USB.

1. Plug the display into the PC. In **Display**, choose **Connect over USB**, select the display’s COM port, and choose **Next**.
2. On the touchscreen, choose **Pair** on the Setup screen or **Unpaired** in Settings. Enter the code in Windows and choose **Pair display**.

Use **Change connection** on a saved display to switch between USB and the local network or select a different COM port. EspDesktop verifies the display and keeps its pairing.

Choose **Open display editor** to load and save the layout over USB. The editor opens inside EspDesktop and requires the Microsoft Edge WebView2 Runtime. When the display is connected over IP, the editor opens in your browser.

If USB disconnects while saving a layout, reconnect the same display. EspDesktop checks the saved layout before it retries a write. If it cannot confirm the save, choose **Export unsaved layout** in the editor window to keep a copy before closing it.
