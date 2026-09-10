# EspDesktop

**Turn a small touchscreen into a dedicated controller for your Mac.**

EspDesktop pairs an affordable ESP32 touchscreen with a native macOS menu-bar app through the **Mac Companion** connector. Use the display to launch apps, open folders, run keyboard shortcuts, arrange windows, open websites, and keep an eye on your Mac without reaching for the keyboard.

Set up the display from a normal web browser. Use the Screen tab for cards and Settings for pairing and display preferences.

> [!IMPORTANT]
> Mac Companion controls are currently a proof of concept for the **4-inch Guition ESP32-S3 4848S040** display and one paired Mac. Use matching display firmware and Mac app versions from the same release.

> The reduced feature set in [PR #55](https://github.com/jtenniswood/espdesktop/pull/55) is still in development. Firmware cleanup and device validation are incomplete; the branch is not ready to flash.

**Documentation:** [jtenniswood.github.io/espdesktop](https://jtenniswood.github.io/espdesktop/)

## What You Can Control

- **Applications** — launch only the Mac apps you approve in EspDesktop.
- **App shortcuts** — open an app-specific page of controls for common actions, or create your own keyboard shortcuts.
- **Windows** — close, minimise, hide, enter full screen, or use the move-and-resize controls available on your version of macOS.
- **Folders and websites** — open approved Finder folders or safe `http://` and `https://` links in an approved app.
- **Mac statistics** — optionally show processor, memory, storage, network throughput, and battery readings.

You can organise controls into subpages, resize and rearrange cards, change icons and colours, and back up the finished layout from the display's built-in setup page.

## How It Works

1. **Install EspDesktop firmware** on a supported touchscreen from Chrome or Edge.
2. **Connect the display to 2.4 GHz WiFi.**
3. **Install the EspDesktop Mac app** from the matching release and open it from Applications.
4. **Pair the Mac and display.** Open the display's web settings, choose **Settings → Mac Companion**, and enter the temporary code in the Mac app.
5. **Approve access.** Choose the applications and folders the display may use. macOS Accessibility permission is needed only for keyboard shortcuts and window controls.
6. **Build your control surface.** Add Companion cards and arrange them from the display's web page.

Start with the [firmware install guide](https://jtenniswood.github.io/espdesktop/getting-started/install), then follow the [Mac app and pairing guide](https://jtenniswood.github.io/espdesktop/getting-started/mac-app).

## Designed to Stay Narrow

EspDesktop is a local companion, not remote desktop software. The Mac app connects to the paired display on your local network and limits it to a small set of defined actions.

- Pairing uses a temporary code, a credential stored in macOS Keychain, and certificate pinning.
- Applications and folders must be approved on the Mac before the display can use them.
- Folder paths remain on the Mac; the display receives only a friendly name and an anonymous identifier.
- Web cards accept only `http://` and `https://` links.
- The connector does not run shell commands or accept incoming network connections on the Mac.

Pair on a trusted local network and remove a display from the Mac app before replacing or re-pairing it.

## What You Need

- A 4-inch Guition ESP32-S3 4848S040 touchscreen
- A USB-C data cable for the first firmware install
- Chrome or Edge for browser-based flashing
- A 2.4 GHz WiFi network shared by the display and Mac
- A Mac running macOS 13 or newer
- macOS 15 or newer for the newer window tiling and arrangement actions

The 4848S040 panel is available from [AliExpress](https://s.click.aliexpress.com/e/_c3sIhvBv), with a compatible [3D-printable stand on MakerWorld](https://makerworld.com/en/models/2581572-guition-esp32s3-4848s040-case-stand#profileId-2847301).

## Project Links

- [Install EspDesktop firmware](https://jtenniswood.github.io/espdesktop/getting-started/install)
- [Install and pair the Mac app](https://jtenniswood.github.io/espdesktop/getting-started/mac-app)
- [Configure Companion cards](https://jtenniswood.github.io/espdesktop/card-types/companion)
- [Companion compatibility](https://jtenniswood.github.io/espdesktop/generated/companion-compatibility)
- [Report a bug or request a feature](https://github.com/jtenniswood/espdesktop/issues)

## Development

The repository contains both the display firmware and the native macOS app. See [DEVELOPERS.md](DEVELOPERS.md) for the development workflow and [macos/EspDesktop/README.md](macos/EspDesktop/README.md) for Mac app build and packaging details.

After changing card configuration, the web setup page, or generated device files, run:

- `npm run check:product`
- `npm run check:fast`
- `npm run check:web-browser-smoke`
- `npm run docs:build`

## License

EspDesktop is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You can view, change, and share the software for non-commercial purposes. Commercial use needs separate permission from the project owner.

Required notice: see [NOTICE](NOTICE).

## Support This Project

If EspDesktop is useful to you, you can support ongoing development by buying me a coffee.

<a href="https://www.buymeacoffee.com/jtenniswood">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" style="border-radius:999px;" />
</a>
