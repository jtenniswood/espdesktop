---
title: Settings
description: Customise your display, back up its settings, and manage the EspDesktop Mac app and firmware.
---

# Settings {#display-and-mac-app-settings}

Open the display’s address in your browser, or click **Customize** next to the connected display in the EspDesktop Mac app. Use **Screen** to change how the touchscreen looks and behaves, and **System** to manage the device itself.

Choose **Apply Configuration** at the bottom of either tab when you’re ready to restart the display and apply your changes.

## Screen settings {#screen-and-system-settings}

[![Screen tab showing Appearance, Display, and Sleep & Schedule settings](/images/web-editor-screen-settings.png)](/images/web-editor-screen-settings.png)

### Appearance

- **Active Colour** sets the accent colour. **Card Style** sets the card curve and default app icon size.
- **App Subpages** controls whether shortcut pages open when an app comes into focus and what happens when you switch apps. See [app page behaviour](/features/subpages#app-page-behavior).
- **Theme** offers Dark, Light or Automatic. Automatic follows sunrise and sunset or times you set.
- **Clock Bar** shows or hides the status bar on the home screen.

### Display

- **Backlight** controls brightness. Choose **Manual** for a fixed level, **Automatic** to follow sunrise and sunset, or **Timed** to set your own dawn and dusk times. Automatic and Timed let you set separate day and night levels.
- **Rotation** turns the interface by 0°, 90°, 180° or 270° to match how the display is mounted.

### Sleep & Schedule

- **Screensaver** can dim the screen, show a clock or turn the display off. Choose **Timer** to start it after idle time, or **App Connection** to start it when your paired Mac locks or disconnects.
- **Night Schedule** sets a daily period to dim the screen, turn it off or show a clock. It takes priority over the screensaver. It is off on new displays. If you enable it with the preset hours and brightness, the screen dims to **15%** from **7:00 PM to 7:00 AM** in the display’s local time.

When the display is asleep, tap once to wake it, then tap a card to use it.

## System settings

[![System tab showing Mac Companion, Language, Time, Device Name, Backup, Firmware and Factory Reset](/images/web-editor-system-settings.png)](/images/web-editor-system-settings.png)

### Mac Companion and preferences

- **Connectors → Mac Companion** is where you [pair the Mac app](/getting-started/mac-app#pair-the-display) and check its connection.
- **Preferences → Language** changes the language shown on the touchscreen.
- **Preferences → Time** lets you follow the paired Mac’s time zone or choose one yourself. You can also switch between 12- and 24-hour time and set custom time servers.

### Mac screen lock {#protect-the-touchscreen}

Locking your paired Mac also locks the touchscreen while the EspDesktop Mac app is running. If the connection drops while locked, the display waits for EspDesktop to reconnect and report that your Mac has unlocked.

### Rename the display {#naming-your-panel}

Open **System → Device Name** within the **System** tab and choose **Save & Restart** after entering a name. Reopen the editor at the new `.local` address shown there.

### Back up or restore settings {#back-up-your-layout}

Open **System → Backup** within the **System** tab. Choose **Export** to download your cards, subpages and display settings, or **Import** to restore them on a compatible display. If the file includes a device name, selecting **Also restore panel name** can change the display’s network address.

On a replacement or fully reset display, [connect it to Wi-Fi](/getting-started/install#connect-the-display-to-wifi) and [pair the Mac app](/getting-started/mac-app#pair-the-display) separately. Keep backup files private if they contain personal settings or web addresses.

### Update the display firmware {#update-the-display-firmware}

In the **System** tab, open **Firmware → Firmware updates** and choose **Check for Update**. If an update is available, choose **Install Update** and keep the display powered while it restarts. **Auto updates** controls automatic installation and how often the display checks.

Export a backup before updating and use [matching Mac app and firmware releases](#check-for-mac-app-updates). **Previous firmware** can install an older version when available. If it can’t read your current layout, use a backup made before the upgrade.

### Reset the display

Open **Factory Reset** in the **System** tab and choose **Save backup** before resetting. A partial reset clears cards, layouts and device preferences while keeping Wi-Fi and Mac pairing. A complete reset also clears saved Wi-Fi and pairing. See [reset and recovery](/getting-started/troubleshooting#wifi-setup-and-reset-recovery) before erasing a display.

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
