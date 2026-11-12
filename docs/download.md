---
title: Download EspDesktop for Mac
description: Get the official EspDesktop Mac app for Apple silicon and find the matching Guition 4848S040 display firmware.
---

# Download EspDesktop for Mac

EspDesktop requires **Apple silicon and macOS 13 or newer**. It pairs with the **4-inch Guition ESP32-S3 4848S040** on the same local network.

<p class="mac-app-download">
  <a :href="$frontmatter.macDownloadUrl">{{ $frontmatter.macReleaseVersion ? 'Download for Mac (DMG)' : 'View Mac downloads on GitHub' }}</a>
  <span v-if="$frontmatter.macReleaseVersion"> · Version {{ $frontmatter.macReleaseVersion }}</span>
</p>

Use the Mac app and firmware from the **same EspDesktop release**. If your display already runs an older version, find the matching DMG under **Assets** in [GitHub releases](https://github.com/jtenniswood/espdesktop/releases). Each release also lists its changes and firmware assets.

- [Install firmware on the display](/getting-started/install)
- [Install and pair the Mac app](/getting-started/mac-app)
- [Check app and firmware compatibility](/reference/companion-compatibility)
