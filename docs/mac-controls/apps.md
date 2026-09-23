---
title: Launch Mac Apps and Open Websites
description: Set up EspDesktop Companion cards to launch approved Mac apps and open safe web addresses in the default browser.
---

# Launch Mac Apps and Open Websites

Companion cards can bring an approved application to the front or open a website in the Mac's default browser.

## Launch an App

1. In the Mac app, open **Apps** and approve the applications the display may launch.
2. In the display's setup page, add a **Companion → Launch app** card.
3. Select an approved application and save the display configuration.

Approve **Finder** in the Mac app to use its launch card. An app card lights up when that app is active on the Mac.

## Open a Website

1. Add a **Companion → Open URL** card.
2. Enter an `http://` or `https://` address. macOS opens it in the default browser configured on the Mac.

Addresses containing an embedded username or password are rejected. Other URL types, including `file://`, are not accepted.

## Ready-Made App Subpages

An approved **Launch app** card can offer an editable subpage when EspDesktop includes shortcut templates for that app. Current examples include **Safari**, **Slack**, and **Codex**; community contributions can add more apps.

1. Add a **Launch app** card for an app with a shortcut template.
2. Open **App Subpage** in its card settings and turn on **Add app subpage**.
3. Choose the shortcuts to include and drag them into order.
4. Optionally enable **Auto switch to subpage**.

The page uses the same templates as standalone **Shortcut Catalog** cards and remains editable. Turning the app subpage option off preserves your changes. With auto-switch enabled, the display opens the subpage only after the Mac confirms the app is active.

To contribute templates for another app, see [Run Mac Keyboard Shortcuts](/mac-controls/shortcuts#add-templates-for-another-app).

For standalone pages, see [Subpages](/features/subpages). For folders, see [Open Finder folders](/mac-controls/folders).
