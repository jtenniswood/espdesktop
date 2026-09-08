---
title: Install EspDesktop Firmware
description:
  How to flash EspDesktop firmware to a supported ESP32 touchscreen, connect it to WiFi, and choose Mac Companion or Home Assistant.
---

# Install

Flash the EspDesktop firmware to your supported ESP32 display directly from your browser — no special software or technical knowledge required.

::: tip Prefer ESPHome?
If you want to compile and install the firmware yourself, use the [Manual Setup guide](/getting-started/manual-esphome-setup).
:::

## Flash the Firmware

Connect the display to your computer with the USB-C cable, choose your panel, then click the install button.

<EspInstallSelector />

## Having Unreliable Wifi on a P4 Panel?

P4 panels use a separate ESP32-C6 Wifi processor. If a P4 panel repeatedly
disconnects, disappears from Home Assistant, cannot finish initial setup, or reports
C6 update timeouts, use the [C6 Wifi recovery installer](/getting-started/c6-recovery).
It repairs the C6 over USB without requiring a working network connection.

This recovery does not apply to the ESP32-S3 4848S040 panel.

::: tip Which cable?
If the install button doesn't detect your device, try a different USB-C cable. Charge-only cables (often thinner and cheaper) won't work — you need one that supports data transfer.
:::

### Step by Step

1. **Plug in the display** using the USB-C cable. If your computer asks to install drivers, allow it.
2. **Choose your panel** above, then click **Install EspDesktop**. A dialog will ask you to choose a serial port — select the one that appeared when you plugged in the display.
3. **Wait for the flash to complete.** This takes a few minutes. You'll see a progress bar. Don't disconnect the cable until it finishes.
4. **The display restarts** and shows a loading screen.

## Connect to WiFi

After flashing, the display needs to connect to your WiFi network.

1. **The display creates a hotspot.** It can take up to **90 seconds** to appear. Connect to it from your phone or laptop.
2. **A setup page opens automatically** (captive portal). If it doesn't, open a browser and go to `192.168.4.1`.
3. **Choose your WiFi network** from the list and enter your password.
4. **The display reconnects** and shows a loading screen while it joins your network. Once connected, the screen will show your device's address (something like `192.168.1.xxx`).

::: tip If the hotspot doesn't appear
Power-cycle the display by unplugging and re-plugging the USB-C cable. The hotspot only appears when the display can't connect to a saved WiFi network, and it may take up to **90 seconds** after startup or a WiFi outage.
:::

## Choose What to Connect

After WiFi setup, connect the service you want to control. Open the display's web page at the address shown on screen, then choose **Connectors**.

### Control a Mac

On the **4-inch 4848S040**, choose **Mac Companion** to pair the EspDesktop Mac app. This is enough to complete setup and use Mac controls; Home Assistant is not required.

Continue with [Install and Pair the EspDesktop Mac App](/getting-started/mac-app).

### Add Home Assistant

Once the display is on your WiFi network, Home Assistant should discover it automatically.

1. **Open Home Assistant** in your browser.
2. **Look for a notification** in the bottom left — it should say a new device was discovered. If you don't see one, go to **Settings > Devices & Services** and look for a new **ESPHome** entry.
3. **Click "Configure"** and follow the prompts to add the device.

This connection supplies smart-home entities and lets the display control your devices. After adding it, [allow Home Assistant actions](/getting-started/home-assistant-actions) so the touchscreen can send commands.

You can connect Home Assistant alongside Mac Companion on the 4848S040. The other supported panel profiles currently use Home Assistant and do not offer Companion cards.

## Configure Your Panel

With the display connected to WiFi and at least one connector configured, you're ready to set it up.

1. **Find the device's address.** It's shown on the display screen. You can also find it in your router's device list or, if connected, in **Home Assistant > Settings > Devices & Services > ESPHome**.
2. **Open that address in a browser** — for example, `http://espdesktop.local`. This opens the device's built-in web page.
3. **Add your cards.** On the **Screen** tab, tap an empty slot and choose the card type you want. A 4848S040 can use **Companion** cards for Mac controls, while Home Assistant cards control or display smart-home entities.
4. **Adjust your settings.** On the **Settings** tab, set your active card colour, temperatures, screensaver timeout, brightness, and more.
5. **Tap "Apply Configuration"** when you're done. The display restarts with your new settings.

That's it — your panel is ready to use. See [Mac Cards and Capabilities](/card-types/companion) for Mac controls or [Setup](/features/setup) for a full walkthrough of the editor.

Next: [Troubleshooting](/getting-started/troubleshooting)
