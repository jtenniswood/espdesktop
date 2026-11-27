---
title: Download EspDesktop for Mac and Windows
description: Download EspDesktop for Apple silicon Macs and Windows PCs. Pair either app with a Guition 4848S040 display.
---

# Download EspDesktop

Both apps pair with the **4-inch Guition ESP32-S3 4848S040** on your local network. [Install firmware on the display](/screens/4848s040#install) before pairing.

## macOS

The Mac app requires **Apple silicon and macOS 13 or newer**.

<p class="mac-app-download">
  <a :href="$frontmatter.macDownloadUrl">{{ $frontmatter.macReleaseVersion ? 'Download for Mac (DMG)' : 'View Mac downloads on GitHub' }}</a>
  <span v-if="$frontmatter.macReleaseVersion"> · Version {{ $frontmatter.macReleaseVersion }}</span>
</p>

Use the Mac app and firmware from the **same EspDesktop release**. If your display already runs an older version, find the matching DMG under **Assets** in [GitHub releases](https://github.com/jtenniswood/espdesktop/releases). Each release also lists its changes and firmware assets.

- [Install and pair the Mac app](/macos)
- [Check app and firmware compatibility](/reference/companion-compatibility)

## Windows

EspDesktop for Windows supports Intel, AMD, and Arm PCs. These links always download the latest stable installer:

- [Download for Intel and AMD PCs (x64)](https://github.com/jtenniswood/espdesktop/releases/latest/download/EspDesktop-Windows-x64-Setup.exe)
- [Download for Windows on Arm (Arm64)](https://github.com/jtenniswood/espdesktop/releases/latest/download/EspDesktop-Windows-arm64-Setup.exe)

[Install the app and pair your display](/windows#install-espdesktop).

[Code signing policy](/reference/code-signing)
