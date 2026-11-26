---
title: Download EspDesktop for Mac
description: Get the official EspDesktop Mac app for Apple silicon and find firmware for your 4-inch, 7-inch, or 10.1-inch display.
---

# Download EspDesktop for Mac

EspDesktop requires **Apple silicon and macOS 13 or newer**. Pair your display on the same local network. The 4-inch Guition 4848S040 uses public firmware. The 7-inch JC1060P470 V3 and 10.1-inch JC8012P4A1 V3 use test firmware.

<p class="mac-app-download">
  <a :href="$frontmatter.macDownloadUrl">{{ $frontmatter.macReleaseVersion ? 'Download for Mac (DMG)' : 'View Mac downloads on GitHub' }}</a>
  <span v-if="$frontmatter.macReleaseVersion"> · Version {{ $frontmatter.macReleaseVersion }}</span>
</p>

Use the Mac app and firmware from the **same EspDesktop release**. If your display already runs an older version, find the matching DMG under **Assets** in [GitHub releases](https://github.com/jtenniswood/espdesktop/releases). Each release also lists its changes and firmware assets.

- [Install firmware on the 4-inch display](/screens/4848s040#install)
- [Install firmware on the 7-inch V3](/screens/jc1060p470-v3#install)
- [Install firmware on the 10.1-inch V3](/screens/jc8012p4a1-v3#install)
- [Install and pair the Mac app](/screens/4848s040#download)
- [Check app and firmware compatibility](/reference/companion-compatibility)

## Windows 11 preview

Have a Windows PC? [Try the Windows 11 companion preview](/windows-preview) with a Guition 4848S040.
