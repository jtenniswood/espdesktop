---
title: Control the OBS Audio Mixer from a Touchscreen
description: Adjust OBS mixer levels, mute individual microphones and other inputs, and set up a grouped audio page on EspDesktop.
---

# Audio controls

[Connect OBS Studio](/mac-controls/obs-studio#connect-obs-studio) to control the inputs in its mixer. When selecting a microphone, choose the input your broadcast captures. It can differ from the Mac’s default microphone.

## Add an audio control

1. In the display editor, choose **Add Card → OBS Studio → Audio Controls** on Home or in a folder.
2. Under **Type**, choose **Level**, **Input State**, or **Cough**.
3. Choose the OBS mixer input under **Source** and save the card. EspDesktop keeps the binding if the input becomes unavailable.

| Card | What it does |
| --- | --- |
| **Level** | Drag the slider to adjust the selected input’s mixer level. You can still adjust it while the input is muted. |
| **Input State** | Tap to mute or unmute the selected input. The card shows **Live** with the on colour when the input is unmuted, and **Muted** with a crossed-out microphone and the off colour when it’s muted. |
| **Cough** | Hold to mute the input temporarily and release to restore its previous mute state. The card reads **Muted** whenever that input is muted, including during a break. |

To mute a microphone when you switch to a break scene, use [Break Settings](/mac-controls/obs-studio/scene-control-and-mixing#switch-to-a-break-scene).

## Add the Audio grouped page

Choose **Add Card → OBS Studio → Grouped pages → Audio** to fill the available cells with sliders for the current mixer inputs. Edit the Audio page card to hide or reorder sliders. Use [Edit Subpage](/mac-controls/obs-studio#customise-an-obs-card-or-page) to save an automatic slider in a specific cell.
