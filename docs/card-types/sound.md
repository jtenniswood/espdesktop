---
title: EspDesktop Sound Controls for Mac and Windows
description: Adjust speaker, microphone, and app volume or mute audio from your EspDesktop touchscreen.
---

# Sound controls

Use **Sound** cards to control speakers, microphones, and app volume on your paired Mac or Windows PC. **Input Cough** is available on macOS.

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
| **Input Cough** (macOS only) | Hold to mute the default microphone until you release. |
| **Input per device level** | Adjust a specific microphone with adjustable gain, even if you change the default input. |
| **Output per application** | Adjust the volume of a single approved app. |

For the per-device and per-app sliders, use EspDesktop app and firmware versions that support them. A microphone slider becomes unavailable if its microphone is disconnected. On Windows, **Input State** shows **No audio input** until Windows detects an input.

The default card labels are **Volume**, **Mic**, and **Mute**. A crossed-out icon means the device is muted. Raising a device’s level above zero unmutes it. If a card is unavailable, check that EspDesktop is connected and the audio device supports that control.

## Adjust an app’s volume on macOS {#app-volume}

Use macOS 14.2 or later with EspDesktop app and firmware builds that include App Volume.

1. In EspDesktop on the Mac, open **Settings → Apps** and enable the app you want to control.
2. Add a **Sound** card with **Type → Output per application**, choose the app under **Application**, then select **Save**.
3. Start playback in the app and move the display’s slider. Allow **System Audio Recording** if macOS prompts you.

**100%** plays at the app’s normal volume. **0%** silences it. Disabling the app in EspDesktop or disconnecting the last paired display restores normal playback.

If the app is missing from the picker, check that the Mac is connected and the app is enabled, then reopen the editor. If the slider has no effect, check **System Settings → Privacy & Security** for the audio recording permission and confirm the app plays through the Mac’s default output. Compatible mono, stereo, and multichannel outputs include Studio Display speakers. Browser tabs that share an audio process also share its volume.

## Adjust an app’s volume on Windows {#windows-app-volume}

1. In EspDesktop on the PC, make sure the app is approved under **Apps**.
2. Add a **Sound** card with **Type → Output per application**, choose the app under **Application**, then select **Save**.
3. Start playback in the app so Windows can detect it, then move the display’s slider.

The slider becomes unavailable when Windows no longer has an audio session for the app. Moving the slider above zero also unmutes the app.
