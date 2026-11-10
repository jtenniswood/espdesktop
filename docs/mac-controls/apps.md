---
title: Launch Mac Apps and Open Websites
description: Set up EspDesktop Companion cards to launch approved Mac apps and open web addresses in the default browser.
---

# Launch Mac Apps and Open Websites

Companion cards can bring an approved application to the front or open a website in the Mac's default browser.

## Launch an App

1. In the Mac app, open **Apps**. **All available apps** is on by default. To limit what the display can launch, turn it off and enable the apps you want to use.
2. In the display's setup page, add a **Companion → Applications** card.
3. Select an approved application and save the display configuration.

The card uses the app's friendly name by default. Enter a custom title in its settings to show a different name.

Use **Default app icon size** in Screen appearance settings to size Mac app artwork. Each app card also has an **App icon size** override in Card Settings and its right-click menu. Small keeps the original size, Medium enlarges the artwork above the label, and Large fills the available space and hides the label. Choose Default to follow the global setting. The app card uses its active fill colour while the Mac reports that app is in front; background apps use the normal fill.

App cards use the normal card theme by default. Previously saved custom backgrounds are preserved. Backgrounds are not generated from app icons.

Approve **Finder** in the Mac app to use its launch card. Touching an app card sends its action immediately. With a matching current Mac app and firmware, macOS activation updates the active colour directly, without waiting for window, Finder-folder or browser-tab checks. The fill has no outline or fade. Detailed focus checks still control app subpages and keyboard shortcuts separately; touch actions and page changes do not wait for either update.

## Open a Website

1. Add a **Companion → Website** card.
2. Enter an `http://` or `https://` address.
3. Under **Open in**, keep **New tab** or choose **New window**, then save the card.

The card uses the Mac's default browser. Use matching versions of the Mac app and display firmware to apply the setting. Safari and Google Chrome support both choices when EspDesktop has Automation permission for the browser in macOS System Settings. With other browsers, **New tab** follows the browser's usual behaviour for links opened from another app. If no browser window is open, opening a tab creates a window for it.

Addresses containing an embedded username or password are rejected. Other URL types, including `file://`, are not accepted.

Saved **Web App** cards are removed from layouts when upgrading or restoring a backup. To add a card for a website, choose **Website**.

## Ready-Made App Subpages

An approved **Applications** card can offer an editable subpage when EspDesktop includes shortcut templates for that app. Current examples include **Safari**, **Slack**, and **Codex**; community contributions can add more apps.

1. Add an **Applications** card for an app with a shortcut template.
2. Open **App Subpage** in its card settings and turn on **Add app subpage**.
3. Choose the shortcuts to include and drag them into order.

The page uses the same templates as standalone **Shortcut Catalog** cards and remains editable. Turning the app subpage option off preserves your changes.

You can [add a custom shortcut](/mac-controls/shortcuts#create-a-shortcut-card) in an empty tile on the app subpage.

For standalone pages, see [Subpages](/features/subpages). For folders, see [Open Finder folders](/mac-controls/folders).

App subpages open automatically when their app gains focus by default. Switching between apps with subpages goes directly to the matching page. Browser tabs and Finder folders are checked separately so they do not hold up app switches. To require a press instead, turn off **Screen → Appearance → App Subpages → Open app subpages on focus**. Press an app card to focus its app, then press it again once the app is active on the Mac to open the subpage. This setting applies to every app subpage on the display.

With **Open app subpages on focus** and **Return home when switching apps** enabled, closing the app's last visible window returns you to the Home page or subpage you were using before the shortcuts opened. If macOS brings another app with a subpage to the front, the display follows that app.

The browser setup page caches app icon previews locally for up to 24 hours, so switching pages and reopening setup can reuse downloaded artwork. Icons refresh when the Mac connection or app icon catalogue changes. **Clear app icon cache** in the Mac Companion settings also clears the browser previews. Browser caching is limited to 64 previews and still works in memory if local storage is unavailable.

The S3 keeps 11 full-resolution app icons in flash and can cache up to 12 additional icons in external RAM, for up to 23 at once when memory is available. The extra copies use lossless compression where it saves space, use at most 2 MB, leave 1 MB of free external-memory headroom when allocated, and reload from the Mac after a restart. Hidden pages can retain up to 2 MB of rendered artwork and release it under memory pressure. If the cache fills, the least recently used overflow icon is replaced; missing artwork downloads again when needed. The browser keeps its own cached copy when an icon is evicted from the display.
