---
title: OBS Support
description: Connect OBS Studio to EspDesktop and control scenes, audio, streaming, recording, and replays from your touchscreen.
---

# OBS Support

Use your EspDesktop touchscreen to select scenes, mix audio, and control OBS Studio while you stream or record.

## Connect OBS Studio

1. In OBS Studio, open **Tools → WebSocket Server Settings** and enable the server. Keep authentication enabled.
2. In the EspDesktop Mac app, open **Settings → OBS**. The tab appears when EspDesktop finds OBS Studio installed in an Applications folder. Enter the port and password shown in OBS, then choose **Connect**. A saved password appears as dots until you click the field. Leave the field blank and choose **Reconnect** to reuse the saved password.

Use matching display firmware and Mac app builds that support OBS cards. In the display editor, open **Add Card → OBS Studio** to add controls to Home or a subpage.

## Scenes and transitions

In the OBS Studio card menu, choose **Studio Mode**, then use **Type** to select **Studio Mode**, **Program scene**, or **Take Live**. The **Studio Mode** control asks for confirmation before turning Studio Mode off by default. **Program scene** shows what OBS is sending to its output. Scene cards switch Program in normal mode and select Preview in Studio Mode.

The scene on Program shows **Live** beneath its name and uses the Broadcast icon by default. In Studio Mode, the ON colour follows Preview. In normal mode, the ON colour follows Program.

**Take Live** is available when Studio Mode is on and Preview shows a different scene from Program. The card shows the scene and transition, for example **Take Studio** with **Fade** underneath. When Preview and Program match, it shows **Currently Live**. If Preview changes before the command reaches OBS, check the updated name before tapping again.

Under **Card types → Transitions**, **Cycle transitions** steps through the transitions configured in OBS and displays the selected name. Use **Select a transition** to make separate cards for Cut, Fade or a custom transition. Each card lights up when OBS has selected its transition. **Cycle transitions** lights up while you press it.

Choose **Open Multiview** under the **Studio Mode** card type to open OBS Multiview full-screen on the first monitor listed by OBS. Press the card again to bring an existing Multiview to the front. Enable EspDesktop under **System Settings → Privacy & Security → Accessibility** so it can find and focus the projector. Press **Esc** on the Mac to close it.

## Audio controls

Choose **Audio Controls** in the **OBS Studio** card menu. Select **Level**, **Mute**, or **Cough** under **Type**, then choose a **Source**.

A **Mute** card changes the selected input in the OBS mixer. The ON colour and microphone icon show an unmuted input. Muting the input turns the colour off and shows a crossed-out microphone. Use the mic your broadcast captures when setting up the card, especially if it differs from the Mac’s default mic. Scene and input bindings are kept when a target is unavailable.

Choose **Level** to adjust a named mixer input. The fill turns grey while the input is muted, and you can still drag to adjust the level.

Choose **Cough** and select the input to mute momentarily. The tile reads **Muted** whenever that input is muted, including during a break. Lift your finger or slide off the card to restore the previous mute state when EspDesktop can verify it. If OBS or the display disconnects while you’re holding the card, check the input in OBS before you unmute.

If the card is unavailable, check the connection under **Settings → OBS** in the EspDesktop Mac app and make sure the selected source appears in the OBS Audio Mixer for the current scene collection.

## Streaming, recording and Virtual Camera

Add **Output Controls** from the **OBS Studio** card menu and choose **Streaming**, **Recording**, or **Virtual Camera**. Each card asks for confirmation before starting and stopping by default. With **Confirmation Required** enabled in the **Confirmation** panel, set **When** to **Start**, **Stop**, or **Both** and customise the message and button labels. If OBS changes the output while a prompt is open, check the updated action before trying again.

The subtitle shows the current output state, including reconnecting streams and paused recordings. The Virtual Camera card lights up while OBS Virtual Camera is running. The recording card says **Record** while idle and lights up as **Recording** when active. While OBS finishes stopping, **Stopping** appears under **Recording**. Existing streaming and recording status cards become the corresponding output controls with confirmation in both directions.

## Replay Buffer and clips

Enable Replay Buffer in **OBS → Settings → Output**, then add a **Replay Buffer** card. Choose **Start / Stop Buffer** to control the buffer from the display. The card lights up while OBS is buffering and asks for confirmation before stopping by default. For both **Studio Mode** and **Start / Stop Buffer**, use the **Confirmation** panel to choose when confirmation is required and customise the prompt and button labels. Choose **Save Replay** to capture a clip while the buffer is running. The card lights up while you press it. Its subtitle changes from **Ready** to **Saving**, then shows **Saved** for five seconds after OBS confirms the file.

Look for the clip in the active OBS profile’s **Recording Path** under **Settings → Output**. To play it back in OBS, select the saved file in an OBS Media Source. See the [OBS recording output guide](https://obsproject.com/kb/standard-recording-output-guide) for file settings.

## Break controls

In the Mac app, open **Settings → OBS → Break Settings**. Choose a **Break scene** and optionally select an input under **Mute during break**. EspDesktop saves both settings for the current OBS scene collection. Add **Break** to the display. The card shows **Start** and verifies the selected input is muted before switching Program. During a break, the card lights up and shows **Resume**. Tapping it returns to the previous scene and restores an input that EspDesktop muted when it can verify those changes. Taking another scene live also ends the break and makes **Start** available again. Check the mic in OBS before speaking if it was muted during the break. If the card says **Check OBS**, check the Program scene and microphone in OBS, then clear the alert in **Break Settings**.

## Starter layout and grouped pages

### Set up the starter layout

Choose **Set up OBS Studio** during first-time display setup, or open **Screen → Appearance → App Subpages → Add OBS starter page** to add it later. The setup suggests scenes and a microphone from your connected OBS collection. Pick a main scene, adjust the optional second scene and microphone, and select **Pin to Home**.

The **OBS Studio** folder uses one free Home slot. **Switching** contains scene selection, Studio Mode and Take Live, plus Transition when OBS reports one. **Audio** contains mute, level and Cough for the chosen microphone when those controls are available. **Outputs** contains Stream, Record and the replay controls if Replay Buffer is enabled in OBS. The folder also shows **Program** and includes **Break** if the second scene matches the break scene configured in Mac Companion. You can edit the pages in **Layout**.

### Add individual pages

Open **Add Card → OBS Studio → Grouped pages** to add any of these pages.

- **Transitions** fills free cells with the current transitions from OBS. Expand the **Transitions** list in the page card’s settings to hide or reorder transitions.
- **Audio** fills free cells with sliders for the current mixer inputs. Edit the Audio page card to hide or reorder sliders. A muted input’s slider turns grey and stays adjustable.
- **Scenes** follows the current OBS scene collection. Edit the Scenes page card to hide or reorder scene buttons. Break, Transition, and Take Live fill the bottom of the page when space is available. Take Live spans two columns by default.
- **Studio Control** comes with Record, Stream, Studio Mode, Replay Buffer, and Save Replay. Save Replay spans two rows and two columns on layouts with enough space. You can move, edit, or delete the preset cards.

Use **Edit Subpage** to customise the layout. Drag an automatic card to save it in a new position, or use **Edit Card → Save** to save it in place. Selecting a card opens a draft, and cancelling keeps it automatic. Use **Delete** to remove the card and keep that item out of the automatic list. New OBS items fill the remaining space alongside your saved cards.

To rename an OBS card, open **Edit Card → Card Settings** and edit **Label**. Cards with a subtitle continue to show the current OBS state there.

Before going live, try the cards with a test recording and listen back to check the mix.
