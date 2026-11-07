---
title: Subpages
description: Create extra pages on your EspDesktop display to organise cards into simple groups.
---

# Subpages

![A subpage with a Back card and grouped controls](/images/screen-subpage.png)

A subpage is an extra screen opened from a **Subpage** card. Use it to group related cards without crowding the home screen. Each subpage has its own layout and includes a **Back** card, leaving one fewer space for other cards. On app subpages, the Back card shows the app’s large icon and returns to the home screen when touched. Its saved name remains editable in card settings, while the icon fills the card on the display. Regular subpages keep their Back arrow and label.

Cards on the home screen and subpages act as soon as you touch them. Fixed control buttons, tabs, PIN keys and panel close buttons also respond on touch-down. Confirmation prompts still require an explicit choice. Sliders and scrollable choices keep their drag and release behavior so scrolling does not accidentally select an item.

All subpages, including app subpages and the Special Page, hide their top title and clock bar so cards use the full screen. Clock Bar settings apply to the home screen only. App subpages show their app artwork on the return-home card.

Under **Device settings → App Subpages**, **Return home when switching apps** is on by default. Turn it off to keep the current app subpage open when you switch apps on your Mac. With it on, the display leaves that page: it opens the new app’s subpage when **Open app subpages on focus** is enabled and a matching page exists, or returns home otherwise. The setting is saved on the display and included in backups.

## Create a Subpage

1. Open the display's setup page in a browser and choose the **Layout** tab.
2. Select an empty home-screen space and choose **Subpage** as the card type.
3. Give the card a label and icon if you want them.
4. Choose **Edit Subpage** in the card settings.
5. Add and arrange cards on the subpage as you would on the home screen.
6. Choose its **Back** card to return to the home screen.

You can also right-click an empty space in the editor and choose **Create Subpage**.

Home Assistant type presets are available after a Home Assistant connection is configured. Until then, Subpage cards stay as regular **Folder** pages.

## Organise Cards

Drag cards to change their order. To move or copy a card between the home screen and a subpage, right-click it and choose **Cut** or **Copy**, then right-click an empty space on the destination page and choose **Paste**.

Choose **Apply Configuration** to save your changes to the display.

To customise a Back card, edit its name and colours in the editor. Its default and active colours are saved with the subpage and included in backups. Subpage, Back and Close buttons change page as soon as you touch them, without waiting for a highlight or release. App subpages with automatic opening enabled also open immediately, without waiting for the Mac to confirm focus. In manual mode, the first press still focuses the app and a later press opens its subpage.

## Swipe-up page

Swipe up from the bottom edge of the home screen or a card subpage to open a
separate page. A short upward swipe from the bottom edge opens it; a long drag
is not needed. Choose **Configure swipe-up page** below the display preview in the web layout editor to add cards.
Use the page-name button above the device preview to rename it, then choose **Save**. Use the
reset icon and save to restore the default. The custom name is saved with the
page for use in the editor and backups.
It starts empty, supports ordinary cards, and cannot contain nested subpages.
Its **Close** button, marked with a cross icon, returns to the screen you came
from. Screen Lock blocks the swipe, and the gesture is unavailable on setup screens, screensavers and modals.
The page is saved on the display and included in backups.
