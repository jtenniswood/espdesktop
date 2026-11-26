---
title: Launch Apps from a Touchscreen
description: Launch approved apps, control sound, and set up keyboard shortcut pages from your EspDesktop touchscreen.
---

# Launch apps

Tap an Applications card to launch an approved app or bring it to the front on your computer.

By default, one press on an app card opens both the app and its subpage. Use **Screen → Appearance → App Subpages** to open subpages when an app gains focus or after pressing its card again. [App subpage options](/features/subpages#app-page-behavior).

## Launch an app

### Approve apps in EspDesktop {#choose-apps-in-the-mac-app}

Open **Apps** in EspDesktop on your computer. To limit which apps the display can launch, turn off **All available apps** on macOS or **Allow all available apps** on Windows. Then enable the apps you want to control.

On macOS, EspDesktop finds apps in **Applications**, in the **Applications** folder inside your home folder (`~/Applications`), and on mounted external drives. External apps appear while the drive is connected. Finder aliases in either Applications folder also work.

<a href="/images/mac-app-available-apps.png"><picture><source type="image/avif" srcset="/images/mac-connector/mac_app2-480.avif 480w, /images/mac-connector/mac_app2-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/mac-app-available-apps.png" alt="EspDesktop Mac app on the Apps tab with the All available apps switch on" width="1224" height="1488" loading="lazy"></picture></a>

### Add a card in the web editor

1. In the display’s web editor, select an empty tile and choose **Applications**. If the picker shows connector tabs, look under **Companion**.

   <a href="/images/web-editor-choose-card.webp"><picture><source type="image/avif" srcset="/images/web-editor-choose-card-480.avif 480w, /images/web-editor-choose-card-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/web-editor-choose-card.webp" alt="Choose Card dialog with Applications as the first option" width="1269" height="1022" loading="lazy"></picture></a>

2. Select an approved application and choose **Save**.

The card uses the app’s friendly name by default. Enter a custom title in its settings to give the card a different name.

App artwork fills the card and hides its title. The app card uses its active fill colour while your computer reports that app is in front. Background apps use the normal fill.

App cards use the normal card theme by default. Previously saved custom backgrounds are preserved. Backgrounds are not generated from app icons.

To add Finder or File Explorer with a page of approved folders, see [Folder subpages](/mac-controls/folders#folder-subpage). On macOS, approve **Finder** in EspDesktop to use its launch card. Touching an app card sends its action immediately. With a matching current Mac app and firmware, macOS activation updates the active colour directly, without waiting for window, Finder-folder or browser-tab checks. The fill has no outline or fade. Detailed focus checks still control app subpages and keyboard shortcuts separately; touch actions and page changes do not wait for either update.

## Adjust an app’s volume on macOS {#app-volume}

An **App Volume** card controls one Mac app at a time. For example, give Spotify its own slider so you can turn down music while keeping your call at the same level. Use macOS 14.2 or later and matching Mac companion and display firmware builds that include App Volume.

1. In EspDesktop on the Mac, open **Settings → Apps** and make sure the app is enabled.
2. In the display’s web editor, select an empty tile on the home screen or in a folder. Choose **Sound**, then set **Type** to **Output per application**.
3. Choose the app under **Application** and select **Save**. The card starts with the app’s name as its label. Add another card for each app you want to adjust.
4. Start playback in the app, then drag the slider on the touchscreen. Allow **System Audio Recording** if macOS prompts you.

At **100%**, the app plays at its normal level. At **0%**, its output is silent. Disabling the app in EspDesktop or disconnecting the last paired display restores normal playback.

If the app is missing from the picker, check that the Mac companion is connected and the app is enabled in **Apps**, then reopen the card editor. If the slider has no effect, check EspDesktop’s audio recording permission in **System Settings → Privacy & Security** and confirm the app plays through the Mac’s default sound output. App Volume supports compatible mono, stereo, and multichannel output streams, including Studio Display speakers. Some apps and audio devices use output paths that the slider cannot adjust. Browser tabs that share one audio process share one volume setting.

## Control speaker and microphone levels {#mac-audio}

In the display editor, select an empty tile on Home or in a folder. Choose **Sound**, then select a **Type**. Each card uses one type, so add another card for each control you want to keep on screen.

| Card | What it controls |
| --- | --- |
| **Audio Output** | Drag to set your computer’s overall sound level on its current default output. |
| **Audio Input** | Drag to set the level of your computer’s current default microphone or audio input. |
| **Output Mute** | Tap to mute your computer’s sound output. Tap again to restore it. |
| **Input State** | Tap to mute or unmute your computer’s microphone. The card uses the on colour for **Live** and the off colour for **Muted**. |
| **Input Cough** (macOS) | Hold to mute the default microphone until you release. |
| **Input per device level** (macOS) | Choose a connected audio input with adjustable gain. The card follows that device even when you change the default microphone. It becomes unavailable while that device is disconnected. |
| **Output per application** (macOS) | Choose an enabled app and adjust its sound independently. |

**Audio Output**, **Audio Input**, **Output Mute**, and **Input State** also work with the [Windows companion](/windows-preview#control-system-sound).

The level cards display **Volume** or **Mic** by default. The output mute card displays **Mute**. The speaker and microphone icons identify which device each card controls. Mute cards show a crossed-out icon when your computer reports mute. If a card is unavailable, check the companion connection and whether the selected audio device supports that control. Raising a level above zero also unmutes that device.

## Ready-Made app subpages

Saving an **Applications** card adds an editable subpage when EspDesktop has a keyboard shortcut template for that app. Available presets depend on the paired computer. For example, **Slack** has presets on both platforms.

1. Add an **Applications** card for an app with a keyboard shortcut template.
2. Open **App Subpage** in its card settings to choose and reorder the keyboard shortcuts.
3. Choose **Save**.

For OpenCode Desktop on Mac, the starter tiles include **New Session**, **Command Palette**, **Find Files**, and **Review Changes**. See all 12 presets in the [OpenCode shortcut reference](/reference/shortcut-presets#ai-opencode-desktop).

The page uses the same templates as the **Application** tab on a **Keyboard Shortcut** card and remains editable.

<a href="/images/web-editor-figma-subpage.png"><picture><source type="image/avif" srcset="/images/web-editor-figma-subpage-480.avif 480w, /images/web-editor-figma-subpage-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/web-editor-figma-subpage.png" alt="Figma app subpage in the web editor with a back tile and keyboard shortcuts such as Frame, Duplicate, and Copy PNG" width="1562" height="2134" loading="lazy"></picture></a>

You can [add a custom keyboard shortcut](/mac-controls/shortcuts#create-a-shortcut-card) in an empty tile on the app subpage.

For standalone pages, see [Subpages](/features/subpages). For folders, see [Open file folders](/mac-controls/folders).

When you close the last visible window of the foreground app, the display returns to Home even if the app is still running.

See [all app presets](/reference/shortcut-presets).

## OBS Studio controls

See [OBS Studio controls](/mac-controls/obs-studio) to connect OBS and set up scenes, mixer inputs, and broadcast controls.

## Website cards {#open-a-website}

To add a tile for a web address, see [Open Websites on Your Mac](/mac-controls/websites).
