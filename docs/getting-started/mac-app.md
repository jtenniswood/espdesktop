---
title: Install the EspDesktop Mac App
description: Install EspDesktop on macOS, pair it with a supported display, and enable optional Mac controls.
---

# Install the EspDesktop Mac App

The EspDesktop menu-bar app connects a supported display to one Mac on your local network. It powers Companion cards for launching approved apps, opening approved folders and web links, replaying keyboard shortcuts, controlling media, and showing optional Mac statistics.

Companion cards are currently a proof of concept for the **4-inch 4848S040** display. Home Assistant-only controls continue to work without the Mac app.

## Install a release

1. Install EspDesktop firmware on the display.
2. Download the `EspDesktop` DMG from the [matching GitHub release](https://github.com/jtenniswood/espdesktop/releases).
3. Open the DMG and drag **EspDesktop** into **Applications**.
4. Open **EspDesktop**. Its icon appears in the macOS menu bar.
5. Follow the setup guide. Accessibility is only required for keyboard shortcuts and window controls; sharing Mac statistics and opening at login are optional.

Install the Mac app and display firmware from the same release so their Companion protocol versions match.

If **EspControl Companion** is already installed, quit it and turn off its **Open at Login** setting before opening EspDesktop. EspDesktop carries your existing pairing, approved apps and folders, and preferences forward automatically. Keeping the old app closed prevents both versions from competing for the same display while you test the renamed app.

## Pair a display

1. Open the display's web settings and choose **Connectors → Mac Companion**. This opens a temporary pairing window and shows a code.
2. In EspDesktop, open **Display**, enter the display address and pairing code, then choose **Continue**.
3. After the connection succeeds, approve only the Mac applications and folders the display should be allowed to use.

Pair on a trusted local network. EspDesktop stores the pairing credential in macOS Keychain and pins the display certificate. Use **Forget Display** before pairing a replacement display or certificate.

## Test a feature branch

For an unreleased test build, open [`macos/EspDesktop/Package.swift`](https://github.com/jtenniswood/espdesktop/blob/main/macos/EspDesktop/Package.swift) in Xcode, select the **EspDesktop** product, choose your Personal Team for signing, and run it. Keep the display firmware and Mac app on matching branches when testing Companion changes.

See [Companion Cards](/card-types/companion) for card setup and current limits.
