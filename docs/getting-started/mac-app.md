---
title: Download EspDesktop for Mac
description: Download the EspDesktop connector for macOS, pair your display over Wi-Fi and preview the Mac app settings.
---

# EspDesktop for Mac {#install-and-pair-the-espdesktop-mac-app}

Install the EspDesktop connector to launch Mac apps, open folders and run shortcuts from your display.

## Install the Mac app {#install-a-release}

Requires **macOS 13 or later** and **Apple silicon**.

<p class="mac-app-download">
  <a :href="$frontmatter.macDownloadUrl">{{ $frontmatter.macReleaseVersion ? 'Download for Mac' : 'View Mac downloads' }}</a>{{ ' ' }}
  <span v-if="$frontmatter.macReleaseVersion">v{{ $frontmatter.macReleaseVersion }} · DMG</span>
</p>

Open the DMG, drag **EspDesktop** into **Applications**, then open it from there. EspDesktop appears in your Mac’s menu bar and opens the setup wizard on first launch.

Use the Mac app and display firmware from the same release. If your display is running older firmware, [download the matching DMG from GitHub Releases](https://github.com/jtenniswood/espdesktop/releases).

## Pair your display {#pair-the-display}

Before starting the wizard, [install EspDesktop on your display](/getting-started/install) and [connect it to Wi-Fi](/getting-started/install#connect-the-display-to-wifi). Your Mac and display must be on the same local network.

<ScreenshotGallery label="Setup wizard preview" :slides="wizardSlides" />

## Preview the Mac app settings {#check-the-connection}

Once your display is paired, choose **Mac Settings** from the EspDesktop menu bar icon.

<ScreenshotGallery label="Mac app settings preview" :slides="settingsSlides" />

## Check for Mac app updates

In **Mac Settings → Updates**, choose **Check Now** or set your automatic update preferences. If an update requires newer display firmware, follow the [display update instructions](/features/setup#update-the-display-firmware) and use the app and firmware from the same release.

[Explore Mac controls](/#what-you-can-control) · [Permissions and security](/mac-controls/security) · [Troubleshoot pairing and controls](/getting-started/troubleshooting)

<script setup lang="ts">
import ScreenshotGallery from '../.vitepress/theme/components/ScreenshotGallery.vue'

const wizardSlides = [
  {
    image: '/images/mac-connector/mac_wizard1.png',
    alt: 'Setup wizard listing a discovered display and an option to enter an address manually',
    title: 'Choose your display',
    caption: 'Allow local network access if macOS asks. Select your display and choose Continue. If it’s missing, choose Enter address manually and enter its IP address or .local name.',
  },
  {
    image: '/images/mac-connector/mac_wizard2.png',
    alt: 'Setup wizard with eight pairing code fields and a Connect button',
    title: 'Pair your display',
    caption: 'Copy the eight-letter code from System → Mac Companion on the browser page opened by the wizard. Paste it into the Mac app and choose Connect.',
  },
  {
    image: '/images/mac-connector/mac_wizard3.png',
    alt: 'Access and startup screen showing Launch at login and Finish',
    title: 'Finish setup',
    caption: 'Choose Open Settings if you need Accessibility access for keyboard shortcuts or Mac Lock. Set Launch at login to your preference, then choose Finish.',
  },
]

const settingsSlides = [
  {
    image: '/images/mac-connector/mac_app1.png',
    alt: 'Display tab showing a connected display, Customize, Remove and Open at Startup',
    title: 'Display',
    caption: 'Check that your display says Connected. Choose Customize to open its web editor, or change whether EspDesktop opens at startup.',
  },
  {
    image: '/images/mac-connector/mac_app2.png',
    alt: 'Apps tab with All available apps switched on',
    title: 'Apps',
    caption: 'Leave All available apps on to make every installed app available for shortcuts on your display.',
  },
  {
    image: '/images/mac-connector/mac_app3.png',
    alt: 'Apps tab listing individual apps with a switch beside each one',
    title: 'Choose individual apps',
    caption: 'Turn off All available apps, then switch on the apps you want to launch from your display.',
  },
  {
    image: '/images/mac-connector/mac_app4.png',
    alt: 'Folders tab showing approved folders and an Add Folder button',
    title: 'Folders',
    caption: 'Choose Add Folder to approve a Finder folder you want to open from your display.',
  },
  {
    image: '/images/mac-connector/mac_app5.png',
    alt: 'Updates tab showing the installed version, Check Now and automatic update switches',
    title: 'Updates',
    caption: 'See the installed version, check for a new release and choose how the app handles automatic updates.',
  },
]
</script>

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
