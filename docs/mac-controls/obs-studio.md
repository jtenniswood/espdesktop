---
title: Control OBS Studio from a Touchscreen
description: Connect OBS Studio to EspDesktop and set up touchscreen pages for scenes, audio, transitions, recording, and streaming.
---

# OBS Studio controls

OBS Studio is a free, open-source app for recording video and live streaming. You build **scenes** from sources like cameras, screen captures, and graphics, then use the mixer to adjust microphones and other audio. [Visit the OBS Project for downloads and guides](https://obsproject.com/).

On macOS and Windows, use your touchscreen to switch scenes in OBS Studio. On macOS, you can also build pages for audio, recording, and streaming controls. The steps below cover macOS. [Connect OBS Studio on Windows](/windows#switch-obs-scenes).

<picture>
  <source type="image/avif" srcset="/images/obs/home-480.avif 480w, /images/obs/home-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
  <img src="/images/obs/home.jpg" alt="EspDesktop Home screen with OBS cards for recording, streaming, scenes and audio" width="1343" height="1440">
</picture>

This example puts recording and streaming controls on Home, with **Scenes** and **Audio** one tap away.

## Connect OBS Studio

Use a [paired EspDesktop display](/screens/4848s040) and matching Mac app and display firmware builds that support OBS cards. Keep both OBS Studio and EspDesktop open on the Mac.

1. In OBS Studio, open **Tools → WebSocket Server Settings**. Enable the server and keep authentication enabled.
2. In the EspDesktop Mac app, open **Settings → OBS**. Enter the port and password from OBS. The usual port is **4455**, but use the value shown in OBS if you changed it. Choose **Connect** and wait for **Connected to OBS**. [OBS remote control guide](https://obsproject.com/kb/remote-control-guide)
3. Open your display’s web editor and select an empty tile on **Layout**. In **Choose Card**, select **OBS Studio**. If the picker shows connector tabs, look under **Companion**.

<a href="/images/obs/choose-card.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/choose-card-480.avif 480w, /images/obs/choose-card-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/choose-card.png" alt="Choose Card dialog with OBS Studio in the bottom right" width="1596" height="1074" loading="lazy" decoding="async">
  </picture>
</a>

## Start with grouped pages

In the **OBS Studio** picker, look under **Grouped pages**. Pick one and choose **Save**. Tap its card on the touchscreen to open the page, then tap **Back** to return. Repeat for each page you want.

| Page | What you get |
| --- | --- |
| [Audio](/mac-controls/obs-studio/audio-controls#add-the-audio-grouped-page) | Volume sliders for the inputs in the OBS mixer. |
| [Scenes](/mac-controls/obs-studio/scene-control-and-mixing#scenes) | Buttons for scenes in the current collection, with Break, Transition, and Take Live where there’s room. |
| [Studio Control](/mac-controls/obs-studio/studio-controls#add-the-studio-control-grouped-page) | Record, Stream, Studio Mode, Replay Buffer, and Save Replay in one layout. |
| [Transitions](/mac-controls/obs-studio/scene-control-and-mixing#transitions) | One button per scene transition configured in OBS. |

For a first check, add **Scenes** and **Audio**. With Studio Mode on, select a scene and check that it appears in Preview in OBS. Make a short test recording and listen back to check your mix.

<a href="/images/obs/obs-card-picker.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/obs-card-picker-480.avif 480w, /images/obs/obs-card-picker-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/obs-card-picker.png" alt="OBS Studio picker with seven card types above the Audio, Scenes, Studio Control and Transitions grouped pages" width="1584" height="1657" loading="lazy" decoding="async">
  </picture>
</a>

## Choose what to control

Add individual controls from **Add Card → OBS Studio → Card types**. You can put them on Home or in a subpage.

| Card type | Options and setup |
| --- | --- |
| [Audio Controls](/mac-controls/obs-studio/audio-controls#add-an-audio-control) | **Level**, **Input State**, or **Cough**. Choose a mixer input. |
| [Break](/mac-controls/obs-studio/scene-control-and-mixing#switch-to-a-break-scene) | Set up a break scene and optional mute in the Mac app. |
| [Output Controls](/mac-controls/obs-studio/studio-controls#streaming-recording-and-virtual-camera) | **Streaming**, **Recording**, or **Virtual Camera**. |
| [Replay Buffer](/mac-controls/obs-studio/studio-controls#replay-buffer) | **Save Replay** or **Start / Stop Buffer**. |
| [Scene](/mac-controls/obs-studio/scene-control-and-mixing#preview-a-scene-and-take-it-live) | Choose a scene from the current collection. |
| [Studio Mode](/mac-controls/obs-studio/studio-controls#studio-mode-and-multiview) | **Studio Mode**, **Program scene**, **Take Live**, or **Open Multiview**. |
| [Transitions](/mac-controls/obs-studio/scene-control-and-mixing#choose-a-transition) | **Cycle transitions** or **Select a transition**. |

Choose **Open the OBS Studio App** to add an **Applications** card with **OBS Studio** already selected. Saving the card adds an app subpage with OBS Studio keyboard shortcuts.

## Customise an OBS card or page

- **Rename or recolour a card.** Open **Edit Card → Card Settings** to change its **Label** or icon. Open **Custom Colours** to change its colours. Cards with a status subtitle still show the current OBS state.
- **Choose which automatic cards appear.** Open **Edit Card** on the card that opens your **Audio**, **Scenes**, or **Transitions** page. Use the switches to hide items and the drag handles or arrows to reorder them, then choose **Save**. New OBS items fill available spaces.
- **Arrange the layout.** Use **Edit Subpage** to move cards or add controls to empty cells. Drag an automatic card to save it in another cell, or choose **Edit Card → Save** to save it in place. Cancelling the edit keeps it automatic. Deleting an automatic card from the layout also hides that item from the automatic list. Studio Control starts with editable preset cards.

## FAQ

<FaqAccordion>

::: details Can I control OBS Studio from a touchscreen on my Mac?
Yes. Pair your display with the EspDesktop Mac app, then connect the app to OBS Studio using its built-in WebSocket server. Add OBS Studio cards to the display for the scenes, audio inputs, and broadcast controls you use.
:::

::: details Why is the OBS tab missing in EspDesktop?
EspDesktop shows **Settings → OBS** when it finds OBS Studio installed in an Applications folder on your Mac. Check where OBS Studio is installed if the tab is missing.
:::

::: details Why can’t EspDesktop connect to OBS Studio?
Open OBS Studio and check that the WebSocket server is enabled. Match the port and password in **Settings → OBS** in EspDesktop. A saved password appears as dots until you click the field. Leave the field blank and choose **Reconnect** to reuse the saved password.
:::

::: details Can I switch scenes without putting them live immediately?
Yes. Turn on **Studio Mode** and tap a scene card to select it in Preview. Use **Take Live** to send that scene to Program, the feed OBS is outputting.
:::

::: details Can I mute my OBS microphone from the touchscreen?
Yes. Add an **Audio Controls** card, set **Type** to **Input State**, and choose the microphone from the OBS mixer. Use **Cough** to mute it only while you hold the card.
:::

</FaqAccordion>
