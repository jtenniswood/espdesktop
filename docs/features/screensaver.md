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

The panel stays awake while the paired Companion app is connected and the screen is unlocked. When the app disconnects or the screen is locked, the panel uses the **When disconnected** action: Screen Dimmed, Clock, or Display Off. This does not wait for the Timer timeout, and retained media playback does not replace that action with cover art. If the Mac loses power or network access without closing the connection, detection can take around 20 seconds.

Saved Camera screensaver settings from older firmware fall back to Display Off. Camera images and photo-metadata overlays are no longer available.

## Updating an existing panel

Saved Home Assistant Sensor screensaver modes become **Disabled**. Choose **Timer** or **App Connection** to enable an automatic screensaver again. Other saved local modes and brightness settings are preserved.

### Home Assistant wake {#wake-from-home-assistant}

Home Assistant wake automations are retired with the integration. Use the touchscreen to wake the panel.

## Mac Cover Art

After pairing Mac Companion, open **Screen → Sleep & Schedule → Cover Art Screen Saver** and enable **Show Cover Art**. The paired Mac supplies artwork, title, artist and progress. **Show After** controls the delay before artwork appears and its return after touching the display. **Show Track Details For** controls the text overlay on supported square displays.

Fullscreen cover art no longer uses Home Assistant media players, artwork URLs, external-input routing or entity filters. Existing backup source choices migrate to Mac Companion. Touch the artwork to wake the panel; with PIN protection enabled, unlock before using your controls.

## Screen Schedule

The [screen schedule](/features/screen-schedule) is separate from the screensaver. Use it when you want the panel to be fully dark, dimmed, or showing a clock overnight.

Time-based Night Schedule has priority over the screensaver and media cover art during night time. Touch wake uses the temporary wake settings from the screen schedule. Saved sensor-based Night Schedules become Disabled; choose Time to set local hours.

## PIN protection after wake

In **Screen > Sleep & Schedule > Pin Protection**, turn on **Require PIN after wake** to show the PIN controls. Enter a numeric **PIN** (1–16 digits) and choose **Save** to enable protection. Until a PIN is saved, turning on the toggle only opens setup; refreshing the page returns it to off.

Use the same field and **Save** button to change the PIN. **Clear** removes it and disables protection; turning off the toggle keeps the saved PIN for later use. Saved settings survive a restart. Update the panel firmware if the controls are not shown.

**Randomize keypad layout** is off by default. Turn it on to shuffle the digit layout each time the PIN keypad opens. The choice is saved on the panel.

The [Screen Lock card](/card-types/screen-lock) manages the same PIN and keypad preference in its card editor. It works with **Require PIN after wake** turned off. Its **Screensaver on lock** option can start the screensaver immediately; with the option off, the current screen remains visible and touching it opens the PIN keypad. Unlocking after a screensaver also releases a preceding card lock. To clear the shared PIN, use **Clear** in **Screen > Sleep & Schedule > Pin Protection**; this releases the lock and disables automatic PIN protection.

After a screensaver or manual sleep, the touchscreen shows the PIN keypad. Enter the PIN and press the checkmark to unlock. A wrong PIN clears the entry and keeps the controls blocked. **X** clears entered digits; when the entry is empty, it returns to the previous cards or screensaver view while keeping the screen locked. Touch wake, scheduled wake, and the local Screensaver card all use the same protection. With protection disabled or no PIN saved, wake works as before. When protection is active, touching Cover Art wakes the PIN keypad; use your media controls after unlocking.

This protects local touchscreen controls, including status buttons and alarm modals. It does not protect network, OTA, or web administration access. Someone with web setup access can change or clear the PIN; configure [web authentication](/getting-started/manual-esphome-setup#advanced-password-protect-the-web-page) separately if needed. The PIN is never returned by the settings API or included in backup JSON. Importing a backup clears the destination panel's PIN, so set a new PIN on its web setup page afterward.

## Start the screensaver with a card

Add the **Screensaver** card to the home screen or a subpage. It needs no Home Assistant entity. Tapping it immediately starts the selected **Then** action: Display Off, Screen Dimmed, or Clock. It works even when automatic screensavers are disabled or media is playing. Tap the screen to wake it, then enter the PIN if protection is enabled.
