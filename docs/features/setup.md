---
title: Configure Your Mac Control Surface
description: Add Mac Companion cards, arrange them into pages, and customise the EspDesktop touchscreen from its built-in web editor.
---

# Configure Your Mac Control Surface

After pairing the Mac app, open the display's address in a browser and use its built-in editor to add cards and organise your controls. The Mac app supplies the actions; the display editor determines where those controls appear.

## Add a Mac Control

1. Open the **Layout** tab in the display's web page.
2. Select an empty tile and choose **Companion**.
3. Choose a control type, such as **Applications**, **Keyboard shortcut**, **Open folder**, or **Open URL**.
4. Set the options and choose **Apply Configuration** to save the layout.

Apps and folders must first be approved in the Mac app. Keyboard shortcuts need Accessibility permission. See [Mac Controls](/card-types/companion) for the available actions and requirements.

## Arrange and Personalise Cards

- Drag cards to move them. Dropping one onto an occupied tile shifts that card to the next available space.
- Drag a card’s bottom-right resize handle to make it wider or taller. Press Escape or cancel the drag to keep the original size.
- Click a displayed card name to rename it and press Enter to save. Escape or clicking away cancels. Generated status text stays automatic.
- Customise the card’s label and colours. The icon options depend on the card type. If you can’t find the icon you need, [request it](/reference/request-icons).
- Create [subpages](/features/subpages) to group related Mac controls or keep an app's shortcuts together.
- Right-click a card and choose **Cut** to remove it immediately, then **Paste** on an empty tile to place it elsewhere. Its settings and any subpages stay available in the editor clipboard until pasted or replaced. If you never paste it, it remains deleted.
- Right-click a card and choose **Copy Code** to copy its code straight to your clipboard. A notification confirms the copy. Use **Paste Code** on another display to reuse it.

The display preview shows the saved arrangement. Choose **Apply Configuration** after editing to send it to the touchscreen.

## Screen and System Settings

Use **Screen** for appearance, backlight, rotation and sleep settings. Use **System** for Mac Companion pairing and connection status, preferences, backups, firmware updates and reset controls.

## Show Mac Cover Art

After pairing, open **Screen → Sleep & Schedule → Cover Art Screen Saver** and turn on **Show Cover Art**. When an app on the paired Mac supplies artwork through macOS Now Playing, the display can show it fullscreen. Set the delay with **Show After** and the length of time track information appears with **Show Track Details For**. Tap the screen to wake it, then enter your display PIN if prompted.

## Protect the Touchscreen

Open **Screen → Sleep & Schedule → Pin Protection**, turn on **Require PIN after wake**, enter a numeric PIN of 1–16 digits and choose **Save**. You can also randomize the keypad. **Clear** removes the saved PIN and unlocks the display.

Unlock protection applies to local touch controls; web administration and Mac access keep their own authentication. The PIN is excluded from backups, and importing a backup clears the PIN on the destination display.

Locking your paired Mac also locks the touchscreen while the EspDesktop Mac app is running. Unlock your Mac to use the touchscreen again. If the connection drops while locked, the display waits for EspDesktop to reconnect and report that the Mac has unlocked. A separately configured display PIN still applies.

## Back Up Your Layout

Use **System → System → Backup** to save a copy of the display configuration before making major changes. Keep the backup file private if it contains web addresses or other personal configuration.

## Quick card colours

Right-click a preview card and open **Change Colour** to choose a preset or custom background. Select several cards to recolour them together; subpage Back cards also support this. **Reset Colour** restores the default background while preserving a separate active colour. Changes save immediately.

Current firmware supports up to 4 KB per saved card or subpage record (4,095 bytes of content). The editor keeps the smaller limits when connected to older firmware. Export a backup before downgrading firmware: larger layouts cannot fit its older text storage.
