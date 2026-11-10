---
title: EspDesktop Screensaver
description:
  How to configure local and Mac Companion screensaver modes on your EspDesktop panel.
---

# Screensaver

The panel can use a screensaver when it's not being used. When active, it can dim the normal screen, show a dim clock, or turn the backlight off so the panel goes dark. Touch the screen to wake it up. The wake touch does not press a card; release it, then tap the control you want.

There are three screensaver modes, configured in **Screen > Sleep & Schedule > Screensaver** on the [Setup](/features/setup) page:

## Disabled

The screensaver does not run automatically. This is the default setting.

## Timer

The screensaver turns on after the panel hasn't been touched for a set amount of time. Choose from:

- 10 seconds
- 30 seconds
- 1 minute
- **5 minutes** (the default)
- 10, 15, 20, 30, or 45 minutes
- 1 hour

If the 10 or 30 second choices are not shown, update the panel firmware first. The web page checks what range the installed firmware supports before showing the shorter timer values.

### What Happens

Use **Then** to choose what happens when the screensaver activates:

- **Screen Dimmed** — keeps the normal screen visible, but lowers the backlight. The first tap wakes the screen instead of pressing a card.
- **Clock** — shows a large drifting clock at reduced brightness. The time updates at each minute boundary, and the clock repositions itself to prevent burn-in.
- **Display Off** (the default) — switches to a black screen and turns the backlight off completely. While the backlight is off, EspDesktop can exercise the LCD pixels in the background to reduce burn-in risk; this should not be visible.

When Screen Dimmed is selected, Manual brightness mode uses **Dimmed Screen Brightness**. Automatic and Timed brightness modes use separate **Daytime Dimmed Screen Brightness** and **Nighttime Dimmed Screen Brightness** values, changing at the same sunrise/sunset or dawn/dusk boundary as the main screen. When Clock is selected, set separate **Daytime Clock Brightness** and **Nighttime Clock Brightness** values.

**Show date** adds the local date below the Clock screensaver, centered in a smaller font. It is off by default, is saved across restarts, and moves with the clock to reduce burn-in. The month uses the panel’s selected language. Update the panel firmware if the toggle is not shown. Timer and App Connection modes share the setting.

## App Connection

With the current Mac app and panel firmware, locking your Mac also locks the panel controls and shows a lock icon, **Locked**, and **Unlock your Mac to use this screen** while its backlight is on. Unlocking the Mac removes this lock automatically. The Mac app must be running and paired. If the connection drops while locked, the panel keeps the lock until the app reconnects and reports that the Mac is unlocked.

The panel stays awake while the paired Mac app is connected and the Mac is unlocked. With **Display Off** selected and both the app and firmware updated, the panel shows **Locked** while any Mac display is awake. It fades out when the Mac displays sleep and shows **Locked** again if a display wakes before you unlock. **Screen Dimmed** and **Clock** still take effect when the Mac locks. The panel uses the selected **When disconnected** action if the app loses its connection. If the Mac loses power or network access without closing the connection, detection can take around 20 seconds.

Saved Camera screensaver settings from older firmware fall back to Display Off. Camera images and photo-metadata overlays are no longer available.

## Updating an existing panel

Saved Home Assistant Sensor screensaver modes become **Disabled**. Choose **Timer** or **App Connection** to enable an automatic screensaver again. Other saved local modes and brightness settings are preserved.

### Home Assistant wake {#wake-from-home-assistant}

Home Assistant wake automations are retired with the integration. Use the touchscreen to wake the panel.

## Screen Schedule

The [screen schedule](/features/screen-schedule) is separate from the screensaver. Use it when you want the panel to be fully dark, dimmed, or showing a clock overnight.

Time-based Night Schedule has priority over the screensaver during night time. Touch wake uses the temporary wake settings from the screen schedule. Saved sensor-based Night Schedules become Disabled; choose Time to set local hours.
