---
title: Launch Mac Apps from a Touchscreen
description: Choose which apps EspDesktop can launch, add an Applications card to your touchscreen and set up shortcut pages for supported apps.
---

# Launch Mac Apps

Tap an Applications card to launch an approved app or bring it to the front on your Mac.

App subpages open automatically when their app gains focus by default. Switching between apps with subpages goes directly to the matching page. Browser tabs and Finder folders are checked separately so they do not hold up app switches. To require a press instead, turn off **Screen → Appearance → App Subpages → Open app subpages on focus**. Press an app card to focus its app, then press it again once the app is active on the Mac to open the subpage. This setting applies to every app subpage on the display.

## Launch an App

### Choose apps in the Mac app

Open **Apps** in the Mac app. **All available apps** is on by default. To limit what the display can launch, turn it off and enable the apps you want to use.

[![EspDesktop Mac app on the Apps tab with the All available apps switch on](/images/mac-app-available-apps.png)](/images/mac-app-available-apps.png)

### Add a card in the web editor

1. In the display’s web editor, select an empty tile and choose **Applications**. If the picker shows connector tabs, look under **Companion**.

   ![Choose Card dialog with Applications as the first option](/images/web-editor-choose-card.png)

2. Select an approved application and choose **Save**.

   ![Applications card form with Figma selected, the Add app subpage switch off, and the Save button visible](/images/web-editor-application-card.png)

The card uses the app's friendly name by default. Enter a custom title in its settings to show a different name.

Use **Default app icon size** in Screen appearance settings to size Mac app artwork. Each app card also has an **App icon size** override in Card Settings and its right-click menu. Small keeps the original size, Medium enlarges the artwork above the label, and Large fills the available space and hides the label. Choose Default to follow the global setting. The app card uses its active fill colour while the Mac reports that app is in front; background apps use the normal fill.

App cards use the normal card theme by default. Previously saved custom backgrounds are preserved. Backgrounds are not generated from app icons.

Approve **Finder** in the Mac app to use its launch card. Touching an app card sends its action immediately. With a matching current Mac app and firmware, macOS activation updates the active colour directly, without waiting for window, Finder-folder or browser-tab checks. The fill has no outline or fade. Detailed focus checks still control app subpages and keyboard shortcuts separately; touch actions and page changes do not wait for either update.

## Ready-Made App Subpages

An approved **Applications** card can offer an editable subpage when EspDesktop includes shortcut templates for that app. Current examples include **Safari**, **Slack**, and **Codex**; community contributions can add more apps.

1. Add an **Applications** card for an app with a shortcut template.
2. Open **App Subpage** in its card settings and turn on **Add app subpage**.
3. Choose the shortcuts to include and drag them into order.

![Figma Applications card settings with Add app subpage on and shortcuts that can be enabled and reordered](/images/web-editor-app-subpage-shortcuts.png)

The page uses the same templates as the **Application** tab on a **Key Shortcut** card and remains editable. Turning the app subpage option off preserves your changes.

![Figma app subpage in the web editor with a back tile and shortcuts such as Frame, Duplicate, and Copy PNG](/images/web-editor-figma-subpage.png)

You can [add a custom shortcut](/mac-controls/shortcuts#create-a-shortcut-card) in an empty tile on the app subpage.

For standalone pages, see [Subpages](/features/subpages). For folders, see [Open Finder folders](/mac-controls/folders).

When you close the last visible window of the foreground app, the display returns to the Home page or subpage you were using before the shortcuts opened. This also applies to pages opened by tapping an app card. **Return home when switching apps** controls what happens when you switch to another Mac app.

## Website Cards {#open-a-website}

To add a tile for a web address, see [Open Websites on Your Mac](/mac-controls/websites).
