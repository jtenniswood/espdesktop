---
title: EspDesktop
description: "A local touchscreen for Mac applications, shortcuts, windows, folders, websites and system statistics."
---

# EspDesktop

Turn a small touchscreen into a dedicated controller for your Mac. EspDesktop pairs an ESP32 display with a native macOS menu-bar app over your local network.

Use it to launch approved applications, open folders and websites, run keyboard shortcuts, arrange windows, and show Mac statistics. Set up cards, subpages, icons, colours and display behaviour from a web browser.

::: info Development status
These docs describe the reduced feature scope in [PR #55](https://github.com/jtenniswood/espdesktop/pull/55). The firmware cleanup and device validation are still in progress. The branch is not ready to flash; published releases may differ from these docs.
:::

## Get Started

1. Choose a [supported display](/getting-started/install). Mac Companion currently supports the **4-inch Guition ESP32-S3 4848S040** and one paired Mac.
2. Install matching display firmware and the Mac app once a validated build is available.
3. Connect both devices to the same trusted local network.
4. Open the display's web page and choose **Settings**. The expanded **Mac Companion** box is at the top.
5. Enter its temporary pairing code in the Mac app, then approve the applications and folders you want to use.
6. Open **Screen** to add and arrange cards.

## Cards

| Card | Purpose |
|---|---|
| [Companion](/card-types/companion) | Mac apps, shortcuts, windows, folders, websites and statistics |
| [Date & Time](/card-types/calendar) | Clock, date, or date and time |
| [World Clock](/card-types/timezones) | Time in another city |
| [Subpage](/features/subpages) | A page of related controls |
| [Screen Lock](/card-types/screen-lock) | Prevent accidental touchscreen actions |
| [Webhook](/card-types/webhooks) | Send an HTTP request directly from the display |

Keyboard shortcuts and window controls need macOS Accessibility permission. Mac statistics are shared automatically while connected. Application and folder access is limited to the items you approve on the Mac.

## What You Need

- A supported touchscreen and a USB data cable for its first installation.
- Chrome or Edge for the browser installer.
- A shared local network; the 4848S040 uses 2.4 GHz WiFi.
- macOS 13 or newer; newer window tiling actions need macOS 15 or newer.

The 4848S040 is available from [AliExpress](https://s.click.aliexpress.com/e/_c3sIhvBv). See [printable stands](/reference/3d-printable-stands) for mounting options.

Continue with [Install](/getting-started/install), [Mac App](/getting-started/mac-app), or [Screen Setup](/features/setup).

If EspDesktop is useful to you, consider [buying me a coffee](https://www.buymeacoffee.com/jtenniswood) to support development.
