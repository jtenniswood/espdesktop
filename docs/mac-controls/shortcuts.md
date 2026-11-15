---
title: Run Mac Keyboard Shortcuts from a Touchscreen
description: Turn custom Mac keyboard shortcuts into tappable EspDesktop tiles or choose presets for apps such as Safari, Slack and Figma.
---

# Run Mac keyboard shortcuts

A **Key Shortcut** card can run a preset for a specific Mac app or send a custom key combination to the active app.

## Create a shortcut card

1. In the display’s web editor, select an empty tile and choose **Companion → Key Shortcut**.
2. Use the **Application** tab, which opens by default, to pick a preset for an app. Switch to **Custom** to enter keys such as **⌘ Command + F**.
3. Save and tap the card. An Application preset opens or focuses the selected app before sending the keys. A Custom shortcut sends the keys to whichever app is already active.

The **Application** tab lists apps with shortcut presets. After choosing an app, use **Find a keyboard shortcut…** to search by name or key combination, then select a row. For example, type **New Tab** or **Cmd+T**. Bundled presets are available while the Mac is offline. Expanded presets can include single keys and sequences, and need an updated display and Mac Companion. Approve the target app in EspDesktop on your Mac. The card skips the shortcut if the app cannot be brought to the front.

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
