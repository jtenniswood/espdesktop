---
title: Control the OBS Audio Mixer from a Touchscreen
description: Adjust OBS mixer levels, mute individual microphones and other inputs, and set up a grouped audio page on EspDesktop.
---

# Audio controls

[Connect OBS Studio](/mac-controls/obs-studio#connect-obs-studio) to control the inputs in its mixer. When selecting a microphone, choose the input your broadcast captures. It can differ from the Mac’s default microphone.

## Add the Audio grouped page

1. Choose **Add Card → OBS Studio → Grouped pages → Audio**, then save the card. The page fills available cells with sliders for your current mixer inputs.
2. Open **Edit Card** on the **Audio** page card to hide or reorder inputs. In the example below, **Mic/Aux** comes first. Turn off any capture inputs you rarely adjust. Choose **Save**.
3. Use **Edit Subpage** to move or resize sliders and add other audio controls in the free cells. See [how to customise grouped pages](/mac-controls/obs-studio#customise-an-obs-card-or-page).

<a href="/images/obs/audio-settings.png"><img src="/images/obs/audio-settings.png" alt="Audio subpage settings with reorder controls and visibility switches for Mic/Aux, capture cards and macOS Screen Capture inputs" width="1016" height="1321" loading="lazy"></a>

<a href="/images/obs/audio-layout.png"><img src="/images/obs/audio-layout.png" alt="Audio grouped page with Back and five mixer sliders, including Mic/Aux and the capture inputs" width="1187" height="1187" loading="lazy"></a>

## Add an audio control

1. In the display editor, choose **Add Card → OBS Studio → Audio Controls** on Home or in a subpage.
2. Under **Type**, choose one of the options below.
3. Choose the OBS mixer input under **Source** and save the card. EspDesktop keeps the binding if the input becomes unavailable.

| Type | What it does |
| --- | --- |
| **Level** | Drag to adjust the selected input’s mixer level. You can still adjust it while the input is muted. |
| **Input State** | Tap to mute or unmute the input. The card uses its on colour for **Live** and its off colour and crossed-out microphone for **Muted**. |
| **Cough** | Hold to mute temporarily. Releasing restores the previous mute state. The card shows **Muted** whenever that input is muted, including during a break. |

The example below uses taller **Level** sliders and puts **Cough** beside the mic’s **Input State** button. To build a layout like this, set both buttons to the same **Source** so you can choose between a quick mute and one that stays on until you tap again.

<img src="/images/obs/audio.jpg" alt="EspDesktop touchscreen with Cough and Mic Live buttons above tall Input 1, Input 2 and Mic sliders" width="1440" height="1440" loading="lazy">

To mute an input when you switch to a break scene, use [Break Settings](/mac-controls/obs-studio/scene-control-and-mixing#switch-to-a-break-scene).
