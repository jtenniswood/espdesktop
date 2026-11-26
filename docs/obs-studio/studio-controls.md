---
title: OBS Studio Mode, Recording and Streaming Controls
description: Use EspDesktop to control OBS Studio Mode, Multiview, streaming, recording, the virtual camera, and the Replay Buffer from a touchscreen.
---

# Studio controls

Use these controls on Mac or Windows. On Windows, use a current companion app and matching display firmware. [Connect OBS Studio](/obs-studio#connect-obs-studio).

<picture>
  <source type="image/avif" srcset="/images/obs/studio-480.avif 480w, /images/obs/studio-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
  <img src="/images/obs/studio.jpg" alt="EspDesktop Studio Control page with Studio Mode on, Record and Stream idle, and Replay Buffer off" width="1440" height="1440">
</picture>

## Add the Studio Control grouped page

Choose **Add Card → OBS Studio → Grouped pages → Studio Control** and save the card. It starts with **Record**, **Stream**, **Studio Mode**, **Replay Buffer**, and **Save Replay**. **Save Replay** spans two rows and two columns when there’s room.

Use **Edit Subpage** to move, edit, or delete the preset cards. Add **Virtual Camera** or **Open Multiview** if you also use them during a session.

<a href="/images/obs/studio-control-layout.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/studio-control-layout-480.avif 480w, /images/obs/studio-control-layout-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/studio-control-layout.png" alt="Studio Control with Record and Stream idle, Studio Mode on, Replay Buffer off, and Save Replay prompting you to start it" width="1202" height="1198" loading="lazy" decoding="async">
  </picture>
</a>

## Studio Mode and Multiview

Add a **Studio Mode** card and choose one option under **Type**.

| Type | What it does |
| --- | --- |
| **Studio Mode** | Toggles Studio Mode. The card asks for confirmation before turning it off by default. |
| **Program scene** | Shows the name of the scene OBS is sending to its output. |
| **Take Live** | Sends Preview to Program using the selected transition. [Preview a scene and take it live](/obs-studio/scene-control-and-mixing#preview-a-scene-and-take-it-live). |
| **Open Multiview** | Opens OBS’s overview of scenes. Tap again to bring the open window to the front. |

On Mac, enable EspDesktop in **System Settings → Privacy & Security → Accessibility** so it can find and focus Multiview. Press **Esc** to close the window.

## Streaming, recording and virtual camera

Add **Output Controls** and choose an **OBS output**.

| OBS output | What it does |
| --- | --- |
| **Streaming** | Starts or stops a stream. The subtitle shows the current state, including when OBS reconnects. |
| **Recording** | Starts or stops a recording. The card shows **Record** when idle, **Recording** when active, and updates when recording pauses or stops. |
| **Virtual Camera** | Starts or stops the OBS Virtual Camera. The card lights up while it’s running. |

<a href="/images/obs/streaming.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/streaming-480.avif 480w, /images/obs/streaming-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/streaming.png" alt="EspDesktop Home layout with the Record, Stream, and Camera cards side by side, all showing Idle" width="1192" height="1190" loading="lazy" decoding="async">
  </picture>
</a>

Each output asks for confirmation before starting and stopping by default. In the **Confirmation** panel, use **When** to choose **Start**, **Stop**, or **Both**. You can edit the message and button labels, or turn off **Confirmation Required**. If OBS changes the output while a prompt is open, check the updated action before trying again.

Existing streaming and recording status cards become output controls with confirmation in both directions.

## Replay Buffer

Replay Buffer keeps a rolling clip of recent footage. Use **Save Replay** to write that footage to a file while the buffer is running.

1. Enable **Replay Buffer** in **OBS → Settings → Output**.
2. Add a **Replay Buffer** card and set **Type** to **Start / Stop Buffer**. The card lights up while OBS is buffering. It asks for confirmation before stopping by default.
3. Add another **Replay Buffer** card and set **Type** to **Save Replay**. Tap it while the buffer is running. The card lights up while you press it and changes from **Ready** to **Saving**, then shows **Saved** for five seconds after OBS confirms the file.

The **Confirmation** panel on **Studio Mode** and **Start / Stop Buffer** lets you choose when to confirm and edit the prompt and button labels.

Find saved clips in the active OBS profile’s **Recording Path** under **Settings → Output**. To play a clip in OBS, select it in an OBS Media Source. [OBS recording output guide](https://obsproject.com/kb/standard-recording-output-guide)
