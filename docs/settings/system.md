---
title: EspDesktop System Settings
description: Manage Mac pairing, language, time, device name, backups, firmware and resets on your EspDesktop display.
---

# System settings

Choose **Customize Display** from the EspDesktop menu bar icon, or open the display’s local address in your browser. Select the **System** tab to manage the device.

Choose **Apply Configuration** at the bottom of the tab when you’re ready to restart the display and apply your changes.

## Display system settings

<a href="/images/web-editor-system-settings.png"><img src="/images/web-editor-system-settings.png" alt="System tab showing Mac Companion, Language, Time, Device Name, Backup, Firmware and Factory Reset" width="1694" height="2266" loading="lazy"></a>

### Mac Companion and preferences

- **Connectors → Mac Companion** is where you [pair the Mac app](/screens/4848s040#pair-the-display) and check its connection.
- **Preferences → Language** changes the language shown on the touchscreen.
- **Preferences → Time** lets you follow the paired Mac’s time zone or choose one yourself. You can also switch between 12- and 24-hour time and set custom time servers.

### Mac screen lock {#protect-the-touchscreen}

Locking your paired Mac also locks the touchscreen while the EspDesktop Mac app is running. If the connection drops while locked, the display waits for EspDesktop to reconnect and report that your Mac has unlocked.

### Rename the display {#naming-your-panel}

Open **System → Device Name** within the **System** tab and choose **Save & Restart** after entering a name. Reopen the editor at the new `.local` address shown there. The browser tab shows **EspDesktop - Kitchen**, for example, or **EspDesktop - 5c6c** using the last four characters of the device’s MAC address if no name is set.

### Backup

Open **Backup** under the **System** heading in the **System** tab. Use **Export** to save the display’s configuration to a file and **Import** to restore it. [Back up and restore a configuration](/settings/backup).

### Update the display firmware {#update-the-display-firmware}

In the **System** tab, open **Firmware → Firmware updates** and choose **Check for Update**. If an update is available, choose **Install Update** and keep the display powered while it restarts. **Auto updates** controls automatic installation and how often the display checks.

[Export a backup](/settings/backup#export-a-backup) before updating and use [matching Mac app and firmware releases](/settings/mac-app#check-for-mac-app-updates). **Previous firmware** can install an older version when available. If it can’t read your current layout, use a backup made before the upgrade.

### Reset the display

Open **Factory Reset** in the **System** tab and choose **Save backup** before resetting.

- **Partial reset** clears cards, layouts, subpages, the saved device name and display preferences. It keeps your Wi-Fi connection and Mac pairing.
- **Complete reset** also clears saved Wi-Fi and Mac pairing. Type **RESET** to confirm, then follow the first-time setup instructions on the display.

Both options keep the installed firmware. Wait for the reset to finish before importing a backup. [Reset and Wi-Fi recovery](/getting-started/troubleshooting#wifi-setup-and-reset-recovery).

<span id="mac-app-settings"></span><span id="check-for-mac-app-updates"></span>

See [Mac app settings](/settings/mac-app) or [check for Mac app updates](/settings/mac-app#check-for-mac-app-updates).
