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
2. In the display’s web editor, select an empty tile on the home screen or in a folder. Choose **Sound**, then set **Type** to **Output per application**.
3. Choose the app under **Application** and select **Save**. The card starts with the app’s name as its label. Add another card for each app you want to adjust.
4. Start playback in the app, then drag the slider on the touchscreen. Allow **System Audio Recording** if macOS prompts you.

At **100%**, the app plays at its normal level. At **0%**, its output is silent. Disabling the app in EspDesktop or disconnecting the last paired display restores normal playback.

If the app is missing from the picker, check that the Mac companion is connected and the app is enabled in **Apps**, then reopen the card editor. If the slider has no effect, check EspDesktop’s audio recording permission in **System Settings → Privacy & Security** and confirm the app plays through the Mac’s default sound output. App Volume supports compatible mono, stereo, and multichannel output streams, including Studio Display speakers. Some apps and audio devices use output paths that the slider cannot adjust. Browser tabs that share one audio process share one volume setting.

## Control Mac sound and microphone {#mac-audio}

In the display editor, select an empty tile on Home or in a folder. Choose **Sound**, then select a **Type**. Each card uses one type, so add another card for each control you want to keep on screen.

| Card | What it controls |
| --- | --- |
| **Audio Output** | Drag to set the Mac’s overall sound level on its current default output. |
| **Audio Input** | Drag to set the level of the Mac’s current default microphone or audio input. |
| **Output Mute** | Tap to mute the Mac’s sound output. Tap again to restore it. |
| **Input Mute** | Tap to mute the Mac’s microphone. Tap again to restore it. |
| **Input Cough** | Hold to mute the default microphone until you release. |
| **Input per device level** | Choose a connected audio input with adjustable gain. The card follows that device even when you change the default microphone. It becomes unavailable while that device is disconnected. |
| **Output per application** | Choose an enabled app and adjust its sound independently. |

The level cards display **Volume** and the mute cards display **Mute** by default. The speaker and microphone icons identify which device each card controls. Mute cards show a crossed-out icon when the Mac reports mute. If a card is unavailable, check the Mac connection and whether the selected audio device exposes that control in macOS. Raising a level above zero also unmutes that device.

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

## OBS Studio controls

1. In OBS Studio, open **Tools → WebSocket Server Settings** and enable the server. Keep authentication enabled.
2. In the EspDesktop Mac app, open **Settings → OBS**. The tab appears when EspDesktop finds OBS Studio installed in an Applications folder. Enter the port and password shown in OBS, then choose **Connect**. A saved password appears as dots until you click the field. Leave the field blank and choose **Reconnect** to reuse the saved password.
3. In the display editor, open **Add Card → OBS Studio**. Choose **Scene** or **Audio Controls**. For audio, select **Level**, **Mute**, or **Cough** under **Type**, then choose a **Source**. Both cards are available on the home screen and in folders.

In the OBS Studio card menu, choose **Studio Mode**, then use **Type** to select **Studio Mode**, **Program scene**, or **Take Live**. The **Studio Mode** control asks for confirmation before turning Studio Mode off by default. **Program scene** shows what OBS is sending to its output. Scene cards switch Program in normal mode and select Preview in Studio Mode.

**Take Live** is available when Studio Mode is on and Preview shows a different scene from Program. The card shows the scene and transition, for example **Take Studio** with **Fade** underneath. When Preview and Program match, it shows **Currently Live**. If Preview changes before the command reaches OBS, check the updated name before tapping again.

Under **Card types → Transitions**, **Cycle transitions** steps through the transitions configured in OBS and displays the selected name. Use **Select a transition** to make separate cards for Cut, Fade or a custom transition. Each card lights up when OBS has selected its transition.

**Cycle transitions** lights up while you press it.

Choose **Open Multiview** under the **Studio Mode** card type to open OBS Multiview full-screen on the first monitor listed by OBS. Press the card again to bring an existing Multiview to the front. Enable EspDesktop under **System Settings → Privacy & Security → Accessibility** so it can find and focus the projector. Press **Esc** on the Mac to close it.

To rename an OBS card, open **Edit Card → Card Settings** and edit **Label**. Cards with a subtitle continue to show the current OBS state there.

Open **Add Card → OBS Studio → Grouped pages** and choose a page:

