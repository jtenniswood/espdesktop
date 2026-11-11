---
title: EspDesktop System Settings
description: Manage Mac pairing, language, time, device name, backups, firmware and resets on your EspDesktop display.
---

# System settings

Choose **Customize Display** from the EspDesktop menu bar icon, or open the display’s local address in your browser. Select the **System** tab to manage the device.

Choose **Apply Configuration** at the bottom of the tab when you’re ready to restart the display and apply your changes.

## Display system settings

[![System tab showing Mac Companion, Language, Time, Device Name, Backup, Firmware and Factory Reset](/images/web-editor-system-settings.png)](/images/web-editor-system-settings.png)

### Mac Companion and preferences

- **Connectors → Mac Companion** is where you [pair the Mac app](/getting-started/mac-app#pair-the-display) and check its connection.
- **Preferences → Language** changes the language shown on the touchscreen.
- **Preferences → Time** lets you follow the paired Mac’s time zone or choose one yourself. You can also switch between 12- and 24-hour time and set custom time servers.

### Mac screen lock {#protect-the-touchscreen}

Locking your paired Mac also locks the touchscreen while the EspDesktop Mac app is running. If the connection drops while locked, the display waits for EspDesktop to reconnect and report that your Mac has unlocked.

### Rename the display {#naming-your-panel}

Open **System → Device Name** within the **System** tab and choose **Save & Restart** after entering a name. Reopen the editor at the new `.local` address shown there.

### Backup

Open **Backup** under the **System** heading in the **System** tab. Use **Export** to save the display’s configuration to a file and **Import** to restore it. [Back up and restore a configuration](/settings/backup).

### Update the display firmware {#update-the-display-firmware}

In the **System** tab, open **Firmware → Firmware updates** and choose **Check for Update**. If an update is available, choose **Install Update** and keep the display powered while it restarts. **Auto updates** controls automatic installation and how often the display checks.

[Export a backup](/settings/backup#export-a-backup) before updating and use [matching Mac app and firmware releases](#check-for-mac-app-updates). **Previous firmware** can install an older version when available. If it can’t read your current layout, use a backup made before the upgrade.

### Reset the display

Open **Factory Reset** in the **System** tab and choose **Save backup** before resetting.

- **Partial reset** clears cards, layouts, subpages, the saved device name and display preferences. It keeps your Wi-Fi connection and Mac pairing.
- **Complete reset** also clears saved Wi-Fi and Mac pairing. Type **RESET** to confirm, then follow the first-time setup instructions on the display.

Both options keep the installed firmware. Wait for the reset to finish before importing a backup. [Reset and Wi-Fi recovery](/getting-started/troubleshooting#wifi-setup-and-reset-recovery).

## Mac app settings

Choose **Mac Settings** from the EspDesktop menu bar icon. The app keeps running when you close the settings window. To stop it, choose **Quit** from the same menu.

<ScreenshotGallery label="Mac app settings preview" :slides="settingsSlides" />

See how to choose [apps](/mac-controls/apps#choose-apps-in-the-mac-app) and [Finder folders](/mac-controls/folders#approve-a-folder) for your display. See [Permissions & Security](/mac-controls/security) for access to keyboard shortcuts and Mac Lock.

### Check for Mac app updates

In **Mac Settings → Updates**, choose **Check Now** or set your automatic update preferences. Use the Mac app and display firmware from the same EspDesktop release.

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
