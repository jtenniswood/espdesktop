---
title: download and pair companion app
description: Download EspDesktop for Mac, select your display, and enter its pairing code.
---

# download and pair companion app {#install-and-pair-the-espdesktop-mac-app}

Use an **Apple silicon Mac with macOS 13 or later**.

## Install the Mac app {#install-a-release}

Use the Mac app from the same release as your display firmware. For older firmware, [find the matching DMG under Assets on GitHub](https://github.com/jtenniswood/espdesktop/releases).

<p class="mac-app-download">
  <a :href="$frontmatter.macDownloadUrl">{{ $frontmatter.macReleaseVersion ? 'Download for Mac' : 'View Mac downloads' }}</a>{{ ' ' }}
  <span v-if="$frontmatter.macReleaseVersion">v{{ $frontmatter.macReleaseVersion }} · DMG</span>
</p>

## Pair your display {#pair-the-display}

When you first open EspDesktop on your Mac, follow the on-screen instructions to pair it with your display.

[Get help with discovery or pairing](/getting-started/troubleshooting) · <span id="check-the-connection"></span><span id="check-for-mac-app-updates"></span>[Mac app settings and updates](/settings/system#mac-app-settings)

<style scoped>
.mac-app-download {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.mac-app-download a {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-weight: 600;
  text-decoration: none;
}

.mac-app-download a:hover {
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}

.mac-app-download span {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
</style>
