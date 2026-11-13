---
title: EspDesktop Mac App Settings
description: Open EspDesktop on your Mac, manage apps and folders, and check for updates.
---

# Mac app settings

Choose **Settings** from the EspDesktop menu bar icon. The app keeps running when you close the settings window. To stop it, choose **Quit** from the same menu.

<ScreenshotGallery label="Mac app settings preview" :slides="settingsSlides" />

See how to choose [apps](/mac-controls/apps#choose-apps-in-the-mac-app) and [Finder folders](/mac-controls/folders#approve-a-folder) for your display. See [Permissions & Security](/mac-controls/security) for access to keyboard shortcuts and Mac Lock.

## Check for Mac app updates

In **Settings → Updates**, choose **Check Now** or set your automatic update preferences. Follow [update the Mac app and display together](/settings/system#update-the-mac-app-and-display-together) to keep their releases matched.

<script setup lang="ts">
import ScreenshotGallery from '../.vitepress/theme/components/ScreenshotGallery.vue'

const settingsSlides = [
  {
    image: '/images/mac-connector/mac_app1.png',
    alt: 'Display tab showing a connected display, Customize, Remove and Open at Startup',
    title: 'Display',
    caption: 'Check that your display says Connected. Choose Customize to open its web editor, or choose whether EspDesktop opens at login.',
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
