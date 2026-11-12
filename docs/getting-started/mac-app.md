---
title: Install and pair the EspDesktop Mac app
description: Connect a Guition 4848S040 touchscreen to EspDesktop on an Apple silicon Mac, verify the pairing, and launch your first app.
---

# Install and pair the EspDesktop Mac app {#install-and-pair-the-espdesktop-mac-app}

Use an **Apple silicon Mac with macOS 13 or newer**. Finish [installing the display firmware](/screens/4848s040#install) first and connect the Mac and touchscreen to the same local network.

## Install a matching release {#install-a-release}

<a class="docs-primary-action" href="/download">Download EspDesktop for Mac</a>

Use the Mac app and display firmware from the **same EspDesktop release**. Open the DMG, move EspDesktop to Applications, and open it. If macOS asks for Local Network access, choose **Allow** so the app can find the display.

## Pair the display

1. Select the touchscreen in the Mac app and choose **Continue**. This opens the display's pairing page in your browser.
2. Enter the temporary code from that page in the Mac app. The code expires after 15 minutes.
3. Confirm the display is connected in the EspDesktop menu bar or under **Mac Settings → Displays**.

![EspDesktop Mac app ready to accept the display pairing code](/images/mac-companion-enter-pairing-code.png)

If the display is missing, see [discovery troubleshooting](/getting-started/troubleshooting#the-display-does-not-appear-in-espdesktop). If the code has expired, get a fresh code from the display's pairing page and follow the [pairing troubleshooting steps](/getting-started/troubleshooting#the-display-will-not-pair) if needed.

## Check the connection

Choose **Customize** in the Mac app. Follow the [first setup wizard](/features/first-run) to add a Mac app, then tap that app on the touchscreen. It should open or come to the front on the Mac.

To pair another touchscreen, use **Mac Settings → Displays → Add Display** and enter the code for that display.

## Check for Mac app updates

Open [Mac app settings](/settings/mac-app) to check for updates. Keep the app and firmware on the same release.
