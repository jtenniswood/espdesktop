---
title: EspDesktop — Touchscreen Controls for Your Mac
titleTemplate: :title
description: "Pair a small ESP32 touchscreen with your Mac to launch apps, open folders, run shortcuts, arrange windows, control media and volume, and show Mac status."
---

# EspDesktop

**Turn a small touchscreen into a dedicated controller for your Mac.**

EspDesktop pairs an affordable ESP32 touchscreen with a native macOS menu-bar app through the **Mac Companion** connector. Use the display to launch apps, open folders, run keyboard shortcuts, arrange windows, control media and volume, open websites, and keep an eye on your Mac without reaching for the keyboard.

Set up the display from a normal web browser. There is no YAML to write, no project to compile, and **Home Assistant is not required for Mac controls**.

::: info Current Mac support
Mac Companion controls are currently a proof of concept for the **4-inch Guition ESP32-S3 4848S040** display and one paired Mac. Install the display firmware and Mac app from the same release so their versions match.
:::

Start with **[Install EspDesktop firmware](/getting-started/install)**, then **[install and pair the Mac app](/getting-started/mac-app)**.

## What You Can Control

- **Applications** — launch only the Mac apps you approve in EspDesktop.
- **App shortcuts** — give Safari, Slack, or Codex a ready-made page of common controls, or create your own keyboard shortcut cards.
- **Windows** — close, minimise, hide, enter full screen, move, resize, or arrange the active window.
- **Media and artwork** — play or pause the current macOS Now Playing session, skip tracks, see confirmed playback state, and show the current artwork and track details.
- **Volume** — adjust Mac output or input volume with Slider cards.
- **Folders and websites** — open approved Finder folders or safe `http://` and `https://` links in an approved app.
- **Mac statistics** — optionally show processor, memory, storage, network throughput, and battery readings.

You can organise controls into subpages, resize and rearrange cards, change icons and colours, and back up the finished layout from the display's built-in setup page.

## Mac Cards at a Glance

| What you want to do | Card or setting | What it needs |
|---|---|---|
| Launch an approved app | **Companion → Launch app** | Approve the app in EspDesktop |
| Open an approved Finder folder | **Companion → Open folder** | Add the folder in EspDesktop |
| Run a keyboard shortcut | **Companion → Keyboard shortcut** | macOS Accessibility permission |
| Control the active window | **Companion → Window control** | macOS Accessibility permission; macOS 15+ for tiling |
| Play, pause, or skip | **Companion → Media control** | A usable macOS Now Playing session |
| Show Mac usage | **Companion → Stats** | Turn on sharing in **Permissions** |
| Change speaker or microphone volume | **Slider → Mac output/input volume** | A device with software volume control |
| Show current Mac artwork | **Settings → Media Cover Art → Mac Companion** | A usable macOS Now Playing session |

See [Mac Cards and Capabilities](/card-types/companion) for every card type, app shortcut, window action, status, permission, and current limit.

## How It Works

1. **Install EspDesktop firmware** on the 4-inch 4848S040 from Chrome or Edge.
2. **Connect the display to 2.4 GHz WiFi.**
3. **Install the EspDesktop Mac app** from the matching release and open it from Applications.
4. **Pair the Mac and display.** Open the display's web settings, choose **Connectors → Mac Companion**, and enter the temporary code in the Mac app.
5. **Approve access.** Choose the applications and folders the display may use. Accessibility permission is needed only for keyboard shortcuts and window controls.
6. **Build your control surface.** Add Companion, Slider, and Subpage cards from the display's web page.

## Designed to Stay Narrow

EspDesktop is a local companion, not remote desktop software. The Mac app connects to the paired display on your local network and limits it to a small set of defined actions.

- Pairing uses a temporary code, a credential stored in macOS Keychain, and certificate pinning.
- Applications and folders must be approved on the Mac before the display can use them.
- Folder paths remain on the Mac; the display receives only a friendly name and an anonymous identifier.
- Web cards accept only `http://` and `https://` links.
- The connector does not run shell commands or accept incoming network connections on the Mac.

Pair on a trusted local network and remove a display from the Mac app before replacing or re-pairing it.

## Home Assistant Is Optional

The Mac Companion connector is enough to finish setup and use Mac controls on the 4848S040. If you also use Home Assistant, connect it alongside the Mac to mix Mac actions with lights, heating, media players, sensors, and other smart-home controls on the same display.

The other supported EspDesktop panels currently provide the Home Assistant control experience but do not offer Companion cards. See [Supported Screens](/getting-started/install) if that is the setup you want.

## What You Need

- A 4-inch Guition ESP32-S3 4848S040 touchscreen
- A USB-C data cable for the first firmware install
- Chrome or Edge for browser-based flashing
- A 2.4 GHz WiFi network shared by the display and Mac
- A Mac running macOS 13 or newer
- macOS 15 or newer for the newer window tiling and arrangement actions

The 4848S040 is available from [AliExpress](https://s.click.aliexpress.com/e/_c3sIhvBv), with a compatible [3D-printable stand on MakerWorld](https://makerworld.com/en/models/2581572-guition-esp32s3-4848s040-case-stand#profileId-2847301).

## Next Steps

- [Install](/getting-started/install) — flash the display and connect it to WiFi
- [Mac App](/getting-started/mac-app) — install the app, pair the display, and choose permissions
- [Mac Cards and Capabilities](/card-types/companion) — build app, shortcut, window, media, volume, folder, website, and status controls
- [Setup](/features/setup) — arrange cards, colours, pages, display behaviour, and backups
- [Home Assistant Actions](/getting-started/home-assistant-actions) — optional smart-home control alongside the Mac

## Support This Project

If EspDesktop is useful to you, consider [buying me a coffee](https://www.buymeacoffee.com/jtenniswood) to support ongoing development.
