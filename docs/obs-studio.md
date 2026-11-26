---
title: Control OBS Studio on Mac and Windows
description: Switch OBS scenes, mix audio, and control recording and streaming from your EspDesktop touchscreen on Mac or Windows.
---

# OBS Studio controls

OBS Studio is a free, open-source app for recording video and live streaming. You build **scenes** from sources like cameras, screen captures, and graphics, then use the mixer to adjust microphones and other audio. [Visit the OBS Project for downloads and guides](https://obsproject.com/).

On macOS and Windows, use your touchscreen to switch scenes, control the mixer, and manage recording and streaming. Use a current companion app and matching display firmware.

<picture>
  <source type="image/avif" srcset="/images/obs/home-480.avif 480w, /images/obs/home-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
  <img src="/images/obs/home.jpg" alt="EspDesktop Home screen with OBS cards for recording, streaming, scenes and audio" width="1343" height="1440">
</picture>

Example layout with recording, streaming, **Scenes**, and **Audio** on Home.

## Connect OBS Studio

Use a [paired display](/screens/4848s040) and keep OBS Studio and EspDesktop open on the same computer.

1. In OBS Studio, open **Tools → WebSocket Server Settings**. Enable the server and keep authentication enabled.
2. Open **Settings → OBS** on Mac or **OBS Studio** on Windows in EspDesktop. Enter the port and password shown in OBS. Choose **Connect** on Mac or **Connect to OBS** on Windows. [OBS remote control guide](https://obsproject.com/kb/remote-control-guide)
3. Open your display’s web editor and select an empty tile on **Layout**. In **Choose Card**, select **OBS Studio**. If the picker shows connector tabs, look under **Companion**.

<a href="/images/obs/choose-card.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/choose-card-480.avif 480w, /images/obs/choose-card-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/choose-card.png" alt="Choose Card dialog with OBS Studio in the bottom right" width="1596" height="1074" loading="lazy" decoding="async">
  </picture>
</a>

## Switch scenes {#switch-obs-scenes}

Add a **Scene** card and choose the scene you want. With Studio Mode on, the card selects Preview. [Preview scenes, take them live, and choose transitions](/obs-studio/scene-control-and-mixing#preview-a-scene-and-take-it-live).

## Start with grouped pages

In the **OBS Studio** picker, look under **Grouped pages**. Pick one and choose **Save**. Tap its card on the touchscreen to open the page, then tap **Back** to return. Repeat for each page you want.

| Page | What you get |
| --- | --- |
| [Audio](/obs-studio/audio-controls#add-the-audio-grouped-page) | Volume sliders for the inputs in the OBS mixer. |
| [Scenes](/obs-studio/scene-control-and-mixing#scenes) | Buttons for scenes in the current collection, with Break, Transition, and Take Live where there’s room. |
| Sources | Visibility controls for items in Preview in Studio Mode, or in Program in normal mode. |
| [Studio Control](/obs-studio/studio-controls#add-the-studio-control-grouped-page) | Record, Stream, Studio Mode, Replay Buffer, and Save Replay in one layout. |
| [Transitions](/obs-studio/scene-control-and-mixing#transitions) | One button per scene transition configured in OBS. |

To test on either platform, turn on Studio Mode in OBS and tap a scene. Check that it appears in Preview.

<a href="/images/obs/obs-card-picker.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/obs-card-picker-480.avif 480w, /images/obs/obs-card-picker-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/obs-card-picker.png" alt="OBS Studio picker with seven card types above the Audio, Scenes, Studio Control and Transitions grouped pages" width="1584" height="1657" loading="lazy" decoding="async">
  </picture>
</a>

## Choose what to control

Add individual controls from **Add Card → OBS Studio → Card types**. You can put them on Home or in a subpage.

| Card type | What it does |
| --- | --- |
| [Scene](/obs-studio/scene-control-and-mixing#preview-a-scene-and-take-it-live) | Choose a scene from the current collection. |
| [Studio Mode](/obs-studio/studio-controls#studio-mode-and-multiview) | Toggle **Studio Mode**, show **Program scene**, **Take Live**, or **Open Multiview**. |
| [Transitions](/obs-studio/scene-control-and-mixing#choose-a-transition) | **Cycle transitions** or **Select a transition**. |
| [Audio Controls](/obs-studio/audio-controls#add-an-audio-control) | **Level**, **Input State**, or **Cough** for a mixer input. |
| [Break](/obs-studio/scene-control-and-mixing#switch-to-a-break-scene) | Switch to a break scene and optionally mute a mixer input. |
| [Output Controls](/obs-studio/studio-controls#streaming-recording-and-virtual-camera) | **Streaming**, **Recording**, or **Virtual Camera**. |
| [Replay Buffer](/obs-studio/studio-controls#replay-buffer) | **Save Replay** or **Start / Stop Buffer**. |

To launch OBS Studio from the touchscreen, add an [Applications card](/mac-controls/apps) and select OBS Studio.

## Customise an OBS card or page

- **Rename or recolour a card.** Open **Edit Card → Card Settings** to change its **Label** or icon. Open **Custom Colours** to change its colours. Cards with a status subtitle still show the current OBS state.
- **Choose which automatic cards appear.** Open **Edit Card** on the card that opens your **Audio**, **Scenes**, or **Transitions** page. Use the switches to hide items and the drag handles or arrows to reorder them, then choose **Save**. New OBS items fill available spaces.
- **Arrange the layout.** Use **Edit Subpage** to move cards or add controls to empty cells. Drag an automatic card to save it in another cell, or choose **Edit Card → Save** to save it in place. Cancelling the edit keeps it automatic. Deleting an automatic card from the layout also hides that item from the automatic list. Studio Control starts with editable preset cards.

## FAQ

<FaqAccordion>

::: details Can I control OBS Studio from a touchscreen on Mac and Windows?
Yes. Connect EspDesktop to OBS Studio’s WebSocket server, then add an OBS Studio card to your display. Scene switching, transitions, and Take Live work on both platforms.
:::

::: details Why is the OBS tab missing in EspDesktop?
EspDesktop shows **Settings → OBS** when it finds OBS Studio installed in an Applications folder on your Mac. Check where OBS Studio is installed if the tab is missing.
:::

::: details Why can’t EspDesktop connect to OBS Studio?
Check that the OBS WebSocket server is enabled and that its port and password match in EspDesktop. On Mac, leave the password field blank and choose **Reconnect** to reuse the saved password.
:::

::: details Can I switch scenes without putting them live immediately?
Yes. Turn on **Studio Mode** and tap a scene card to select it in Preview. Use **Take Live** to send that scene to Program, the feed OBS is outputting.
:::

::: details Can I mute my OBS microphone from the touchscreen?
Yes. Add an **Audio Controls** card, set **Type** to **Input State**, and choose the microphone from the OBS mixer. Use **Cough** to mute it only while you hold the card.
:::

</FaqAccordion>
