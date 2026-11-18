---
title: Run Mac Keyboard Shortcuts from a Touchscreen
description: Turn custom Mac keyboard shortcuts into tappable EspDesktop tiles or choose presets for apps such as Safari, Slack and Figma.
---

# Run Mac keyboard shortcuts

A **Keyboard Shortcut** card can run a preset for a specific Mac app or send a custom key combination to the active app.

## Run an Apple Shortcuts workflow

Use a **Run a shortcut** card to run a workflow you created in the Mac’s **Shortcuts** app. Use matching versions of the EspDesktop Mac app and display firmware.

1. Create a workflow in Shortcuts and run it there to check that it works.
2. In the EspDesktop Mac app, open **Shortcuts**. **All available shortcuts** is on by default. Choose **Manage Shortcuts** to open the Gallery in the Shortcuts app. The list updates when you return to EspDesktop.
3. In the display’s web editor, select an empty tile, choose **Companion → Apple Shortcuts → Run a shortcut**, select the workflow, and save.
4. With your Mac unlocked, tap the tile. If the workflow asks for input or permission, respond on the Mac.

To choose which workflows your displays can run, turn off **All available shortcuts** and turn on the workflows you want to allow.

To open a page of workflows directly from your Home screen, choose **Companion → Apple Shortcuts → Create Shortcuts Subpage**. The editor selects up to eight workflows in alphabetical order, with one tile reserved for **Back**. Use the full list to choose and reorder the workflows you want. To edit them later, open the subpage in the web editor, right-click a tile, and choose **Apple Shortcut List**.

Choose **Companion → Apple Shortcuts → Open Shortcuts App** to pin an **Applications** card with **Shortcuts** already selected. Turn on **Add app subpage** in its settings if you also want a page of workflows.

When the Mac is connected, newly enabled workflows appear in any free spaces on either kind of Shortcuts subpage. Turn off a workflow in **Apple Shortcut List** to keep it off that page. Other saved tiles keep their positions.

## Create a keyboard shortcut card {#create-a-shortcut-card}

1. In the display’s web editor, select an empty tile and choose **Companion → Keyboard Shortcut**.
2. Use the **Application** tab, which opens by default, to pick a preset for an app. Switch to **Custom** to enter keys such as **⌘ Command + F**.
3. Save and tap the card. An Application preset opens or focuses the selected app before sending the keys. A Custom shortcut sends the keys to whichever app is already active.

The **Application** tab lists apps with shortcut presets. After choosing an app, use **Find a keyboard shortcut…** to search by name or key combination, then select a row. For example, type **New Tab** or **Cmd+T**. Bundled presets are available while the Mac is offline. Expanded presets can include single keys and sequences, and need an updated display and Mac Companion. Approve the target app in EspDesktop on your Mac. The card skips the shortcut if the app cannot be brought to the front.

Custom keyboard shortcuts need **Command**, **Control**, or **Option** plus a key. **Shift** is optional.

[Look up keyboard shortcut presets by app](/reference/shortcut-presets).

## Allow accessibility access

Enable **EspDesktop** in **System Settings → Privacy & Security → Accessibility** so it can send keystrokes.

<a href="/images/mac-companion-shortcut-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-shortcut-access-480.avif 480w, /images/mac-companion-shortcut-access-960.avif 960w" sizes="(min-width: 768px) 612px, 90vw"><img src="/images/mac-companion-shortcut-access.png" alt="EspDesktop’s Enable Keyboard Shortcuts step with the macOS permission prompt and Open System Settings button" width="612" height="744" loading="lazy"></picture></a>

If a tile still does nothing, follow [the keyboard shortcut and Mac Lock troubleshooting steps](/getting-started/troubleshooting#a-card-does-not-work).

With Mac Companion connected, the editor loads the full list when you select an app. This works over your local network. The editor built into the display keeps a starter set for editing while Companion is disconnected, and saved cards keep their shortcut keys.

## Group keyboard shortcuts by app {#use-a-template-on-an-app-subpage}

Use [ready-made app subpages](/mac-controls/apps#ready-made-app-subpages) to keep an app’s keyboard shortcuts together. New pages start with a selection of useful keyboard shortcuts for the app. Smaller displays show as many as will fit, with space for **Back**. From inside an app’s subpage in the web editor, right-click a card and choose **Keyboard Shortcut List** to change which presets appear and how they’re ordered. This opens the full list, with **Find a keyboard shortcut…** available for long lists. In the app card’s settings, use **Show all keyboard shortcuts** to expand a long list. You can add keyboard shortcuts or rearrange the ones on the page.

When you add a **Keyboard Shortcut** card inside an app subpage, the **Application** tab opens with that app selected. You can pick a different app or switch to **Custom**.

The web editor dims these keyboard shortcuts when the app loses focus or the Mac disconnects. You can still edit and rearrange the tiles.

## Control Streamlabs Desktop

Approve **Streamlabs Desktop** in the EspDesktop Mac app. Choose **Keyboard Shortcut → Application → Streamlabs Desktop** for menu shortcuts such as **Open Settings**, **Undo** and **Copy**, or enable **Add app subpage** on a Streamlabs Desktop application card. The nudge presets move a selected source in the Streamlabs editor.

For scene switching, mic mute or recording, assign a key combination in [Streamlabs Desktop → Settings → Hotkeys](https://support.streamlabs.com/hc/en-us/articles/4413170379675-How-to-Set-up-Hotkeys-in-Streamlabs-Desktop). Choose a combination with Command, Control or Option that works from your Mac keyboard, then enter the same keys in a **Keyboard Shortcut → Custom** tile. You can put these tiles on the Streamlabs app subpage. Bring Streamlabs to the front before using a Custom tile, which sends keys to the active Mac app.

<span id="add-templates-for-another-app">Missing a preset?</span> [Suggest a keyboard shortcut](/mac-controls/improve-shortcuts).
