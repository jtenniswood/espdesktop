---
title: EspDesktop Sound Controls for Mac and Windows
description: Adjust speaker, microphone, and app volume or mute audio from your EspDesktop touchscreen.
---

# Sound controls

Use **Sound** cards to control speakers, microphones, and app volume on your paired Mac or Windows PC.

## Add a Sound card

1. In the display editor, open **Layout** and select an empty tile on Home or in a subpage.
2. Choose **Sound** and select a **Type** from the table below.
3. Choose a microphone or app if the card asks for one, then select **Save**. Add a card for each control you want on screen.

| Type | What it controls |
| --- | --- |
| **Audio Output** | Volume of the default speakers or headphones. |
| **Audio Input** | Level of the default microphone or audio input. |
| **Output Mute** | Mute or unmute the default speakers or headphones. |
| **Input State** | Mute or unmute the default microphone. The card shows **Live** or **Muted**. |
| **Input Cough** | Hold to mute the default microphone. Release to restore its previous mute state. On Windows, use a current companion app and matching display firmware. |
| **Input per device level** | Adjust a specific microphone with adjustable gain, even if you change the default input. |
| **Output per application** | Adjust the volume of a single approved app. |

For the per-device and per-app sliders, use EspDesktop app and firmware versions that support them. A microphone slider becomes unavailable if its microphone is disconnected. On Windows, **Input State** shows **No audio input** until Windows detects an input.

The default card labels are **Volume**, **Mic**, and **Mute**. A crossed-out icon means the device is muted. Raising a device’s level above zero unmutes it. If a card is unavailable, check that EspDesktop is connected and the audio device supports that control.

<span id="windows-app-volume"></span>

## Adjust an app’s volume {#app-volume}

1. In EspDesktop, open **Apps** and make sure the app you want to control is enabled.
2. Add a **Sound** card with **Type → Output per application**, choose the app under **Application**, then select **Save**.
3. Start playing audio in the app, then move the slider on the touchscreen.

If the app is missing from the picker, check that your computer is connected and the app is enabled, then reopen the card editor.

- **Mac** requires **macOS 14.2 or later**. Allow **System Audio Recording** if prompted. If the slider has no effect, check the permission in **System Settings → Privacy & Security** and use the Mac’s default audio output. Browser tabs that share an audio process also share its volume. **100%** is the app’s normal volume, which returns when you disable the app in EspDesktop or disconnect the last paired display.
- **Windows** needs an active audio session for the app. If the slider becomes unavailable, start playback again. Moving it above zero also unmutes the app.
