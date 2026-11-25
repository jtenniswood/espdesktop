---
title: Download EspDesktop for Mac and Windows
description: Download EspDesktop for Apple silicon Macs or try the Windows 11 preview. Pair either app with a Guition 4848S040 display.
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

- [Install and pair the Mac app](/screens/4848s040#setup-on-macos)
- [Check app and firmware compatibility](/reference/companion-compatibility)

## Windows 11 preview

The Windows preview supports Windows 11 on Intel, AMD, and Arm PCs. [Download the Windows installer and pair your display](/windows-preview#install-espdesktop).
