---
title: Install and Pair the EspDesktop Mac App
description: Install the EspDesktop Mac app, pair your Guition 4848S040 display, and try your first Mac control.
---

# Install and Pair the EspDesktop Mac App

You’ll need a Mac and a **4-inch Guition ESP32-S3 4848S040** display on the same trusted local network.

## 1. Install the Mac app {#install-a-release}

1. [Install EspDesktop on your display](/getting-started/install) if you haven’t already.
2. Download the **EspDesktop** DMG from the [same release as your display firmware](https://github.com/jtenniswood/espdesktop/releases).
3. Open the DMG, drag **EspDesktop** into **Applications**, then open the app. Its icon appears in the menu bar.

## 2. Pair your display {#pair-the-display}

1. Select your display in the Mac app. Allow local network access if macOS asks.
2. Choose **Continue** to open the display’s **System → Mac Companion** page in your browser.
3. Copy the pairing code into the Mac app and choose **Connect**. When connected, a monitor icon appears beside WiFi on the display.

**Display missing?** Choose **Enter address manually** and enter its IP address or `.local` name.

On **Access and startup**, choose **Open Settings** to grant Accessibility access if you want keyboard shortcuts or window controls. Turn on **Launch at login** if you want EspDesktop to open when you sign in. Choose **Finish**.

## 3. Try your first card {#check-the-connection}

1. Open the display’s web page and add a **Companion → Applications** card in an empty slot.
2. Pick an app and choose **Apply Configuration**.
3. Tap the card on the display. The app should open or come to the front on your Mac.

[Explore Mac controls](/#what-you-can-control) · [Permissions and security](/mac-controls/security) · [Troubleshoot pairing and controls](/getting-started/troubleshooting)
