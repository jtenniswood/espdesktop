---
title: Launch Mac Apps from a Touchscreen
description: Launch Mac apps, give individual apps their own volume sliders, and set up shortcut pages from your EspDesktop touchscreen.
---

# Launch Mac apps

Tap an Applications card to launch an approved app or bring it to the front on your Mac. To give an app its own slider, [add an App Volume card](#app-volume).

App subpages open automatically when their app gains focus by default. Switching between apps with subpages goes directly to the matching page. Browser tabs and Finder folders are checked separately so they do not hold up app switches. To require a press instead, turn off **Screen → Appearance → App Subpages → Open app subpages on focus**. Press an app card to focus its app, then press it again once the app is active on the Mac to open the subpage. This setting applies to every app subpage on the display.

## Launch an app

### Choose apps in the Mac app

Open **Apps** in the Mac app. **All available apps** is on by default. To choose which apps the display can launch or adjust, turn it off and enable the apps you want to control.

<a href="/images/mac-app-available-apps.png"><picture><source type="image/avif" srcset="/images/mac-connector/mac_app2-480.avif 480w, /images/mac-connector/mac_app2-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/mac-app-available-apps.png" alt="EspDesktop Mac app on the Apps tab with the All available apps switch on" width="1224" height="1488" loading="lazy"></picture></a>

### Add a card in the web editor

1. In the display’s web editor, select an empty tile and choose **Applications**. If the picker shows connector tabs, look under **Companion**.

   <a href="/images/web-editor-choose-card.webp"><picture><source type="image/avif" srcset="/images/web-editor-choose-card-480.avif 480w, /images/web-editor-choose-card-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/web-editor-choose-card.webp" alt="Choose Card dialog with Applications as the first option" width="1269" height="1022" loading="lazy"></picture></a>

2. Select an approved application and choose **Save**.

   <a href="/images/web-editor-application-card.png"><picture><source type="image/avif" srcset="/images/web-editor-application-card-480.avif 480w, /images/web-editor-application-card-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/web-editor-application-card.png" alt="Applications card form with Figma selected, the Add app subpage switch off, and the Save button visible" width="1694" height="2266" loading="lazy"></picture></a>

The card uses the app's friendly name by default. Enter a custom title in its settings to show a different name.

Use **Default app icon size** in Screen appearance settings to size Mac app artwork. Each app card also has an **App icon size** override in Card Settings and its right-click menu. Small keeps the original size, Medium enlarges the artwork above the label, and Large fills the available space and hides the label. Choose Default to follow the global setting. The app card uses its active fill colour while the Mac reports that app is in front; background apps use the normal fill.

App cards use the normal card theme by default. Previously saved custom backgrounds are preserved. Backgrounds are not generated from app icons.

Approve **Finder** in the Mac app to use its launch card. Touching an app card sends its action immediately. With a matching current Mac app and firmware, macOS activation updates the active colour directly, without waiting for window, Finder-folder or browser-tab checks. The fill has no outline or fade. Detailed focus checks still control app subpages and keyboard shortcuts separately; touch actions and page changes do not wait for either update.

## Adjust an app’s volume {#app-volume}

An **App Volume** card controls one Mac app at a time. For example, give Spotify its own slider so you can turn down music while keeping your call at the same level. Use macOS 14.2 or later and matching Mac companion and display firmware builds that include App Volume.

1. In EspDesktop on the Mac, open **Settings → Apps** and make sure the app is enabled.
2. In the display’s web editor, select an empty tile on the home screen or in a folder. Choose **App Volume**.
3. Choose the app under **Application** and select **Save**. The card starts with the app’s name as its label. Add another card for each app you want to adjust.
4. Start playback in the app, then drag the slider on the touchscreen. Allow **System Audio Recording** if macOS prompts you.

At **100%**, the app plays at its normal level. At **0%**, its output is silent. Disabling the app in EspDesktop or disconnecting the last paired display restores normal playback.

If the app is missing from the picker, check that the Mac companion is connected and the app is enabled in **Apps**, then reopen the card editor. If the slider has no effect, check EspDesktop’s audio recording permission in **System Settings → Privacy & Security** and confirm the app plays through the Mac’s default sound output. App Volume supports compatible mono, stereo, and multichannel output streams, including Studio Display speakers. Some apps and audio devices use output paths that the slider cannot adjust. Browser tabs that share one audio process share one volume setting.

## Ready-Made app subpages

An approved **Applications** card can offer an editable subpage when EspDesktop includes shortcut templates for that app. Examples include **Safari**, **Slack**, **Codex**, and **OpenCode Desktop**.

1. Add an **Applications** card for an app with a shortcut template.
2. Open **App Subpage** in its card settings and turn on **Add app subpage**.
3. Choose the shortcuts to include and drag them into order.

For OpenCode Desktop on Mac, the starter tiles include **New Session**, **Command Palette**, **Find Files**, and **Review Changes**. See all 12 presets in the [OpenCode shortcut reference](/reference/shortcut-presets#ai-opencode-desktop).

<a href="/images/web-editor-app-subpage-shortcuts.png"><picture><source type="image/avif" srcset="/images/web-editor-app-subpage-shortcuts-480.avif 480w, /images/web-editor-app-subpage-shortcuts-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/web-editor-app-subpage-shortcuts.png" alt="Figma Applications card settings with Add app subpage on and shortcuts that can be enabled and reordered" width="1694" height="2266" loading="lazy"></picture></a>

The page uses the same templates as the **Application** tab on a **Key Shortcut** card and remains editable. Turning the app subpage option off preserves your changes.

<a href="/images/web-editor-figma-subpage.png"><picture><source type="image/avif" srcset="/images/web-editor-figma-subpage-480.avif 480w, /images/web-editor-figma-subpage-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/web-editor-figma-subpage.png" alt="Figma app subpage in the web editor with a back tile and shortcuts such as Frame, Duplicate, and Copy PNG" width="1562" height="2134" loading="lazy"></picture></a>

You can [add a custom shortcut](/mac-controls/shortcuts#create-a-shortcut-card) in an empty tile on the app subpage.

For standalone pages, see [Subpages](/features/subpages). For folders, see [Open Finder folders](/mac-controls/folders).

When you close the last visible window of the foreground app, the display returns to the Home page or subpage you were using before the shortcuts opened. This also applies to pages opened by tapping an app card. **Return home when switching apps** controls what happens when you switch to another Mac app.

See [all app presets](/reference/shortcut-presets).

## Website cards {#open-a-website}

To add a tile for a web address, see [Open Websites on Your Mac](/mac-controls/websites).
