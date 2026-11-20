---
title: Run Mac Keyboard Shortcuts from a Touchscreen
description: Turn custom Mac keyboard shortcuts into tappable EspDesktop tiles or choose presets for apps such as Safari, Slack and Figma.
---

# Run Mac keyboard shortcuts

A **Keyboard Shortcut** card can run a preset for a specific Mac app or send a custom key combination to the active app.

## Run an Apple Shortcuts workflow

An Apple shortcut automates one or more tasks on your Mac, such as starting a focus timer, arranging windows, or saving a link for later. Create your own in **Shortcuts** or add one from its **Gallery**. [Apple’s guide to Shortcuts on Mac](https://support.apple.com/en-gb/guide/shortcuts-mac/apdf22b0444c/mac).

Use matching versions of the EspDesktop Mac app and display firmware. Keep your Mac unlocked to run shortcuts and answer any prompts there.

In your display’s web editor, select an empty tile and choose **Companion → Apple Shortcuts**. Then pick one of these three card types.

<a href="/images/apple-shortcuts/card-types.png"><img class="apple-shortcuts-image" src="/images/apple-shortcuts/card-types.png" alt="Apple Shortcuts card picker showing Create a list of shortcuts, Run a shortcut, and Open the Shortcuts App" width="1500" height="608" loading="lazy"></a>

### Pin a single shortcut

Choose **Run a shortcut**, select the shortcut, and save. Tap its tile to run it directly, like **Start Pomodoro** below.

<a href="/images/apple-shortcuts/home.jpg"><img class="apple-shortcuts-image apple-shortcuts-home" src="/images/apple-shortcuts/home.jpg" alt="EspDesktop Home screen with a pinned Start Pomodoro shortcut, a Shortcut List tile, and the Shortcuts app icon" width="1080" height="1080" loading="lazy"></a>

### Group shortcuts on one page

Choose **Create a list of shortcuts**. The editor lists all shortcuts available to EspDesktop. Use the switches to choose which ones appear and drag them into order. Save and tap **Shortcut List** on your display. The page shows as many shortcuts as fit alongside **Back**.

<div class="apple-shortcuts-image-pair">
  <a href="/images/apple-shortcuts/list.jpg"><img class="apple-shortcuts-image" src="/images/apple-shortcuts/list.jpg" alt="EspDesktop Shortcut List page with a Back tile and seven shortcuts" width="1080" height="1080" loading="lazy"></a>
  <a href="/images/apple-shortcuts/list-settings.png"><img class="apple-shortcuts-image" src="/images/apple-shortcuts/list-settings.png" alt="Shortcut List settings with switches and drag handles for each shortcut" width="892" height="1458" loading="lazy"></a>
</div>

### Launch the Shortcuts app

Choose **Open the Shortcuts App**, leave **Add app subpage** on, and save. Tap the app tile to launch Shortcuts on your Mac. By default, the display shows your shortcut tiles when Shortcuts comes to the front.

<div class="apple-shortcuts-image-pair">
  <a href="/images/apple-shortcuts/app.jpg"><img class="apple-shortcuts-image" src="/images/apple-shortcuts/app.jpg" alt="Shortcuts app subpage on the display with the app icon and seven shortcuts" width="1080" height="1080" loading="lazy"></a>
  <a href="/images/apple-shortcuts/app-settings.png"><img class="apple-shortcuts-image" src="/images/apple-shortcuts/app-settings.png" alt="Applications card settings with Shortcuts selected and Add app subpage enabled" width="892" height="1572" loading="lazy"></a>
</div>

To edit either page later, right-click a tile on it in the web editor and choose **Apple Shortcut List**. To limit which shortcuts your displays can run, turn off **All available shortcuts** in the EspDesktop Mac app’s **Shortcuts** settings and enable the ones you want.

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

<style scoped>
.apple-shortcuts-image {
  display: block;
  border-radius: 10px;
}

.apple-shortcuts-home {
  max-width: min(100%, 440px);
}

.apple-shortcuts-image-pair {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  align-items: start;
  gap: 16px;
}

@media (max-width: 520px) {
  .apple-shortcuts-image-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
