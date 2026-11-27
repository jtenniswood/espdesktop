---
title: EspDesktop Windows setup
description: Download EspDesktop for Windows to control your PC from a Guition 4848S040 touchscreen.
---

# Windows setup

## Install EspDesktop

Use **Windows 11** to open apps and run keyboard shortcuts from your EspDesktop touchscreen. Choose **x64** for Intel or AMD PCs, or **Arm64** for Windows on Arm.

<p class="docs-primary-actions">
  <a class="docs-primary-action" href="https://github.com/jtenniswood/espdesktop/releases/latest/download/EspDesktop-Windows-x64-Setup.exe">Download for Windows (x64)</a>
  <a class="docs-primary-action" href="https://github.com/jtenniswood/espdesktop/releases/latest/download/EspDesktop-Windows-arm64-Setup.exe">Download for Windows (Arm64)</a>
</p>

Setup installs EspDesktop for your Windows account and adds a Start menu shortcut. If Setup offers **Turn off automatic update checks**, select it to skip background checks on a fresh install. For earlier installers, use the app’s **Updates** tab once installed. To start EspDesktop at sign-in, enable **Start EspDesktop when I sign in** in the app’s settings.

Open **EspDesktop** from Start.

## Pair your display

1. [Install the display firmware](/screens/4848s040#install) if needed, then connect the display and PC to the same local network.
2. In EspDesktop, open **Display**, select your display, and choose **Next**. If it doesn’t appear, choose **Enter address manually**.
3. Choose **Open pairing page** or press and hold the Wi-Fi icon on the touchscreen to get the code. Enter it in EspDesktop and choose **Pair display**.
4. Choose **Open display editor** to [set up your first layout](/features/first-run).

[Get pairing help](/getting-started/troubleshooting#windows-pairing).

## Uninstall EspDesktop

Quit EspDesktop from the Windows notification area. Open **Settings → Apps → Installed apps**, find **EspDesktop**, and select **Uninstall**. Windows removes the app, its Start menu shortcut, and its sign-in entry.

Your saved settings and display pairings are kept for reinstalling. To remove them as well, open File Explorer after uninstalling and delete the `%LOCALAPPDATA%\EspDesktop` folder. This clears saved settings, pairings, and the USB editor’s local data for your Windows account.

## Code signing policy

EspDesktop is applying to [SignPath.io](https://about.signpath.io/) for free Windows code signing, with a certificate from [SignPath Foundation](https://signpath.org/). The current Windows installers are unsigned. See the [Code signing policy](/reference/code-signing) for approval roles and privacy details.
