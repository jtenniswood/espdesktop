---
title: OBS Studio Touchscreen Controls
description: Set up OBS Studio with EspDesktop. Switch scenes, adjust audio, and control live streams, recordings, and replays from a touchscreen.
---

# OBS Support

OBS Studio is a free, open-source app for live streaming and video recording. It combines sources such as your screen, camera, and microphone into scenes. With EspDesktop, you can switch scenes, adjust audio, and start or stop streams and recordings from your touchscreen. [Visit the official OBS Studio site](https://obsproject.com/).

## Connect OBS Studio

1. In OBS Studio, open **Tools → WebSocket Server Settings**. Enable the server and keep authentication on.
2. In the EspDesktop Mac app, open **Settings → OBS**. Enter the port and password from OBS, then choose **Connect**. To reuse a saved password, leave the field blank and choose **Reconnect**.
3. In the display editor, choose **Add Card → OBS Studio** to add controls to Home or a subpage.

Use matching display firmware and Mac app builds that support OBS cards. The OBS settings tab appears when EspDesktop finds OBS Studio in an Applications folder.

## Scenes and transitions

- **Scene** switches Program in normal mode and selects Preview in Studio Mode. The ON colour follows the selected scene. The scene on Program shows **Live** and uses the Broadcast icon by default.
- **Studio Mode** offers **Studio Mode**, **Program scene**, **Take Live**, and **Open Multiview** under **Type**. The toggle asks for confirmation before turning Studio Mode off by default. **Program scene** shows what’s on air.
- **Take Live** sends Preview to Program and shows the scene and transition. It shows **Currently Live** when they match. If Preview changes before OBS receives the command, check the updated name before trying again.
- **Transitions** lets you **Cycle transitions** or **Select a transition** to make a card for Cut, Fade, or a custom transition.
- **Open Multiview** opens OBS Multiview full-screen on the first monitor listed by OBS. Tap again to bring it forward. Allow EspDesktop under **System Settings → Privacy & Security → Accessibility** to focus the existing window. Press **Esc** on the Mac to close it.

## Audio controls

Choose **Audio Controls**, select a **Type**, and pick your broadcast input under **Source**.

- **Level** adjusts the mixer input. The slider stays adjustable when its fill turns grey on mute.
- **Mute** toggles the input. The card lights up when unmuted and shows a crossed-out mic when muted.
- **Cough** mutes while held and shows **Muted** whenever the input is muted. Release or slide off to restore the previous state when EspDesktop can verify it.

If the card is unavailable, check **Settings → OBS** in the Mac app and confirm the source appears in the OBS Audio Mixer. If OBS or the display disconnects during a Cough hold, check the mic in OBS before unmuting.

## Streaming, recording and Virtual Camera

Add **Output Controls** and choose **Streaming**, **Recording**, or **Virtual Camera**. Cards show the current output state, including reconnecting, paused, or stopping. They ask for confirmation before starting and stopping by default. Use the **Confirmation** panel to choose **Start**, **Stop**, or **Both** and customise the prompt.

## Replay Buffer and clips

Enable Replay Buffer in **OBS → Settings → Output**, then add a **Replay Buffer** card. **Start / Stop Buffer** lights up while buffering and asks for confirmation before stopping by default. Use the **Confirmation** panel to change this.

**Save Replay** captures a clip while the buffer is running. It shows **Ready**, **Saving**, then **Saved** for five seconds after OBS confirms the file. Find the clip under the active OBS profile’s **Recording Path** in **Settings → Output**. Select the saved file in an OBS Media Source to play it back.

## Break controls

In the Mac app, open **Settings → OBS → Break Settings**. Choose a **Break scene** and optionally an input under **Mute during break**. These settings apply to the current scene collection.

On the display, **Start** verifies the selected input is muted before switching to the break scene. **Resume** returns to the previous scene and restores mute changes EspDesktop can verify. Taking another scene live also ends the break. If the card says **Check OBS**, check Program and the microphone in OBS, then clear the alert in **Break Settings**.

## Starter layout and grouped pages

### Set up the starter layout

Choose **Set up OBS Studio** during first setup, or **Screen → Appearance → App Subpages → Add OBS starter page** later. Pick a main scene, optionally add a second scene and microphone, then choose **Pin to Home**. The folder contains **Switching**, **Outputs**, and **Audio** when a microphone is selected.

### Add individual pages

Open **Add Card → OBS Studio → Grouped pages**.

- **Scenes** follows the current scene collection, with Break, Transition, and a double-wide Take Live where space allows.
- **Transitions** lists the current OBS transitions.
- **Audio** adds sliders for the current mixer inputs.
- **Studio Control** includes Record, Stream, Studio Mode, Replay Buffer, and Save Replay.

Use the page card’s settings to hide or reorder automatic items. In **Edit Subpage**, drag an automatic card or save its settings to keep it in place. Deleting it keeps that item out of the automatic list. New OBS items fill available cells. To rename a card, use **Edit Card → Card Settings → Label**.
