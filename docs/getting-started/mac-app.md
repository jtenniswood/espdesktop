---
title: Install and Pair the EspDesktop Mac App
description: Install EspDesktop on macOS, pair a 4848S040 display, approve apps and folders, and enable the permissions used by Mac cards.
---

# Install and Pair the EspDesktop Mac App

The EspDesktop menu-bar app connects one Mac to one supported display over your local network. It powers Mac cards for launching apps, opening folders and websites, replaying shortcuts, arranging windows, controlling media and volume, showing Now Playing artwork, and sharing optional Mac statistics.

Mac Companion is currently a proof of concept for the **4-inch Guition ESP32-S3 4848S040** display. Home Assistant is optional and can be connected alongside it.

## Install a Release

1. [Install EspDesktop firmware](/getting-started/install) on the display.
2. Download the `EspDesktop` DMG from the [matching GitHub release](https://github.com/jtenniswood/espdesktop/releases).
3. Open the DMG and drag **EspDesktop** into **Applications**.
4. Open **EspDesktop**. Its icon appears in the macOS menu bar.
5. Complete the three short setup pages for shortcut support, statistics, and opening at login.

Install the Mac app and display firmware from the same release so their Companion versions match.

::: warning Replacing the older app
If **EspControl Companion** is already installed, quit it and turn off its **Open at Login** setting before opening EspDesktop. EspDesktop carries the existing pairing, approved apps and folders, and preferences forward. Keep the older app closed so both versions do not compete for the same display.
:::

## Choose the First-Run Options

The Mac app explains three independent choices. You can change each one later from **Permissions**.

| Option | What it enables | Required? |
|---|---|---|
| **Shortcut support** | Keyboard shortcut and Window cards | Only for those cards |
| **Statistics card support** | Processor, memory, storage, network, and battery cards | Optional |
| **Stay connected at login** | Starts EspDesktop when you sign in so the display reconnects | Optional but recommended |

Shortcut and window controls need macOS Accessibility access. When asked, turn on **EspDesktop** in **System Settings → Privacy & Security → Accessibility**. App launching, folders, websites, media, artwork, and volume do not need Accessibility permission.

## Pair the Display

Make sure the Mac and display are on the same trusted local network.

1. Open the display's web page.
2. Choose **Connectors → Mac Companion**. The page opens a temporary pairing window and shows a code.
3. In the Mac app, open **Display** and enter the display address, such as `espdesktop.local` or its IP address.
4. Choose **Continue**, enter the code shown by the display, then continue again.
5. Wait for the Mac app to report that the display is connected.

The code expires after 15 minutes and is hidden after pairing. EspDesktop stores the pairing credential in macOS Keychain and pins the display's certificate so an unexpected certificate change is rejected later.

When the connection is ready, a monitor icon appears beside WiFi in the display's clock bar. The icon disappears shortly after the Mac disconnects.

## Approve Applications and Folders

The display cannot ask the Mac to open any arbitrary application or folder.

- Open **Applications** in the Mac app and select only the apps the display may launch or use for website cards.
- Open **Folders**, choose **Add Folder…**, and select each folder the display may open in Finder.
- If a moved folder shows as unavailable, choose **Choose Again…** to renew access.
- Removing an app or folder makes any card that uses it unavailable.

Folder paths stay on the Mac. The display receives only the friendly folder name and an anonymous identifier.

## Check the Connection

After pairing, open the display's web page and add a simple **Companion → Launch app** card for an approved application. Apply the configuration, tap the card, and confirm the app comes to the front.

Then add the controls you want:

- [Mac Cards and Capabilities](/card-types/companion) covers app subpages, custom shortcuts, folders, websites, window controls, media, artwork, volume, and statistics.
- [Setup](/features/setup) explains card placement, sizes, colours, subpages, and backups.

## Permissions Page

The **Permissions** page remains available after setup:

- **Open EspDesktop at Login** keeps the local connector available after you sign in.
- **Share Mac system statistics** sends overall processor, memory, storage, network, and battery readings only to the paired display.
- **Keyboard & Window Controls** opens the macOS Accessibility setting and shows whether permission is available.

If shortcuts or window cards stop working after replacing the app, remove the old EspDesktop entry from Accessibility, add the installed app again, and retry the card.

## Re-pair or Replace a Display

Choose **Forget Display** in the Mac app before pairing a replacement display. On the old display, reset pairing from **Connectors → Mac Companion**. Pair again using the new temporary code.

For security, an unexpected display certificate change is not accepted silently; forgetting and pairing again is required.

## Test a Feature Branch

For an unreleased test build, open [`macos/EspDesktop/Package.swift`](https://github.com/jtenniswood/espdesktop/blob/main/macos/EspDesktop/Package.swift) in Xcode, select the **EspDesktop** product, choose your Personal Team for signing, and run it.

Keep the display firmware and Mac app on matching branches when testing Companion changes. A normal release app may connect but will not necessarily understand cards added by a newer firmware branch.

See [Companion Compatibility](/generated/companion-compatibility) for the current protocol details.
