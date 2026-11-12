---
title: "Clock Bar"
description:
  How to configure the clock bar shown at the top of your EspDesktop panel.
---

# Clock Bar

The clock bar is the narrow status area at the top of the panel. It shows the current time and connectivity status. Local folder titles and Mac app titles/icons use the left side when a secondary page is open.

You will find these controls in **Screen > Appearance > Clock Bar** on the panel web page.

## Settings

- **Show Clock Bar** - turns the whole top bar on or off.
- **Show Night Mode Icon** - shows a moon beside the connectivity icon while the night schedule is active. Off by default.
- **Clock** - select the clock item in the screen preview and choose **Hide** or **Show**.
- **Connectivity** - select the connectivity item in the screen preview and choose **Hide** or **Show**.

The clock bar layout is not customizable. Hidden items stay greyed in the web preview so you can select and show them again, but they are hidden on the device screen. Retired HA temperature settings in older backups are ignored.

Tap the network status icon on the panel to open Settings. The page shows “Settings” on the left of the clock bar, restoring the previous page’s title on Back, and uses the display’s normal grid columns, icons and label sizes while keeping the clock bar visible. The 1×1 cards run left to right, then wrap to the next row: **Back**, **IP address**, **Paired** or **Unpaired**, **Connector**, **Wi-Fi quality** (Wi-Fi builds), **Build**. The device name card reflects [Device Name](/settings/system#naming-your-panel). **Build** shows the installed firmware version, **IP address** shows the current address, and **Connector** shows the Mac connector state. The address, pairing status, connector state and Wi-Fi quality update while the page is open. Wi-Fi quality shows a percentage in its label, or **Disconnected** while disconnected or waiting for a signal reading. Use the **Paired** or **Unpaired** card to pair a Mac: its modal fills the card area and shows a pairing code, the display’s IP address and a Close button. Pairing is disabled on builds without Mac connector support and while the screen is locked. Close the popup to return to Settings, then tap **Back** to return to the page you were using.

The night mode moon appears whenever the [Night Schedule](/features/screen-schedule) is in its night period, using the local time schedule. It is visible in practice when the schedule keeps the screen awake or dimmed rather than turning it off, and it disappears again when normal mode resumes.


The time format and timezone are configured separately in [Time Settings](/features/clock).

Opening a card's controls shows its displayed card label to the left of the clock. Closing the controls restores the underlying page title.

The Settings shortcut remains accessible while card controls or a nested menu are open. Opening Settings closes those controls; Back returns to the underlying page. Hidden clock-bar controls remain hidden.

On the 4-inch P4-86, Settings uses a larger icon and touch target for reliable taps.
