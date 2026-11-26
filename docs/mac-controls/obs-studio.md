---
title: Control OBS Studio on Mac and Windows
description: Connect OBS Studio to EspDesktop on Mac or Windows to switch scenes, choose transitions, and take Preview live from your touchscreen.
---

# OBS Studio controls

OBS Studio is a free, open-source app for recording video and live streaming. You build **scenes** from sources like cameras, screen captures, and graphics, then use the mixer to adjust microphones and other audio. [Visit the OBS Project for downloads and guides](https://obsproject.com/).

On **Mac and Windows**, you can switch scenes, show the live Program scene, choose transitions, and take Preview live. **Mac** also supports the OBS mixer, Break, recording, streaming, Virtual Camera, Replay Buffer, Multiview, and toggling Studio Mode.

<picture>
  <source type="image/avif" srcset="/images/obs/home-480.avif 480w, /images/obs/home-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
  <img src="/images/obs/home.jpg" alt="EspDesktop Home screen with OBS cards for recording, streaming, scenes and audio" width="1343" height="1440">
</picture>

Mac example with recording, streaming, **Scenes**, and **Audio** on Home.

## Connect OBS Studio

Use a [paired display](/screens/4848s040) with EspDesktop app and firmware versions that support OBS. Keep OBS Studio and EspDesktop open on the same computer.

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

Add a **Scene** card and choose the scene you want. With Studio Mode on, the card selects Preview. On Windows, turn on Studio Mode in OBS itself. [Preview scenes, take them live, and choose transitions](/mac-controls/obs-studio/scene-control-and-mixing#preview-a-scene-and-take-it-live).

## Start with grouped pages

In the **OBS Studio** picker, look under **Grouped pages**. Pick one and choose **Save**. Tap its card on the touchscreen to open the page, then tap **Back** to return. Repeat for each page you want.

| Page | What you get | Platform |
| --- | --- | --- |
| [Scenes](/mac-controls/obs-studio/scene-control-and-mixing#scenes) | Buttons for scenes in the current collection. | Mac and Windows |
| [Transitions](/mac-controls/obs-studio/scene-control-and-mixing#transitions) | One button per scene transition configured in OBS. | Mac and Windows |
| [Audio](/mac-controls/obs-studio/audio-controls#add-the-audio-grouped-page) | Volume sliders for the inputs in the OBS mixer. | Mac |
| [Studio Control](/mac-controls/obs-studio/studio-controls#add-the-studio-control-grouped-page) | Record, Stream, Studio Mode, Replay Buffer, and Save Replay. | Mac |

To test on either platform, turn on Studio Mode in OBS and tap a scene. Check that it appears in Preview.

<a href="/images/obs/obs-card-picker.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/obs-card-picker-480.avif 480w, /images/obs/obs-card-picker-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/obs-card-picker.png" alt="OBS Studio picker with seven card types above the Audio, Scenes, Studio Control and Transitions grouped pages" width="1584" height="1657" loading="lazy" decoding="async">
  </picture>
</a>

## Choose what to control

Add individual controls from **Add Card → OBS Studio → Card types**. You can put them on Home or in a subpage.

| Card type | Mac and Windows | Mac only |
| --- | --- | --- |
| [Scene](/mac-controls/obs-studio/scene-control-and-mixing#preview-a-scene-and-take-it-live) | Choose a scene from the current collection. | |
| [Studio Mode](/mac-controls/obs-studio/studio-controls#studio-mode-and-multiview) | **Program scene** and **Take Live**. | Toggle **Studio Mode** or **Open Multiview**. |
| [Transitions](/mac-controls/obs-studio/scene-control-and-mixing#choose-a-transition) | **Cycle transitions** or **Select a transition**. | |
| [Audio Controls](/mac-controls/obs-studio/audio-controls#add-an-audio-control) | | **Level**, **Input State**, or **Cough** for a mixer input. |
| [Break](/mac-controls/obs-studio/scene-control-and-mixing#switch-to-a-break-scene) | | Switch to a break scene and optionally mute a mixer input. |
| [Output Controls](/mac-controls/obs-studio/studio-controls#streaming-recording-and-virtual-camera) | | **Streaming**, **Recording**, or **Virtual Camera**. |
| [Replay Buffer](/mac-controls/obs-studio/studio-controls#replay-buffer) | | **Save Replay** or **Start / Stop Buffer**. |

On Mac, choose **Open the OBS Studio App** to add an **Applications** card with OBS Studio shortcuts. On Windows, use [Applications](/mac-controls/apps) to launch OBS Studio.

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
On Mac, add an **Audio Controls** card, set **Type** to **Input State**, and choose the microphone from the OBS mixer. Use **Cough** to mute it only while you hold the card.
:::

</FaqAccordion>
