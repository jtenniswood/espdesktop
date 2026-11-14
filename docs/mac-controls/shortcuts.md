---
title: Run Mac Keyboard Shortcuts from a Touchscreen
description: Turn custom Mac keyboard shortcuts into tappable EspDesktop tiles or choose presets for apps such as Safari, Slack and Figma.
---

# Run Mac keyboard shortcuts

Tap a **Key Shortcut** card to send a key combination to the active Mac app.

## Create a shortcut card

1. In the display’s web editor, select an empty tile and choose **Companion → Key Shortcut**.
2. Select the **Custom** tab to enter keys such as **⌘ Command + F**, or the **Application** tab to pick a preset for an app.
3. Save the card. Bring the app to the front on your Mac, then tap the card.

The **Application** tab lists apps with shortcut presets. After choosing an app, use **Search by name or keys** to narrow the list. For example, type **New Tab** or **Cmd+T**. Bundled presets are available while the Mac is offline. Expanded presets can include single keys and sequences, and need an updated display and Mac Companion. Bring the approved app to the front before tapping one.

Custom shortcuts need **Command**, **Control**, or **Option** plus a key. **Shift** is optional.

[Look up keyboard shortcut presets by app](/reference/shortcut-presets).

## Allow accessibility access

Enable **EspDesktop** in **System Settings → Privacy & Security → Accessibility** so it can send keystrokes.

<a href="/images/mac-companion-shortcut-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-shortcut-access-480.avif 480w, /images/mac-companion-shortcut-access-960.avif 960w" sizes="(min-width: 768px) 612px, 90vw"><img src="/images/mac-companion-shortcut-access.png" alt="EspDesktop’s Enable Shortcuts step with the macOS permission prompt and Open System Settings button" width="612" height="744" loading="lazy"></picture></a>

If a tile still does nothing, follow [the shortcut and Mac Lock troubleshooting steps](/getting-started/troubleshooting#a-card-does-not-work).

## Group shortcuts by app {#use-a-template-on-an-app-subpage}

Use [ready-made app subpages](/mac-controls/apps#ready-made-app-subpages) to keep an app’s shortcuts together. New pages start with a selection of useful shortcuts for the app. Smaller displays show as many as will fit, with space for **Back**. From inside an app’s subpage in the web editor, right-click a card and choose **Shortcut List** to change which presets appear and how they’re ordered. This opens the full list, with **Find a shortcut** available for long lists. In the app card’s settings, use **Show all shortcuts** to expand a long list. You can add shortcuts or rearrange the ones on the page.

When you add a **Key Shortcut** card inside an app subpage, the **Application** tab opens with that app selected. You can pick a different app or switch to **Custom**.

The web editor dims these shortcuts when the app loses focus or the Mac disconnects. You can still edit and rearrange the tiles.

<span id="add-templates-for-another-app">Missing a preset?</span> [Suggest a shortcut](/mac-controls/improve-shortcuts).
