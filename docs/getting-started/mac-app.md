---
title: Install and Pair the EspDesktop Mac App
description: Install EspDesktop on macOS, pair a 4848S040 display, approve apps and folders, and enable the permissions used by Mac cards.
---

# Install and Pair the EspDesktop Mac App

The EspDesktop menu-bar app connects one Mac to one supported display over your local network. It powers Mac cards for launching apps, opening folders and websites, replaying shortcuts, arranging windows, and sharing Mac statistics.

Mac Companion currently supports the **4-inch Guition ESP32-S3 4848S040** display. For Home Assistant panels and smart-home controls, visit the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).

## Install a Release

1. [Install EspDesktop firmware](/getting-started/install) on the display.
2. Download the `EspDesktop` DMG from the [matching GitHub release](https://github.com/jtenniswood/espdesktop/releases).
3. Open the DMG and drag **EspDesktop** into **Applications**.
4. Open **EspDesktop**. Its icon appears in the macOS menu bar.
5. Pair your display, then choose your shortcut, statistics, and startup options.

Install the Mac app and display firmware from the same release so their Companion versions match.

## Pair the Display

Make sure the Mac and display are on the same trusted local network.

1. On first launch, choose your display from the discovered list. If setup is already complete, open **Display** to pair. Allow local-network access if macOS asks.
2. Choose **Continue** to open **Connectors → Mac Companion** in your browser. The page opens a temporary pairing window and shows a code.
3. Enter that code in the Mac app and choose **Connect**.
4. Wait for the Mac app to report that the display is connected.

If your display does not appear, choose **Enter address manually** and enter its `.local` name or IP address. Older firmware supports manual pairing but needs an update for automatic discovery.

After pairing, the Mac first tries the saved address. If that fails, it can discover the same display at its new address and reconnect without re-pairing. It verifies the saved device certificate and authenticates before remembering the new address. Discovery does not set up the display's WiFi and may be blocked by guest WiFi or separate network segments.

The code expires after 15 minutes and is hidden after pairing. EspDesktop stores the pairing credential in macOS Keychain and pins the display's certificate so an unexpected certificate change is rejected later.

When the connection is ready, a monitor icon appears beside WiFi in the display's clock bar. The icon disappears shortly after the Mac disconnects.

## Choose the First-Run Options

First-run setup has three steps: choose your display, enter the pairing code, then review **Access and startup**. After pairing, enable Accessibility if you want to use keyboard shortcuts or window controls, and choose whether EspDesktop should open when you sign in. These options are also available in the **Display** tab.

| Option | What it enables | Required? |
|---|---|---|
| **Accessibility** | Keyboard shortcut and window controls | Only for those controls |
| **Open at Startup** | Starts EspDesktop when you sign in so the display can reconnect | Optional |

Keyboard shortcuts and window controls need macOS Accessibility access. Choose **Open Settings**, then turn on **EspDesktop** in **System Settings → Privacy & Security → Accessibility**. App launching, folders, and websites do not need Accessibility permission.

## Approve Apps and Folders

The display cannot ask the Mac to open any arbitrary application or folder.

- Open **Apps** in the Mac app and select only the apps the display may launch or use for website cards.
- Open **Folders**, choose **Add Folder…**, and select each folder the display may open in Finder.
- If a moved folder shows as unavailable, choose **Choose Again…** to renew access.
- Removing an app or folder makes any card that uses it unavailable.

Folder paths stay on the Mac. The display receives only the friendly folder name and an anonymous identifier.

## Check the Connection

After pairing, open the display's web page and add a simple **Companion → Launch app** card for an approved application. Apply the configuration, tap the card, and confirm the app comes to the front.

Then add the controls you want:

- [Mac Controls](/card-types/companion) links to the detailed guide for each control type.
- [Setup](/features/setup) explains card placement, sizes, colours, subpages, and backups.

## Accessibility and Startup

The **Accessibility** and startup settings sit below the connection panel in the **Display** tab:

- **Open at Startup** keeps the local connector available after you sign in.
- **Enable Shortcuts** opens the macOS Accessibility setting; the app reports whether access is available.

Mac statistics become available to the paired display while connected, when the display firmware supports them.

If shortcuts or window cards stop working after replacing the app, remove the old EspDesktop entry from Accessibility, add the installed app again, and retry the card.

## Support

Open **Support** in the Mac app to get help, report issues, suggest features, or contribute through Buy Me a Coffee. Optional contributions help fund continued support, improvements, and new features over time.

To start onboarding again, choose **Restart Setup** below Privacy Policy and confirm. This removes the Mac’s saved display pairing and returns to display setup, while keeping your application and folder choices. You’ll need a new pairing code from your display.

## Re-pair or Replace a Display

Choose **Forget Display** in the Mac app before pairing a replacement display. On the old display, reset pairing from **Connectors → Mac Companion**. Pair again using the new temporary code.

For security, an unexpected display certificate change is not accepted silently; forgetting and pairing again is required.

## Test a Feature Branch

For an unreleased test build, open [`macos/EspDesktop/Package.swift`](https://github.com/jtenniswood/espdesktop/blob/main/macos/EspDesktop/Package.swift) in Xcode, select the **EspDesktop** product, choose your Personal Team for signing, and run it.

Keep the display firmware and Mac app on matching branches when testing Companion changes. A normal release app may connect but will not necessarily understand cards added by a newer firmware branch.

See [Companion Compatibility](/reference/companion-compatibility) for the current protocol details.

Mac statistics cards show an icon above the reading. Memory and storage labels include **used** or **free**, battery shows the percentage **remaining**, and network shows throughput in **MB/s**. The same layout is used for statistics on subpage cards.
