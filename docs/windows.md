---
title: EspDesktop Windows setup
description: Download EspDesktop for Windows to control your PC from a Guition 4848S040 touchscreen.
---

# Windows setup

## Install EspDesktop

Use **Windows 11** to open apps and run keyboard shortcuts from your EspDesktop touchscreen. Choose **x64** for Intel or AMD PCs, or **Arm64** for Windows on Arm.

<p>
  <a class="docs-primary-action" href="https://github.com/jtenniswood/espdesktop/releases/download/v1.6.0/EspDesktop-Windows-1.6.0-x64-Setup.exe">Download for Windows (x64)</a>
  <a class="docs-primary-action" href="https://github.com/jtenniswood/espdesktop/releases/download/v1.6.0/EspDesktop-Windows-1.6.0-arm64-Setup.exe">Download for Windows (Arm64)</a>
</p>

Setup installs EspDesktop for your Windows account and adds a Start menu shortcut. If Setup offers **Turn off automatic update checks**, select it to skip background checks on a fresh install. For earlier installers, use the app’s **Updates** tab once installed. To start EspDesktop at sign-in, enable **Start EspDesktop when I sign in** in the app’s settings.

Open **EspDesktop** from Start and [pair your display](/getting-started/troubleshooting#windows-pairing).

## Uninstall EspDesktop

Quit EspDesktop from the Windows notification area. Open **Settings → Apps → Installed apps**, find **EspDesktop**, and select **Uninstall**. Windows removes the app, its Start menu shortcut, and its sign-in entry.

Your saved settings and display pairings are kept for reinstalling. To remove them as well, open File Explorer after uninstalling and delete the `%LOCALAPPDATA%\EspDesktop` folder. This clears saved settings, pairings, and the USB editor’s local data for your Windows account.

## Code signing policy

EspDesktop is applying to [SignPath.io](https://about.signpath.io/) for free Windows code signing, with a certificate from [SignPath Foundation](https://signpath.org/). The current Windows installers are unsigned. See the [Code signing policy](/reference/code-signing) for approval roles and privacy details.
