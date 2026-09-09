---
title: EspDesktop Clock Bar
description:
  How to configure the clock bar shown at the top of your EspDesktop panel.
---

# Clock Bar

The clock bar is the narrow status area at the top of the panel. It uses a fixed layout: one temperature reading on the left, the current time in the middle, and the connectivity icon on the right.

You will find these controls in **Settings > Display > Clock Bar** on the panel web page.

## Settings

- **Show Clock Bar** - turns the whole top bar on or off.
- **Show Night Mode Icon** - shows a moon beside the connectivity icon while the night schedule is active. Off by default.
- **Temperature** - select the temperature item in the screen preview, choose **Edit**, then choose the Home Assistant sensor and whether to show the degree symbol.
- **Clock** - select the clock item in the screen preview and choose **Hide** or **Show**.
- **Connectivity** - select the connectivity item in the screen preview and choose **Hide** or **Show**.

The clock bar layout is not customizable. Hidden items stay greyed in the web preview so you can select and show them again, but they are hidden on the device screen. Extra saved temperature entries, weather settings, and older saved layout strings are ignored by current firmware.

Tap the network status icon on the panel to open Settings. The page shows “Settings” on the left of the clock bar, restoring the previous page’s title or temperatures on Back, and uses the display’s normal grid columns, icons and label sizes while keeping the clock bar visible. The 1×1 cards run left to right, then wrap to the next row: **Back**, **IP address**, **Paired** or **Unpaired**, **Connector**, **Wi-Fi quality** (Wi-Fi builds), **Build**, **Backlight**. **Build** shows the installed firmware version, **IP address** shows the current address, and **Connector** shows the Mac connector state. The address, pairing status, connector state and Wi-Fi quality update while the page is open. Wi-Fi quality shows a percentage in its label, or a dash while disconnected or waiting for a signal reading. An extra grid row is added when needed to keep every card visible. The backlight slider appears last and changes the saved brightness level: Brightness in Manual mode, or the active Daytime/Nighttime level in Automatic and Timed modes. Dragging preserves the selected brightness mode. Use the **Paired** or **Unpaired** card to pair a Mac: its modal fills the card area and shows a pairing code, the display’s IP address and a Close button. Pairing is disabled on builds without Mac connector support and while the screen is locked. Close the popup to return to Settings, then tap **Back** to return to the page you were using.

The night mode moon appears whenever the [Night Schedule](/features/screen-schedule) is in its night period, in both **Time** and **Home Assistant** mode - in Home Assistant mode it follows the sensor entity and the activation state you chose. It is visible in practice when the schedule keeps the screen awake or dimmed rather than turning it off, and it disappears again when normal mode resumes.

On firmware builds with local voice controls, turn on **Voice Services** to enable wake-word listening and show the microphone shortcut in the clock bar. Voice Services is off by default. When it is off, wake-word listening is stopped and the microphone/speaker shortcut is hidden. Tap the shortcut to adjust the device volume and access the microphone mute control. A microphone-off icon means voice listening is muted; a speaker-off icon means speaker output is muted. See [Voice Control](/features/voice-control) for the ESP32-P4 86 voice setup.

The time format and timezone are configured separately in [Time Settings](/features/clock). The temperature unit is configured in [Temperature Settings](/features/temperature).
