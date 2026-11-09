---
title: "Organize Cards in Local Folders"
description: "Use local Subpages for Mac and panel controls, with optional Mac statistics on folder tiles."
---

# Subpages

Subpages are folders that open another page of cards. Add a **Subpage**, choose a label and icon, then use **Edit Subpage** to arrange its child cards. Navigation remains local to the panel.

A subpage is an extra screen opened from a **Subpage** card. Use it to group related cards without crowding the home screen. Each subpage has its own layout and includes a **Back** card, leaving one fewer space for other cards. On app subpages, the Back card shows the app’s large icon with a back arrow at the bottom left. Tap the card to return to its parent page. Its saved name remains editable in card settings, while the icon fills the card on the display. Regular subpages keep their Back arrow and label.

All subpages hide the top title and clock bar so the cards use the full screen. Clock Bar settings apply to the home screen only.

## Mac statistics

Choose **Companion Stat** to show a Mac statistic on the folder tile while keeping the tap action as navigation. Select the statistic and, where available, used/free display or a storage device. A paired Mac provides the readings.

## App page behavior

Under **Device settings → App Subpages**, **Return home when switching apps** is on by default. Turn it off to keep the current app page open when you switch apps on the Mac. With it on, the display opens a matching new app page when automatic opening is enabled, or returns to the immediate parent page. The setting is saved on the display and included in backups.

## Saved Home Assistant folders

Home Assistant sensor labels, status icons, presets and aggregated child-state indicators are retired. Their saved configuration remains in layouts and backups, but the folder no longer subscribes to those entities. The folder still opens its cards; Mac and local children continue to work.

Opening the editor keeps the old settings. Choosing a new folder type explicitly replaces the old bindings. Replace retired child cards individually when updating a layout.
## Create a Subpage

1. Open the display's setup page in a browser and choose the **Layout** tab.
2. Select an empty home-screen space and choose **Subpage** as the card type.
3. Give the card a label and icon if you want them.
4. Choose **Edit Subpage** in the card settings.
5. Add and arrange cards on the subpage as you would on the home screen.
6. Choose its **Back** card to return to the home screen.

You can also right-click an empty space in the editor and choose **Create Subpage**.

Two levels are supported: **Home → Folder → Subpage**, including **Home → Folder → App shortcuts**. Open a folder and repeat the steps above to add the second level. Back returns to the immediate parent page. A second-level page cannot contain another subpage.

For an app inside a folder, edit its app card, enable **Add app subpage**, and save. Choose **Edit Subpage** to arrange its shortcuts. The normal app focus and automatic switching settings also apply inside folders.

Pages share the display's existing total card and saved-layout limits. A layout that exceeds them is rejected without replacing the saved layout.

Nested layouts use the new saved-layout format and require firmware with two-level support. Keep a backup before upgrading. After saving with this release, downgrading to older firmware is unsupported. The new firmware still imports older flat layouts and backups.

## Organise Cards

Drag cards to change their order. To move or copy a card between the home screen and a subpage, right-click it and choose **Cut** or **Copy**, then right-click an empty space on the destination page and choose **Paste**.

Open **Screen** or **System** and choose **Apply Configuration** to apply your changes to the display.

To customise a Back card, edit its name and colours in the editor. Its default and active colours are saved with the subpage and included in backups. Subpage and Back buttons change page as soon as you touch them, without waiting for a highlight or release. App subpages with automatic opening enabled also open immediately, without waiting for the Mac to confirm focus. In manual mode, the first press still focuses the app and a later press opens its subpage.

Returning with **Back** or a swipe shows the destination page before loading any missing app artwork. Cached icons appear straight away; other icons can appear shortly afterward.

## Swipe back

Swipe right from the left edge of a subpage to use its **Back** action. This also
works on app subpages. A short swipe is enough. Swiping right on the home screen does nothing.

Screen Lock blocks the gesture. It is unavailable on setup screens, screensavers and while a popup is open.
