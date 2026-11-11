---
title: Install and Pair the EspDesktop Mac App
description: Download EspDesktop for Mac, select your display, and enter its pairing code.
next: false
---

# 2. Install and pair the Mac app {#install-and-pair-the-espdesktop-mac-app}

## Install the Mac app {#install-a-release}

Use an **Apple silicon Mac with macOS 13 or later**. Use the Mac app from the same release as your display firmware. For older firmware, [find the matching DMG under Assets on GitHub](https://github.com/jtenniswood/espdesktop/releases).

<p class="mac-app-download">
  <a :href="$frontmatter.macDownloadUrl">{{ $frontmatter.macReleaseVersion ? 'Download for Mac' : 'View Mac downloads' }}</a>{{ ' ' }}
  <span v-if="$frontmatter.macReleaseVersion">v{{ $frontmatter.macReleaseVersion }} · DMG</span>
</p>

Open the DMG, drag **EspDesktop** into **Applications**, then open it from there. The app opens its setup wizard.

## Pair your display {#pair-the-display}

1. Keep your Mac and display on the same local network. Allow local network access if macOS asks.
2. Select your discovered display in the Mac app and click **Continue**. If it doesn’t appear, choose **Enter address manually** and enter the display’s IP address or `.local` name. To find the IP address, tap the network icon on the touchscreen to open **Settings**.
3. In the touchscreen’s **Settings**, tap **Unpaired**. Enter the eight-letter code in the Mac app and click **Connect**. If the device page opened by the app shows the code, you can copy it from there.
4. On **Access and startup**, choose whether EspDesktop should launch at login, then click **Finish**. To use keyboard shortcut cards, choose **Open Settings** beside **Enable Shortcuts** and allow EspDesktop in **Accessibility**.

[Get help with discovery or pairing](/getting-started/troubleshooting) · <span id="check-the-connection"></span><span id="check-for-mac-app-updates"></span>[Mac app settings and updates](/features/settings#mac-app-settings)

**[Next · 3. Configure your cards](/features/setup)**

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
