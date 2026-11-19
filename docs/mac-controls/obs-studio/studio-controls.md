---
title: OBS Studio Mode, Recording and Streaming Controls
description: Use EspDesktop to control OBS Studio Mode, Multiview, streaming, recording, the virtual camera, and the Replay Buffer from a touchscreen.
---

# Studio controls

Start by [connecting OBS Studio](/mac-controls/obs-studio#connect-obs-studio). Add the cards below from **Add Card → OBS Studio** in the display editor.

## Studio Mode and Multiview

Choose **Studio Mode** as the card type. Under **Type**, select **Studio Mode** to toggle it on or off. The card asks for confirmation before turning Studio Mode off by default. To show what’s live or send a preview live, use the [Program scene and Take Live cards](/mac-controls/obs-studio/scene-control-and-mixing#preview-a-scene-and-take-it-live).

Choose **Open Multiview** under the **Studio Mode** card type to open the OBS Multiview full-screen on the first monitor listed by OBS. Tap the card again to bring an open Multiview window to the front. Enable EspDesktop in **System Settings → Privacy & Security → Accessibility** so it can find and focus the window. Press **Esc** on the Mac to close it.

## Streaming, recording and virtual camera

Add **Output Controls** and choose **Streaming**, **Recording**, or **Virtual Camera**. Each card asks for confirmation before starting or stopping by default. In the **Confirmation** panel, use **When** to choose **Start**, **Stop**, or **Both**, and customise the message and button labels. If OBS changes the output while a prompt is open, check the updated action before trying again.

The subtitle shows the current output state, including reconnecting streams and paused recordings. The Virtual Camera card lights up while the camera is running. The recording card says **Record** when idle, lights up as **Recording** when active, and shows **Stopping** beneath the label while OBS finishes stopping. Existing streaming and recording status cards become output controls with confirmation in both directions.

## Replay Buffer

1. Enable Replay Buffer in **OBS → Settings → Output**.
2. Add a **Replay Buffer** card and set **Type** to **Start / Stop Buffer**. The card lights up while OBS is buffering and asks for confirmation before stopping by default.
3. Add another **Replay Buffer** card and set **Type** to **Save Replay**. Tap it while the buffer is running to capture a clip. The card lights up while you press it. Its subtitle changes from **Ready** to **Saving**, then shows **Saved** for five seconds after OBS confirms the file.

Use the **Confirmation** panel on **Studio Mode** and **Start / Stop Buffer** to choose when to confirm and to customise the prompt and button labels.

Find saved clips in the active OBS profile’s **Recording Path** under **Settings → Output**. To play a clip back in OBS, select it in an OBS Media Source. See the [OBS recording output guide](https://obsproject.com/kb/standard-recording-output-guide) for file settings.

## Add the Studio Control grouped page

Open **Add Card → OBS Studio → Grouped pages → Studio Control** for a layout with **Record**, **Stream**, **Studio Mode**, **Replay Buffer**, and **Save Replay**. Save Replay spans two rows and two columns when there’s room. You can move, edit, or delete the preset cards.
