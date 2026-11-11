---
title: EspDesktop Device and System Settings
description: Use the Screen and System tabs to customise your display, manage Mac pairing, back up settings and update firmware.
---

# Device and system settings

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

Export a backup before updating and use [matching Mac app and firmware releases](/getting-started/mac-app#check-for-mac-app-updates). **Previous firmware** can install an older version when available. If it can’t read your current layout, use a backup made before the upgrade.

### Reset the display

Open **Factory Reset** in the **System** tab and choose **Save backup** before resetting. A partial reset clears cards, layouts and device preferences while keeping Wi-Fi and Mac pairing. A complete reset also clears saved Wi-Fi and pairing. See [reset and recovery](/getting-started/troubleshooting#wifi-setup-and-reset-recovery) before erasing a display.

## Arrange and personalise cards {#arrange-and-personalise-cards}

The [Home guide](/features/home) walks through editing the grid, adding cards and creating custom subpages.

Use **Layout** to move cards, drag their bottom-right handles to resize them, or click a card name to rename it. Right-click a card to cut it for pasting into another tile or copy its code for another display. You can also [create subpages](/features/subpages) to group related controls. Layout changes take effect when saved.

### Add a Mac control {#add-a-mac-control}

Select an empty tile in **Layout**, choose a **Companion** control such as Applications, Folder, Key Shortcut or Website, then set its options and choose **Save**. See [Mac controls](/#what-you-can-control) for the available actions and permissions.

### Quick card colours {#quick-card-colours}

Right-click one or more cards and choose **Change Colour** to set a preset or custom background. **Reset Colour** restores the default background and keeps any custom active colour.
