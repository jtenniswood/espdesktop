---
title: "Time Settings"
description:
  How to configure clock sync, timezone, and 12/24-hour format on your EspDesktop panel.
---

# Time Settings

The panel can display a clock in the top bar, updated every minute from network time. You can choose your timezone, switch between 12-hour and 24-hour format, and set custom NTP servers.

## Settings

Configured in **System > Preferences > Time** in [Setup](/features/setup).

- **Timezone** — use **Auto (Mac Companion)** to follow the paired Mac’s timezone, or select a fixed timezone from the dropdown. This also determines sunrise and sunset times used by the [backlight schedule](/features/backlight).
- **Clock Format** — choose **12-hour** for time without an AM/PM suffix, or **24-hour** for 24-hour time. Defaults to 24h.
- **Custom NTP Servers** — turn this on to show and edit the NTP server fields. When it is off, the panel uses the defaults: `0.pool.ntp.org`, `1.pool.ntp.org`, and `2.pool.ntp.org`.
- **NTP Server 1 / 2 / 3** — choose the network time servers used to keep the panel clock accurate when custom NTP servers are enabled.

**Screen > Appearance > Clock Bar** controls whether the top bar is shown. The clock bar shows the time, local folder or Mac app titles, and status icons. Select an item in the screen preview to edit or hide it. When the connectivity icon is shown, tap it on the panel to see the device name, IP address, WiFi strength, and firmware version.

The network status icon is on by default. Hide the **Connectivity** item in the screen preview if you only want the clock and temperature items in the top bar.

## How It Works

The on-screen clock syncs directly from NTP over WiFi. **Auto (Mac Companion)** follows the paired Mac’s timezone, including daylight saving rules. If no supported Mac timezone is available, automatic mode uses UTC. Choose a fixed timezone if you use the panel without a Mac. Older backups using the former automatic timezone setting are restored to **Auto (Mac Companion)**.

You can use public NTP server names, such as the defaults, or a local server/IP address on your own network. If your panel uses manual network settings without DNS, use IP addresses for the NTP servers. Turning **Custom NTP Servers** off resets the saved NTP server values back to the defaults.

The clock format setting affects three things:

1. The **top bar clock** on the panel display, when the clock bar is shown.
2. The **sunrise and sunset** times shown in settings.
3. The **clock preview** on the web setup page.

The setting is saved on the device and persists across restarts.

Sunrise and sunset times are shown under **Screen > Display > Backlight** when **Automatic** is selected.
