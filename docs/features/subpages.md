---
title: Create Subpages for Mac Controls
description: Group apps and keyboard shortcuts on your EspDesktop touchscreen, create nested pages, or show Mac stats on a subpage tile.
---

# Create Subpages for Mac Controls {#subpages}

Use a **Subpage** card to open a folder of related controls. Each subpage reserves one tile for **Back**, which takes you to its parent page. App subpages use the app’s large icon as their Back tile. Other subpages use an arrow and label.

All subpages hide the top title and clock bar so the cards use the full screen. Clock Bar settings apply to the home screen only.

## Mac statistics

Choose **Companion Stat** to show a Mac statistic on the folder tile while keeping the tap action as navigation. Select the statistic and, where available, used/free display or a storage device. A paired Mac provides the readings.

## App page behavior

Under **Screen → Appearance → App Subpages**, **Return home when switching apps** is on by default. Turn it off to keep the current app page open when you switch apps on the Mac. With it on, the display opens a matching new app page when automatic opening is enabled, or returns to the immediate parent page. The setting is saved on the display and included in backups.

## Create a Subpage

1. Open the display's setup page in a browser and choose the **Layout** tab.
2. Select an empty home-screen space and choose **Subpage** as the card type.
3. Give the card a label and icon if you want them.
4. Choose **Edit Subpage** in the card settings.
5. Add and arrange cards on the subpage as you would on the home screen.
6. Choose its **Back** card to return to the parent page.

![Subpage editor with a Back tile, four browser shortcuts and dashed empty tiles for adding more controls](/images/web-editor-subpage.jpg)

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

Swipe right from the left edge of a subpage to use its **Back** action. This also works on app subpages while the touchscreen is unlocked and showing its cards.