- **Transitions** fills free cells with the current transitions from OBS. Expand the **Transitions** list in the page card’s settings to hide or reorder transitions.
- **Audio** fills free cells with sliders for the current mixer inputs. Edit the Audio page card to hide or reorder sliders. A muted input’s slider turns grey and stays adjustable.
- **Scenes** follows the current OBS scene collection. Edit the Scenes page card to hide or reorder scene buttons. Break, Transition, and Take Live fill the bottom of the page when space is available. Take Live spans two columns by default.
- **Studio Control** comes with Record, Stream, Studio Mode, Replay Buffer, and Save Replay. Save Replay spans two rows and two columns on layouts with enough space. You can move, edit, or delete the preset cards.

Use **Edit Subpage** to customise the layout. Drag an automatic card to save it in a new position, or use **Edit Card → Save** to save it in place. Selecting a card opens a draft, and cancelling keeps it automatic. Use **Delete** to remove the card and keep that item out of the automatic list. New OBS items fill the remaining space alongside your saved cards.

A **Mute** card changes the selected input in the OBS mixer. The ON colour and microphone icon show an unmuted input. Muting the input turns the colour off and shows a crossed-out microphone. Use the mic your broadcast captures when setting up the card, especially if it differs from the Mac’s default mic. Scene and input bindings are kept when a target is unavailable.

Choose **Level** to adjust a named mixer input. The fill turns grey while the input is muted, and you can still drag to adjust the level.

Choose **Cough** and select the input to mute momentarily. The tile reads **Muted** whenever that input is muted, including during a break. Release it to restore the input’s previous mute state.

Add **Output Controls** from the **OBS Studio** card menu and choose **Streaming**, **Recording**, or **Virtual Camera**. Each card asks for confirmation before starting and stopping by default. With **Confirmation Required** enabled in the **Confirmation** panel, set **When** to **Start**, **Stop**, or **Both** and customise the message and button labels. If OBS changes the output while a prompt is open, check the updated action before trying again.

The subtitle shows the current output state, including reconnecting streams and paused recordings. The Virtual Camera card lights up while OBS Virtual Camera is running. The recording card says **Record** while idle and lights up as **Recording** when active. While OBS finishes stopping, **Stopping** appears under **Recording**. Existing streaming and recording status cards become the corresponding output controls with confirmation in both directions.

Enable Replay Buffer in **OBS → Settings → Output**, then add a **Replay Buffer** card. Choose **Start / Stop Buffer** to control the buffer from the display. The card lights up while OBS is buffering and asks for confirmation before stopping by default. For both **Studio Mode** and **Start / Stop Buffer**, use the **Confirmation** panel to choose when confirmation is required and customise the prompt and button labels. Choose **Save Replay** to capture a clip while the buffer is running. The card lights up while you press it. Its subtitle changes from **Ready** to **Saving**, then shows **Saved** for five seconds after OBS confirms the file.

Look for the clip in the active OBS profile’s **Recording Path** under **Settings → Output**. To play it back in OBS, select the saved file in an OBS Media Source. See the [OBS recording output guide](https://obsproject.com/kb/standard-recording-output-guide) for file settings.

Choose **Set up OBS Studio** during first-time display setup, or open **Screen → Appearance → App Subpages → Add OBS starter page** to add it later. The setup suggests scenes and a microphone from your connected OBS collection. Pick a main scene, adjust the optional second scene and microphone, and select **Pin to Home**.

The **OBS Studio** folder uses one free Home slot. **Switching** contains scene selection, Studio Mode and Take Live, plus Transition when OBS reports one. **Audio** contains mute, level and Cough for the chosen microphone when those controls are available. **Outputs** contains Stream, Record and the replay controls if Replay Buffer is enabled in OBS. The folder also shows **Program** and includes **Break** if the second scene matches the break scene configured in Mac Companion. You can edit the pages in **Layout**.

The scene on Program shows **Live** beneath its name and uses the Broadcast icon by default. In Studio Mode, the ON colour follows Preview. In normal mode, the ON colour follows Program.

In the Mac app, open **Settings → OBS → Break Settings**. Choose a **Break scene** and optionally select an input under **Mute during break**. EspDesktop saves both settings for the current OBS scene collection. Add **Break** to the display. The card shows **Start** and verifies the selected input is muted before switching Program. During a break, the card lights up and shows **Resume**. Tapping it returns to the previous scene and restores an input that EspDesktop muted when it can verify those changes. Taking another scene live also ends the break and makes **Start** available again. Check the mic in OBS before speaking if it was muted during the break. If the card says **Check OBS**, check the Program scene and microphone in OBS, then clear the alert in **Break Settings**.

Use matching display firmware and Mac app builds that support OBS cards. Before going live, try the cards with a test recording and listen back to check the mix.

## Website cards {#open-a-website}

To add a tile for a web address, see [Open Websites on Your Mac](/mac-controls/websites).
