---
title: EspDesktop Mac App Settings
description: Open EspDesktop on your Mac, manage apps and folders, and check for updates.
---

# Mac app settings

Choose **Settings** from the EspDesktop menu bar icon. The app keeps running when you close the settings window. To stop it, choose **Quit** from the same menu.

Choose **Add device** from the menu bar icon to search for and pair a display.

<ScreenshotGallery label="Mac app settings preview" :width="1224" :height="1488" :slides="settingsSlides" />

Choose [apps](/mac-controls/apps#choose-apps-in-the-mac-app) and [Finder folders](/mac-controls/folders#approve-a-folder) for your display. Enabled apps also appear in the [App Volume picker](/mac-controls/apps#app-volume). See [Permissions & Security](/mac-controls/security) for macOS permissions.

## Switch a display between USB and network

USB control currently requires compatible development builds of both the Mac app and the display firmware. USB testing covers the 4-inch Guition 4848S040 and the 7-inch Guition JC1060P470 V3.

1. Connect the paired display to your Mac with a USB data cable.
2. In **Settings → Displays**, choose **Connection → Switch to USB** on that display’s card. The app matches the display to its existing pairing.
3. Choose **Device** to open the editor inside the Mac app. You can edit and save the display’s layout over USB while Wi-Fi is off.

Wi-Fi is on by default. To turn it off, open the USB editor’s **System** tab and find **Wi-Fi** in the **System** group. The display remembers your choice after unplugging USB or restarting.

To return to the network, keep the USB cable connected and choose **Connection → Switch to Network** on the display’s card. EspDesktop turns on the display’s Wi-Fi if needed and looks for the paired display on your network. Once connected, **Device** opens the display’s network address in your default browser.

Choose **Details…** beside the connection status under the display name. On **Network**, you can enter an address. On **USB**, you can choose a port.

You can switch each display independently and use USB and network displays at the same time.

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
