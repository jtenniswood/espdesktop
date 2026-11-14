---
title: Run Mac Keyboard Shortcuts from a Touchscreen
description: Turn custom Mac keyboard shortcuts into tappable EspDesktop tiles or choose presets for apps such as Safari, Slack and Figma.
---

# Run Mac keyboard shortcuts

Tap a **Keyboard Shortcut** card to send a key combination to the active Mac app.

## Run an Apple Shortcuts workflow

Use a **Run Apple Shortcut** card to run a workflow you created in the Mac’s **Shortcuts** app. Use matching versions of the EspDesktop Mac app and display firmware.

1. Create a workflow in Shortcuts and run it there to check that it works.
2. In the EspDesktop Mac app, open **Apple Shortcuts** and enable the workflow you want the display to run. Use **Refresh Apple Shortcuts** after creating, renaming, or deleting a workflow.
3. In the display’s web editor, select an empty tile, choose **Companion → Run Apple Shortcut**, select the workflow, and save.
4. With your Mac unlocked, tap the tile. If the workflow asks for input or permission, respond on the Mac.

To remove access, turn off the workflow in **Apple Shortcuts** in the EspDesktop Mac app.

## Create a keyboard shortcut card {#create-a-shortcut-card}

1. In the display’s web editor, select an empty tile and choose **Companion → Keyboard Shortcut**.
2. Select the **Custom** tab to enter keys such as **⌘ Command + F**, or the **Application** tab to pick a preset for an app.
3. Save the card. Bring the app to the front on your Mac, then tap the card.

The **Application** tab lists apps with keyboard shortcut presets. After choosing an app, use **Search by name or keys** to narrow the list. For example, type **New Tab** or **Cmd+T**. Bundled presets are available while the Mac is offline. Expanded presets can include single keys and sequences, and need an updated display and Mac Companion. Bring the approved app to the front before tapping one.

Custom keyboard shortcuts need **Command**, **Control**, or **Option** plus a key. **Shift** is optional.

[Look up keyboard shortcut presets by app](/reference/shortcut-presets).

## Allow accessibility access

Enable **EspDesktop** in **System Settings → Privacy & Security → Accessibility** so it can send keystrokes.

<a href="/images/mac-companion-shortcut-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-shortcut-access-480.avif 480w, /images/mac-companion-shortcut-access-960.avif 960w" sizes="(min-width: 768px) 612px, 90vw"><img src="/images/mac-companion-shortcut-access.png" alt="EspDesktop’s Enable Keyboard Shortcuts step with the macOS permission prompt and Open System Settings button" width="612" height="744" loading="lazy"></picture></a>

If a tile still does nothing, follow [the keyboard shortcut and Mac Lock troubleshooting steps](/getting-started/troubleshooting#a-card-does-not-work).

## Group keyboard shortcuts by app {#use-a-template-on-an-app-subpage}

Use [ready-made app subpages](/mac-controls/apps#ready-made-app-subpages) to keep an app’s keyboard shortcuts together. New pages start with a selection of useful keyboard shortcuts for the app. Smaller displays show as many as will fit, with space for **Back**. From inside an app’s subpage in the web editor, right-click a card and choose **Keyboard Shortcut List** to change which presets appear and how they’re ordered. This opens the full list, with **Find a keyboard shortcut…** available for long lists. In the app card’s settings, use **Show all keyboard shortcuts** to expand a long list. You can add keyboard shortcuts or rearrange the ones on the page.

When you add a **Keyboard Shortcut** card inside an app subpage, the **Application** tab opens with that app selected. You can pick a different app or switch to **Custom**.

The web editor dims these keyboard shortcuts when the app loses focus or the Mac disconnects. You can still edit and rearrange the tiles.

<span id="add-templates-for-another-app">Missing a preset?</span> [Suggest a keyboard shortcut](/mac-controls/improve-shortcuts).
