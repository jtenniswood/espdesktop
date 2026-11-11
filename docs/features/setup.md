---
title: Configure Your Mac Touchscreen in the Web Editor
description: Use the EspDesktop web editor to add app and shortcut tiles, arrange subpages, and adjust appearance, brightness and sleep settings.
---

# Configure Your Mac Control Surface

After pairing the Mac app, open the display's address in a browser and use its built-in editor to add cards and organise your controls. The Mac app supplies the actions; the display editor determines where those controls appear.

## Add a Mac Control

1. Open the **Layout** tab in the display's web page.
2. Select an empty tile and choose **Companion**.
3. Choose a control type, such as **Applications**, **Folder**, **Key Shortcut**, or **Website**.
4. Set the options and choose **Save** in the card editor. The layout updates on the touchscreen.

Apps and folders must first be approved in the Mac app. Keyboard shortcuts and Mac Lock need Accessibility permission. See [Mac Controls](/#what-you-can-control) for the available actions and requirements.

## Arrange and Personalise Cards

- Drag cards to move them. Dropping one onto an occupied tile shifts that card to the next available space.
- Drag a card’s bottom-right resize handle to make it wider or taller. Press Escape or cancel the drag to keep the original size.
- Click a displayed card name to rename it and press Enter to save. Escape or clicking away cancels. Generated status text stays automatic.
- Customise the card’s label and colours. The icon options depend on the card type. If you can’t find the icon you need, [request it](/reference/request-icons).
- Create [subpages](/features/subpages) to group related Mac controls or keep an app's shortcuts together.
- Right-click a card and choose **Cut** to remove it immediately, then **Paste** on an empty tile to place it elsewhere. Its settings and any subpages stay available in the editor clipboard until pasted or replaced. If you never paste it, it remains deleted.
- Right-click a card and choose **Copy Code** to copy its code straight to your clipboard. A notification in the bottom-left corner confirms the copy. Use **Paste Code** on another display to reuse it.

The display preview shows the saved arrangement. **Apply Configuration**, at the bottom of **Screen** and **System**, restarts the display. Routine card and layout edits take effect when saved.

## Screen and System Settings

Use **Screen** for appearance, backlight, rotation and sleep settings. For example, open **Appearance → App Subpages** to choose how the display reacts when you switch apps on your Mac.

[![Screen tab with App Subpages expanded, showing Open app subpages on focus and Return home when switching apps](/images/web-editor-screen-settings.jpg)](/images/web-editor-screen-settings.jpg)

| Setting | Where to find it | Options |
|---|---|---|
| Card appearance | **Screen → Appearance → Active Colour** or **Card Style** | Set the accent colour, card curve and default app icon size. |
| Theme | **Screen → Appearance → Theme** | Choose Dark, Light or Automatic. Automatic switches by sunrise and sunset or at times you set. |
| Clock bar | **Screen → Appearance → Clock Bar** | Show or hide the status bar on the home screen. |
| Brightness | **Screen → Display → Backlight** | Set a fixed level with Manual, use sunrise and sunset with Automatic, or choose dawn and dusk times with Timed. Automatic and Timed use separate day and night levels. |
| Rotation | **Screen → Display → Rotation** | Choose 0°, 90°, 180° or 270° to suit how the display is mounted. |
| Screensaver | **Screen → Sleep & Schedule → Screensaver** | Choose Disabled, Timer or App Connection. Timer acts after idle time. App Connection is available once a Mac is paired and acts when the Mac disconnects or locks. Choose Screen Dimmed, Clock or Display Off. |
| Night Schedule | **Screen → Sleep & Schedule → Night Schedule** | Set when night mode starts and ends. Choose Screen Dimmed, Screen Off or Clock. The schedule takes priority over the screensaver. |
| Language | **System → Preferences → Language** | Choose the language shown on the touchscreen. |
| Time | **System → Preferences → Time** | Follow the paired Mac’s time zone or choose one. Set a 12- or 24-hour clock and optionally specify your own time servers. |

On a new display, Night Schedule dims the screen to **15%** from **7:00 PM to 7:00 AM** in the display’s local time. Tap to wake the display when it is asleep, then tap again to use a card.

Use **System → Mac Companion** to pair or check the connection. The **System** tab also contains preferences, backups, firmware updates and reset controls. To rename the display, open **System → System → Device Name** and choose **Save & Restart**. Reopen the editor at the new `.local` address shown there.

[![System tab with Mac Companion expanded and showing a connected status](/images/web-editor-system-settings.jpg)](/images/web-editor-system-settings.jpg)

## Mac Screen Lock {#protect-the-touchscreen}

Locking your paired Mac also locks the touchscreen while the EspDesktop Mac app is running. Unlock your Mac to use the touchscreen again. If the connection drops while locked, the display waits for EspDesktop to reconnect and report that the Mac has unlocked.

## Back Up Your Layout

Under **System → System → Backup**, choose **Export** to download a copy of your cards, subpages and display settings. Choose **Import** to restore the file on a compatible display. If the file includes a device name, **Also restore panel name** is optional and can change the display’s network address.

Backup files omit Wi-Fi credentials and Mac pairing. On a replacement or fully reset display, [connect it to Wi-Fi](/getting-started/install#connect-the-display-to-wifi) and [pair the Mac app](/getting-started/mac-app#pair-the-display) separately. Keep backup files private if they contain personal settings or web addresses. See [reset and recovery](/getting-started/troubleshooting#wifi-setup-and-reset-recovery) before erasing a display.

## Update the Display Firmware

Open **System → System → Firmware → Firmware updates** to check the current and available versions. Choose **Check for Update**, then **Install Update** when offered. Keep the display powered while it restarts. **Auto updates** controls automatic installation and how often the display checks.

Export a backup before updating and use [matching Mac app and firmware releases](/getting-started/mac-app#check-for-mac-app-updates). **Previous firmware** can install an older version when available. If the older version cannot read your current layout, use a backup made before the upgrade.

## Quick card colours

Right-click a preview card and open **Change Colour** to choose a preset or custom background. Select several cards to recolour them together; subpage Back cards also support this. **Reset Colour** restores the default background while preserving a separate active colour. Changes save immediately.

Current firmware supports up to 4 KB per saved card or subpage record (4,095 bytes of content). The editor keeps the smaller limits when connected to older firmware. Export a backup before downgrading firmware: larger layouts cannot fit its older text storage.
