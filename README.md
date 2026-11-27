# EspDesktop

**Turn a small touchscreen into a dedicated controller for your Mac or Windows PC.**

![EspDesktop touchscreen showing Mac app tiles beside a keyboard](docs/public/images/espdesktop-desk.jpg)

EspDesktop pairs an affordable ESP32 touchscreen with a companion app on your computer. Use the display to launch approved apps, open folders and websites, run keyboard shortcuts, and lock your computer.

Set up the display from a normal web browser.

The [Windows app](https://espdesktop.com/windows) supports Intel, AMD, and Arm PCs.

**Documentation and setup guides:** [espdesktop.com](https://espdesktop.com/)

## What You Can Control

- **Applications** — launch only the apps you approve in EspDesktop.
- **App keyboard shortcuts** — open an app-specific page of controls for common actions, or create your own keyboard shortcuts.
- **Apple Shortcuts** — run a workflow from the Mac’s Shortcuts app with a tap, or group several workflows on a dedicated page. Your Mac must be unlocked. [Set up Apple Shortcuts](https://espdesktop.com/mac-controls/apple-shortcuts).
- **OBS Studio** — switch scenes, mix audio, and control recording and streaming on Mac and Windows with a compatible release. [Set up OBS Studio controls](https://espdesktop.com/obs-studio).
- **Lock Machine** — lock your computer with a tap on the display.
- **File folders** — open an approved folder with a tap.
- **Websites** — open `http://` and `https://` links in your default browser.

You can organise controls into subpages, resize and rearrange cards, change icons and colours, and back up or restore the layout from the display’s built-in editor. Apple Shortcuts and OBS Studio controls are available in [EspDesktop v1.4.1](https://github.com/jtenniswood/espdesktop/releases/tag/v1.4.1).

<img src="docs/public/images/espdesktop-slack-subpage.jpg" alt="EspDesktop touchscreen showing a Slack subpage with keyboard shortcuts for messages, search, and unread chats" width="600">

## How It Works

1. **Install EspDesktop firmware** on a supported touchscreen from Chrome or Edge.
2. **Connect the display to 2.4 GHz WiFi.**
3. **Install EspDesktop** for [macOS](https://espdesktop.com/macos) or [Windows](https://espdesktop.com/windows).
4. **Pair the computer and display.** Select the display in EspDesktop and enter its pairing code.
5. **Approve access.** Choose the applications and folders the display may use. Follow the [permissions guide](https://espdesktop.com/mac-controls/security) to enable keyboard shortcuts and Lock Machine.
6. **Build your control surface.** Add Companion cards and arrange them from the display's web page.

Start with the [firmware installation steps](https://espdesktop.com/screens/4848s040#install), then follow the setup steps for your computer. On macOS, install the firmware and companion app from the same EspDesktop release.

## Designed to Stay Narrow

EspDesktop connects to the paired display on your local network and limits it to a small set of defined actions.

- Pairing uses a temporary code, a credential stored on your computer, and a check of the display’s certificate.
- Applications and folders must be approved on your computer before the display can use them.
- Folder paths stay on your computer. The display receives only a friendly name and an anonymous identifier.
- Web cards accept only `http://` and `https://` links.
- The connector does not run shell commands or accept incoming network connections on your computer.

Pair on a trusted local network and remove a display from EspDesktop before replacing or re-pairing it.

## What You Need

- A 4-inch Guition ESP32-S3 4848S040 touchscreen
- A USB-C data cable for the first firmware install
- Chrome or Edge for browser-based flashing
- A 2.4 GHz WiFi network shared by the display and computer
- An Apple silicon Mac running macOS 13 or newer, or an Intel, AMD, or Arm PC running Windows build 22000 or later

The 4848S040 panel is available from AliExpress ([US](https://s.click.aliexpress.com/e/_c3qyIYL7) or [Global](https://s.click.aliexpress.com/e/_c4m73SzH)). A compatible [3D-printable stand is available on MakerWorld](https://makerworld.com/en/models/3592833-espdesktop-4inch-screen-stand#profileId-4115394).

## Project Links

- [Install EspDesktop firmware](https://espdesktop.com/screens/4848s040#install)
- [Download EspDesktop for your computer](https://espdesktop.com/download)
- [Supported display](https://espdesktop.com/screens/4848s040)
- [Touchscreen controls](https://espdesktop.com/#what-you-can-control)
- [Code signing policy](https://espdesktop.com/reference/code-signing)
- [Companion compatibility](https://espdesktop.com/reference/companion-compatibility)
- [Report a bug or request a feature](https://github.com/jtenniswood/espdesktop/issues)

## Development

The repository contains the display firmware and the macOS and Windows apps. See [DEVELOPERS.md](DEVELOPERS.md) for the development workflow and [macos/EspDesktop/README.md](macos/EspDesktop/README.md) and [windows/README.md](windows/README.md) for platform build and packaging details.

After changing card configuration, the web setup page, or generated device files, run:

- `npm run check:product`
- `npm run check:fast`
- `npm run check:web-browser-smoke`
- `npm run docs:build`

## License

EspDesktop is licensed under the [Apache License 2.0](LICENSE). You may use, modify, and distribute it, including for commercial purposes, subject to the license terms. The EspDesktop name and logos are not granted under this software license.

Required notice: see [NOTICE](NOTICE).

## Support This Project

If EspDesktop is useful to you, you can support ongoing development by buying me a coffee.

<a href="https://www.buymeacoffee.com/jtenniswood">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" style="border-radius:999px;" />
</a>
