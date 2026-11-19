---
title: Switch OBS Scenes and Mix Transitions from a Touchscreen
description: Select OBS scenes, preview a shot, take it live, choose transitions, and switch to a break scene from your EspDesktop touchscreen.
---

# Scene control and mixing

[Connect OBS Studio](/mac-controls/obs-studio#connect-obs-studio), then use **Add Card → OBS Studio** in the display editor to add scene and transition controls.

## Preview a scene and take it live

1. Add a **Scene** card for each scene you want to switch to. In normal mode, tapping a scene immediately switches Program, the feed OBS is outputting. With [Studio Mode](/mac-controls/obs-studio/studio-controls#studio-mode-and-multiview) on, tapping a scene selects it in Preview. The card’s on colour follows Preview in Studio Mode and Program in normal mode.
2. To see what’s live, add a **Studio Mode** card and set **Type** to **Program scene**. The scene on Program shows **Live** beneath its name and uses the Broadcast icon by default.
3. To send Preview to Program, add another **Studio Mode** card and set **Type** to **Take Live**. It’s available when Studio Mode is on and Preview differs from Program. The card shows the next scene and transition, such as **Take Studio** with **Fade** underneath. When both scenes match, it shows **Currently Live**. If the preview changes before the command reaches OBS, check the updated name before tapping again.

## Choose a transition

Under **OBS Studio → Transitions**, choose **Cycle transitions** to step through the transitions configured in OBS. The card shows the selected transition and lights up while you press it. Choose **Select a transition** to make separate cards for **Cut**, **Fade**, or a custom transition. Each card lights up when its transition is selected in OBS.

## Add grouped scene or transition pages

Open **Add Card → OBS Studio → Grouped pages** and choose **Scenes** or **Transitions**.

- **Scenes** follows the current OBS scene collection. Edit the page card to hide or reorder scene buttons. **Break**, **Transition**, and **Take Live** fill the bottom of the page when space is available. **Take Live** spans two columns by default.
- **Transitions** fills free cells with the current OBS transitions. Expand the **Transitions** list in the page card’s settings to hide or reorder them.

Scene bindings are kept when the selected scene is unavailable.

## Switch to a break scene

1. In the EspDesktop Mac app, open **Settings → OBS → Break Settings**. Choose a **Break scene** and, if you want OBS to mute an input during breaks, select it under **Mute during break**. EspDesktop saves these choices for the current OBS scene collection.
2. Add a **Break** card to the display and tap **Start**. If you chose an input, the card verifies that it’s muted before switching Program.
3. Tap **Resume** to return to the previous scene. EspDesktop restores an input it muted when it can verify the changes.

Taking another scene live also ends the break and makes **Start** available again. If the microphone was muted during the break, check it in OBS before speaking. If the card says **Check OBS**, check the Program scene and microphone in OBS, then clear the alert in **Break Settings**.
