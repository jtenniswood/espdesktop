---
title: Install and Pair the Mac Companion App
description: Download EspDesktop for macOS 13 or newer, pair a Guition 4848S040 display on your local network and add your first app tiles.
---

# Install and Pair the EspDesktop Mac App

You’ll need a **Mac running macOS 13 or newer** and a [4-inch Guition ESP32-S3 4848S040](/screens/4848s040) on the same local network. Use the Mac app and display firmware from the same release.

## 1. Install the Mac app {#install-a-release}

1. [Install EspDesktop on your display](/getting-started/install) if you haven’t already.
2. Download the **EspDesktop** DMG from the [same release as your display firmware](https://github.com/jtenniswood/espdesktop/releases).
3. Open the DMG, drag **EspDesktop** into **Applications**, then open the app. Its icon appears in the menu bar.

On an Apple silicon Mac, you can also install the latest stable Mac app with [Homebrew](https://brew.sh/).

```sh
brew install --cask jtenniswood/tap/espdesktop
```

Use the DMG download above if you need the app from a specific release.

## 2. Pair your display {#pair-the-display}

1. Select your display in the Mac app. Allow local network access if macOS asks.
2. Choose **Continue** to open the display’s **System → Mac Companion** page in your browser.
3. Copy the pairing code into the Mac app and choose **Connect**. When connected, the Mac Companion panel in your browser collapses and a monitor icon appears beside WiFi on the display.

**Display missing?** Choose **Enter address manually** and enter its IP address or `.local` name.

On **Access and startup**, choose **Open Settings** to grant Accessibility access if you want keyboard shortcuts or Mac Lock. Turn on **Launch at login** if you want EspDesktop to open when you sign in. Choose **Finish**.

### Check the Display tab

Open **Display** in the Mac app to confirm it says **Connected**. Select **Customize** to open the display’s web editor.

[![EspDesktop Mac app showing a connected display, the Customize button, and the Open at Startup switch](/images/mac-app-display.jpg)](/images/mac-app-display.jpg)

## 3. Try your first card {#check-the-connection}

On an empty display, the web page guides you through app setup.

1. Pick up to eight apps for the home screen. Setup leaves one slot free.
2. Choose whether to add shortcut pages for apps with built-in shortcuts. If you add pages, choose whether they open automatically when you switch apps on your Mac.
3. Choose **Done** or **Save setup**. Your cards appear on the display automatically.
4. Tap a card to open its app or bring it to the front on your Mac.

Choose **Skip setup** to build a custom layout in the editor. To run the wizard again, open **Screen → Appearance → App Subpages → Setup Again**. Saving replaces the home-screen cards and their shortcut pages. Close the wizard with **×** to keep your current layout.

[Explore Mac controls](/#what-you-can-control) · [Permissions and security](/mac-controls/security) · [Troubleshoot pairing and controls](/getting-started/troubleshooting)
