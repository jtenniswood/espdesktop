---
title: Control OBS Studio from a Touchscreen on Mac
description: Connect OBS Studio to EspDesktop to switch scenes, mix audio, and control streaming, recording, and replays from a Mac-connected touchscreen.
---

# OBS Studio controls

Use EspDesktop as a touchscreen controller for OBS Studio on your Mac. Switch scenes and transitions, adjust mixer inputs, and control streaming, recording, the virtual camera, and replays.

## Connect OBS Studio

1. In OBS Studio, open **Tools → WebSocket Server Settings** and enable the server. Keep authentication enabled.
2. In the EspDesktop Mac app, open **Settings → OBS**. Enter the port and password shown in OBS, then choose **Connect**.
3. In the display’s web editor, open **Add Card → OBS Studio** on Home or in a folder. Add the controls you want, or choose **Grouped pages** for a ready-made layout.

Use matching display firmware and Mac app builds that support OBS cards. Before going live, try the cards with a test recording and listen back to check the mix.

## Choose what to control

- [Studio controls](/mac-controls/obs-studio/studio-controls) covers Studio Mode, Multiview, streaming, recording, the virtual camera, and the Replay Buffer.
- [Scene control and mixing](/mac-controls/obs-studio/scene-control-and-mixing) covers Preview and Program, transitions, Take Live, and switching to a break scene.
- [Audio controls](/mac-controls/obs-studio/audio-controls) covers mixer levels, input mute, push-to-mute, and the grouped mixer page.

## Customise an OBS card or page

To rename a card, open **Edit Card → Card Settings** and edit **Label**. Cards with a subtitle continue to show the current OBS state there.

On a grouped page, use **Edit Subpage** to customise the layout. Drag an automatically added card to save it in another cell, or choose **Edit Card → Save** to save it in place. Cancelling keeps the card automatic. Deleting it also hides that item from the automatic list. New OBS items fill the remaining space alongside cards you’ve saved.

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
