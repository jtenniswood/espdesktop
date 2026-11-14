---
title: EspDesktop Mac App Settings
description: Open EspDesktop on your Mac, manage apps and folders, and check for updates.
---

# Mac app settings

Choose **Settings** from the EspDesktop menu bar icon. The app keeps running when you close the settings window. To stop it, choose **Quit** from the same menu.

Choose **Add device** from the menu bar icon to search for and pair a display.

<ScreenshotGallery label="Mac app settings preview" :width="1224" :height="1488" :slides="settingsSlides" />

See how to choose [apps](/mac-controls/apps#choose-apps-in-the-mac-app) and [Finder folders](/mac-controls/folders#approve-a-folder) for your display. See [Permissions & Security](/mac-controls/security) for access to keyboard shortcuts and Mac Lock.

## Check for Mac app updates

In **Settings → Updates**, choose **Check Now** or set your automatic update preferences. Follow [update the Mac app and display together](/settings/system#update-the-mac-app-and-display-together) to keep their releases matched.

<script setup lang="ts">
import ScreenshotGallery from '../.vitepress/theme/components/ScreenshotGallery.vue'

const settingsSlides = [
  {
    imageBase: '/images/mac-connector/mac_app1',
    alt: 'Display tab showing a connected display, Customize, Remove and Open at Startup',
    title: 'Display',
    caption: 'Check that your display says Connected. Choose Customize to open its web editor, or choose whether EspDesktop opens at login.',
  },
  {
    imageBase: '/images/mac-connector/mac_app2',
    alt: 'Apps tab with All available apps switched on',
    title: 'Apps',
    caption: 'Leave All available apps on to make every installed app available for keyboard shortcuts on your display.',
  },
  {
    imageBase: '/images/mac-connector/mac_app3',
    alt: 'Apps tab listing individual apps with a switch beside each one',
    title: 'Choose individual apps',
    caption: 'Turn off All available apps, then switch on the apps you want to launch from your display.',
  },
  {
    imageBase: '/images/mac-connector/mac_app4',
    alt: 'Folders tab showing approved folders and an Add Folder button',
    title: 'Folders',
    caption: 'Choose Add Folder to approve a Finder folder you want to open from your display.',
  },
  {
    imageBase: '/images/mac-connector/mac_app5',
    alt: 'Updates tab showing the installed version, Check Now and automatic update switches',
    title: 'Updates',
    caption: 'See the installed version, check for a new release and choose how the app handles automatic updates.',
  },
]
</script>
