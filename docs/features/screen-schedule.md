---
title: EspDesktop Screen Schedule
description:
  How to control what the EspDesktop panel does overnight.
---

# Screen Schedule

Screen schedule controls what the panel does overnight, then returns it to normal when the schedule says it should be available again.

You will find it in **Screen > Sleep & Schedule > Night Schedule** on the [Setup](/features/setup) page.

## Settings

- **Mode** - choose **Disabled** or **Time**. **Time** is the default and uses the panel’s local time.
- **Daytime** - the first hour when the screen should be awake. The default is **7:00 AM**.
- **Night Time** - the first hour when the night schedule starts. The default is **7:00 PM**.
- **At Night Time** - what the panel should do overnight. The default, **Screen Dimmed**, keeps the panel usable at a set brightness. **Screen Off** turns the backlight off, and **Clock** shows the clock. Screen Off can protect the LCD in the background while the backlight stays off.
- **When Woken, Idle Time to Screen Off** - shown only for **Screen Off**. It controls how long the screen stays awake after you tap it during scheduled-off hours. The default is **1 minute**.
- **When Woken, Screen Brightness** - shown only for **Screen Off**. It controls the brightness used for a temporary wake during scheduled-off hours. The default is **10%**.
- **Dimmed Screen Brightness** - shown only for **Screen Dimmed**. It controls the overnight brightness while the panel stays usable. The default is **15%**.
- **Clock Brightness** - shown only for **Clock**. It controls the backlight level used by the overnight clock. The default is **10%**.
- **Clock Text Colour** - shown only for **Clock**. It controls the colour of the overnight schedule clock text.

## Updating an Existing Panel

Saved Home Assistant sensor schedules become **Disabled**, including when importing an older backup. Choose **Time** to configure local hours. Saved schedule choices, hours, night-time actions and brightness settings are preserved.

When the schedule is disabled, the panel uses the normal [screensaver](/features/screensaver) and [backlight](/features/backlight) rules.

To see at a glance when the night period is active, turn on **Show Night Mode Icon** in [Clock Bar](/features/clock-bar). A moon appears beside the connectivity icon for as long as the night schedule is running.

Time-based Night Schedule has priority over the screensaver while night time is active. Touch the screen to wake it temporarily.

## How the Times Work

The on time is included, and the off time is not included. With the defaults, the screen uses its normal brightness from 7:00 AM until just before 7:00 PM, then dims to 15%.

Overnight schedules also work. For example, **8:00 PM** to **7:00 AM** keeps the screen on through the night and turns it off during the day.

If the on and off times are the same, the schedule is treated as always on.

## Manual Wake and Sleep

Touching the screen while it is asleep or waking it while the schedule clock is showing does not change the saved schedule. In **Screen Off** and **Clock** modes, a temporary wake outside the scheduled hours uses the saved wake brightness, stays awake for the saved wake idle time, then returns to the selected night mode.

Pressing and holding a button on the touchscreen for 3 seconds puts the screen to sleep manually. This is stronger than the schedule, so it will not immediately wake again just because the current time is inside the scheduled-on window. Tap the screen to wake it.

## Brightness

Screen schedule works alongside the selected **Brightness Mode**. During scheduled-on hours, **Manual** restores the saved manual level, **Automatic** uses calculated local solar times, and **Timed** uses the saved Dawn and Dusk times. **Screen Dimmed** uses its own overnight brightness setting. **Screen Off** turns the physical backlight off and can run invisible burn-in protection while dark, while **Clock** uses its own clock brightness and text colour settings.
