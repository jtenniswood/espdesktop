---
title: Run Mac Keyboard Shortcuts
description: Create Companion cards that replay keyboard shortcuts in the active Mac app, with Accessibility permission.
---

# Run Mac Keyboard Shortcuts

A **Companion → Keyboard shortcut** card sends a chosen key combination to whichever Mac app is active when you tap it.

## Create a Shortcut Card

1. In the display setup page, add a **Companion → Keyboard shortcut** card.
2. Choose a type:
   - **Custom Shortcut**: expand the **Shortcut** panel, click the modifier buttons, then choose a key from the list. For Command-W, click **⌘ Command**, choose **W**, and save. You do not need to press the shortcut on your Mac.
   - **Shortcut Catalog**: choose **Safari**, then select Back, Forward, Reload, New Tab, or Close Tab. The card starts with the shortcut's name and icon; you can customise them in Card Settings.
3. Give the card a label and icon if needed, then save the display configuration.

Shortcuts must include Command, Control, or Option with a supported letter, number, function, navigation, or punctuation key. Shift is optional. Modifier-only combinations and unsupported system keys are rejected. Bring Safari to the front before using a Safari catalog shortcut. Choosing Safari in the catalog does not launch it.

## Allow Accessibility Access

macOS requires Accessibility access so EspDesktop can replay keyboard input. In the Mac app, choose **Open Settings**, then enable EspDesktop in **System Settings → Privacy & Security → Accessibility**.

For the currently active window, see [Window controls](/mac-controls/windows).
