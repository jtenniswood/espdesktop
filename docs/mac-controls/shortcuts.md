---
title: Run Keyboard Shortcuts from a Touchscreen
description: Turn macOS and Windows keyboard shortcuts into tappable EspDesktop tiles or choose presets for your apps.
---

<script setup>
import { withBase } from 'vitepress'
import { onMounted } from 'vue'

onMounted(() => {
  if (window.location.hash === '#run-an-apple-shortcuts-workflow') {
    window.location.replace(withBase('/mac-controls/apple-shortcuts'))
  }
})
</script>

# Run keyboard shortcuts

A **Keyboard Shortcut** card can run a preset for a specific app or send a custom key combination to the active app.

## Create a keyboard shortcut card {#create-a-shortcut-card}

1. In the display’s web editor, select an empty tile and choose **Companion → Keyboard Shortcut**.
2. Use the **Application** tab, which opens by default, to pick a preset for an app. Switch to **Custom** to enter keys such as **Command + F** on macOS or **Ctrl + F** on Windows.
3. Save and tap the card. An Application preset opens or focuses the selected app before sending the keys. A Custom shortcut sends the keys to the app already in front. On Windows, that app must be approved in EspDesktop.

The **Application** tab lists apps with presets for the paired computer. Choose an app and use **Find a keyboard shortcut…** to search by action name or key combination. Approve the target app in EspDesktop. If the app cannot be brought to the front, the card skips the shortcut. On Windows, bring the app forward and tap the card again if Windows keeps another window active.

Custom shortcuts need **Command**, **Control**, or **Option** plus a key on macOS, or **Ctrl** or **Alt** plus a key on Windows. **Shift** is optional on either platform. When moving a preset card between platforms, reopen its settings and choose the app and shortcut again.

On Windows, saved custom shortcuts map Command and Control to **Ctrl**, and Option to **Alt**. Keep the app and display firmware current to see the full preset list. Older compatible display firmware shows the starter presets.

[Look up keyboard shortcut presets by app](/reference/shortcut-presets).

## Enable keyboard shortcuts

On Windows, open **Display → Windows integration** in EspDesktop and turn on **Allow keyboard shortcuts and screen lock**. Windows protects apps running as administrator from these keystrokes.

### Allow accessibility access on macOS {#allow-accessibility-access}

Enable **EspDesktop** in **System Settings → Privacy & Security → Accessibility** so it can send keystrokes.

<a href="/images/mac-companion-shortcut-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-shortcut-access-480.avif 480w, /images/mac-companion-shortcut-access-960.avif 960w" sizes="(min-width: 768px) 612px, 90vw"><img src="/images/mac-companion-shortcut-access.png" alt="EspDesktop’s Enable Keyboard Shortcuts step with the macOS permission prompt and Open System Settings button" width="612" height="744" loading="lazy"></picture></a>

If a tile still does nothing, follow [the keyboard shortcut and Lock Machine troubleshooting steps](/getting-started/troubleshooting#a-card-does-not-work).

With the companion app connected, the editor loads its shortcut catalogue over your local network. On macOS, the editor also has a starter set of presets available while disconnected. Saved cards retain their shortcut keys.

## Group keyboard shortcuts by app {#use-a-template-on-an-app-subpage}

Use [ready-made app subpages](/mac-controls/apps#ready-made-app-subpages) to keep an app’s keyboard shortcuts together. New pages start with a selection of useful keyboard shortcuts for the app. Smaller displays show as many as will fit, with space for **Back**. From inside an app’s subpage in the web editor, right-click a card and choose **Keyboard Shortcut List** to change which presets appear and how they’re ordered. This opens the full list, with **Find a keyboard shortcut…** available for long lists. In the app card’s settings, use **Show all keyboard shortcuts** to expand a long list. You can add keyboard shortcuts or rearrange the ones on the page.

When you add a **Keyboard Shortcut** card inside an app subpage, the **Application** tab opens with that app selected. You can pick a different app or switch to **Custom**.

On Windows, a new app subpage starts with the first seven available shortcuts. Edit the selection in the display editor.

The web editor dims these keyboard shortcuts when the app loses focus or the computer disconnects. You can still edit and rearrange the tiles.

## Control Streamlabs Desktop on macOS {#control-streamlabs-desktop}

Approve **Streamlabs Desktop** in the EspDesktop Mac app. Choose **Keyboard Shortcut → Application → Streamlabs Desktop** for menu shortcuts such as **Open Settings**, **Undo** and **Copy**, or save a Streamlabs Desktop application card to add its shortcut subpage. The nudge presets move a selected source in the Streamlabs editor.

For scene switching, mic mute or recording, assign a key combination in [Streamlabs Desktop → Settings → Hotkeys](https://support.streamlabs.com/hc/en-us/articles/4413170379675-How-to-Set-up-Hotkeys-in-Streamlabs-Desktop). Choose a combination with Command, Control or Option that works from your Mac keyboard, then enter the same keys in a **Keyboard Shortcut → Custom** tile. You can put these tiles on the Streamlabs app subpage. Bring Streamlabs to the front before using a Custom tile, which sends keys to the active Mac app.

<span id="add-templates-for-another-app">Missing a preset?</span> [Suggest a keyboard shortcut](/mac-controls/improve-shortcuts).
