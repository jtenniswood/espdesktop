---
title: Mac Controls
description: Overview of EspDesktop Mac Companion controls for apps, folders, shortcuts, windows, and Mac statistics.
---

# Mac Controls

Mac controls use the **Mac Companion** connector between the EspDesktop display and the EspDesktop menu-bar app. They currently work on the **4-inch Guition ESP32-S3 4848S040** with one paired Mac.

First [install and pair the EspDesktop Mac app](/getting-started/mac-app). The monitor icon beside WiFi in the display's clock bar shows that the Mac is connected.

Open the display's web page, select an empty home-screen or subpage slot, choose **Companion**, then choose a control type. The available Mac controls are:

- [Launch apps and open websites](/mac-controls/apps)
- [Open Finder folders](/mac-controls/folders)
- [Run keyboard shortcuts](/mac-controls/shortcuts)
- [Control and arrange windows](/mac-controls/windows)
- [Use existing Stats cards](/mac-controls/statistics)
- [Permissions and security](/mac-controls/security)

Choose the **Volume** group to add a slider for the paired Mac’s output or input volume. The output control is labelled **Volume** and the input control **Mic** by default; existing custom labels are kept. Mac volume controls have one **Icon** setting, with a speaker for output and a microphone for input by default. The setup preview and display use the same icon at every volume level. Dragging a volume slider does not trigger swipe navigation. Mac volume and mute cards can be cut, copied, and pasted without Home Assistant enabled, including inside Mac folders.

The Volume group's **Control** menu also offers **Microphone mute** and **Output mute**. Both cards are labelled **Mute** by default and use a microphone or speaker icon. Tap once to mute the selected Mac input or output, then tap again to restore audio at its previous level. Where supported, the device’s native mute preserves the level; otherwise the app sets its level to zero and remembers the exact previous value. Only muted cards use the **on** colour, with a crossed-out speaker or microphone icon. Unmuted cards use the normal icon and **off** colour. The single Icon setting chooses the unmuted appearance; the muted icon switches automatically. Input and output are independent, and the remembered level belongs to that audio device. Raising the level with a Volume slider also unmutes that device.

Install matching updated Mac app and display firmware to use mute cards. The Mac app remembers levels while it stays running, including display reconnects. For devices using the zero-level fallback, if the app restarts while a device is at zero, the mute card is unavailable until you set a nonzero level with its volume slider; it never guesses a restore level. Volume sliders require adjustable system input or output volume. Native mute controls can still work when a device does not offer a volume slider.

Action cards are unavailable when the Mac is disconnected or the selected app, folder, command, or URL is unavailable. Open URL cards use the Mac's default browser. Statistics show `--` until a reading is available.

Companion cards are currently offered only on the 4848S040 profile. For Home Assistant controls, see the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).

For protocol details and matching release versions, see [Companion Compatibility](/reference/companion-compatibility).
