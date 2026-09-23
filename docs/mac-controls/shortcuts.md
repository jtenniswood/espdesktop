---
title: Run Mac Keyboard Shortcuts
description: Create Companion cards that replay keyboard shortcuts in the active Mac app, with Accessibility permission.
---

# Run Mac Keyboard Shortcuts

A **Companion → Keyboard shortcut** card sends a chosen key combination to whichever Mac app is active when you tap it.

## Create a Shortcut Card

1. In the display setup page, add a **Companion → Keyboard shortcut** card.
2. Select the modifier buttons you want, then select the shortcut field and press the final key by itself. For example, click **Command**, then press `R` to create Command+R without triggering the browser's Reload command.
3. Give the card a label and icon, then save the display configuration.

Shortcuts must include Command, Control, or Option with a supported letter, number, function, navigation, or punctuation key. Shift is optional. Modifier-only combinations and unsupported system keys are rejected.

## Allow Accessibility Access

macOS requires Accessibility access so EspDesktop can replay keyboard input. In the Mac app, choose **Open Settings**, then enable EspDesktop in **System Settings → Privacy & Security → Accessibility**.

For the currently active window, see [Window controls](/mac-controls/windows).
