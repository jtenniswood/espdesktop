---
title: EspDesktop FAQ
description:
  Frequently asked questions about EspDesktop Mac controls, Home Assistant, WiFi, setup, updates, and supported displays.
---

# FAQ

## How Do I Find My Device's IP Address?

There are several ways:

- **On the display itself** — when no cards are configured yet, the panel shows its address on screen.
- **In your router** — look at the connected devices list in your router admin page. The panel will appear with its hostname.
- **In Home Assistant** — go to **Settings > Devices & Services > ESPHome**, click on the device, and look for the IP address.

## The Web Page Looks Broken or Unstyled

The panel's built-in web page loads some visual resources from the internet. If the page looks plain or broken:

- Make sure your panel has a working **internet connection**, not just local network access. Some routers block IoT devices from reaching the internet.
- Try **clearing your browser cache** and reloading the page.
- Try a different browser (Chrome or Edge recommended).

## My Device Won't Connect to WiFi

- Make sure you're connecting to a **2.4 GHz** network. The panel does not support 5 GHz WiFi.
- Double-check your **WiFi password** — it's easy to mistype on a small screen.
- Move the panel **closer to your router** during initial setup. You can move it to its final location afterwards.
- If the panel previously connected but can't anymore (e.g. you changed your WiFi password), it will first try to reconnect. If that does not work, it will create a hotspot so you can enter the new details. Look for a network called **ESP_xxxxxx**; it can take up to **90 seconds** to appear.
- If you installed an advanced Ethernet-only build, WiFi setup is intentionally disabled. Check the Ethernet cable, switch port, and DHCP/router lease list instead.

## How Do I Reset the Device?

To start completely fresh, re-flash the firmware using the [install guide](/getting-started/install). Connect the panel to your computer with a USB-C cable and use the web installer. This will reset WiFi settings and the panel will create its setup hotspot again.

Your card configuration is stored separately and will be preserved unless you change it through the web page.

## Can I Use This Without Home Assistant?

Yes. On the **4-inch 4848S040**, the Mac Companion connector can complete setup and provide Mac controls without Home Assistant. Pair the EspDesktop Mac app to launch approved apps, open folders and websites, run shortcuts, arrange windows, control media and volume, and show optional Mac statistics.

Home Assistant is still required for smart-home entities such as lights, heating, sensors, and Home Assistant media players. You can connect it alongside Mac Companion to mix both types of cards on the 4848S040.

The other supported panel profiles currently do not offer Companion cards and continue to use Home Assistant for their main controls and information.

## What Can I Control on My Mac?

The 4848S040 can launch approved applications, create ready-made Safari, Slack, or Codex shortcut pages, replay custom keyboard shortcuts, open approved Finder folders, open safe web links, control and arrange the active window, control macOS Now Playing, adjust output or input volume, show Now Playing artwork, and display processor, memory, storage, network, or battery statistics.

See [Mac Cards and Capabilities](/card-types/companion) for the complete list and required permissions.

## Why Is a Mac Card Disabled?

Check the monitor icon beside WiFi on the display. If it is missing, open EspDesktop on the Mac and check the **Display** page. If the Mac is connected:

- approve the selected application in **Applications**;
- add or renew the folder in **Folders**;
- allow Accessibility for shortcut and window cards;
- turn on statistic sharing for Mac statistic cards; or
- check that the current audio or media application supplies the needed macOS control.

The Mac app and display firmware should come from the same release or matching feature branch.

## How Do I Update the Firmware?

If **Auto Update** is turned on (the default), the panel checks for and installs new versions automatically. You don't need to do anything.

To update manually:

1. Open the panel's web page.
2. Go to the **Settings** tab in the [Setup](/features/setup).
3. Under **Firmware**, press **Check for Update**.
4. If a new version is available, the panel will download and install it.

Advanced Ethernet-only builds may have these built-in update controls disabled. Update those displays through ESPHome OTA or USB instead.

See [Firmware Updates](/features/firmware-updates) for more details.

## What If the Icon I Need Isn't Listed?

The panel includes hundreds of icons from the Material Design Icons set. If the one you need isn't there, [open an issue on GitHub](https://github.com/jtenniswood/espdesktop/issues) with the icon name (from [pictogrammers.com/library/mdi](https://pictogrammers.com/library/mdi/)) and what you'd use it for. We'll look into adding it.

## How Many Cards Can I Have?

The home screen has a grid of card slots sized to fill the screen:

- **10.1-inch JC8012P4A1 original panel** — 20 cards (4 rows, 5 columns), for rear case marking `2622` or lower
- **10.1-inch JC8012P4A1 new panel** — 20 cards (4 rows, 5 columns), for rear case marking `2624` or higher
- **7-inch JC1060P470 V1 / original panel** — 15 cards (3 rows, 5 columns), with no version marking on the case and a screen-board date code earlier than `2622`
- **7-inch JC1060P470 V2 / new panel** — 15 cards (3 rows, 5 columns), with `V2` marked on the case or a screen-board date code of `2622` or higher
- **4.3-inch JC4880P443** — 6 cards (3 rows, 2 columns)
- **4-inch ESP32-P4 86 Panel** — 9 cards (3 rows, 3 columns)
- **4-inch 4848S040** — 9 cards (3 rows, 3 columns)

You can have even more using **Subpage** cards. Any home-screen card can be turned into a folder that opens a new page of cards. Each subpage has one fewer usable slot than the home screen because it includes a Back card. See [Subpage](/features/subpages) for details.

## What Is a Subpage?

Subpages are like folders for your cards. Set a home-screen card to the **Subpage** type and it becomes a folder. Tapping it on the panel opens a new page with its own set of cards. This is great for grouping controls by room or device type without filling up the home screen. See [Subpage](/features/subpages).

## Can I Back Up My Setup?

Yes. In the [Setup](/features/setup) **Settings** tab, under **Backup**, you can **Export** your entire setup (cards, subpages, colours, and display settings) as a file. To restore it later, use **Import** to load the saved file. You can also use this to copy your setup to a different panel — the import will rearrange cards automatically if the panels are different sizes. See [Backup](/features/backup) for details.

## Which Panels Are Supported?

EspDesktop currently supports these touchscreen panels:

- **JC8012P4A1 original panel** — 10.1-inch, 1280x800 landscape orientation (ESP32-P4), for rear case marking `2622` or lower
- **JC8012P4A1 new panel** — 10.1-inch, 1280x800 landscape orientation (ESP32-P4), for rear case marking `2624` or higher
- **JC1060P470 V1 / original panel** — 7-inch, 1024x600, landscape orientation (ESP32-P4), with no version marking on the case and a screen-board date code earlier than `2622`
- **JC1060P470 V2 / new panel** — 7-inch, 1024x600, landscape orientation (ESP32-P4), with `V2` marked on the case or a screen-board date code of `2622` or higher
- **JC4880P443** — 4.3-inch, 480x800, portrait orientation (ESP32-P4)
- **ESP32-P4 86 Panel** — 4-inch, 720x720, square (ESP32-P4)
- **4848S040** — 4-inch, 480x480, square (ESP32-S3)

All use the same card configuration and web UI. The grid layout automatically matches each panel's screen size and orientation. **Mac Companion cards are currently limited to the 4-inch 4848S040.** Some ESP32-P4 models also have an advanced Ethernet-only manual install option, which changes how networking and firmware updates work.

## Does the Panel Work with Other Smart Home Platforms?

EspDesktop connects directly to its Mac app for Mac controls and to Home Assistant for smart-home controls. It does not support Google Home, Apple HomeKit, or SmartThings directly. If those platforms are integrated into Home Assistant, the panel can control devices exposed through Home Assistant.

## The Display Is Stuck on the Loading Screen

- Give it up to **60 seconds** on first boot. It needs time to connect to WiFi and download resources.
- If the display shows a WiFi reconnecting message, wait a little longer. Short WiFi outages can recover by themselves before setup mode starts.
- If it stays on the loading screen, **power-cycle** the panel (unplug and re-plug the USB-C cable).
- If the WiFi hotspot appears after restarting, the panel couldn't connect to your network — go through the [WiFi setup](/getting-started/install#connect-to-wifi) again.

## How Is My Data Handled?

Control connections stay on your local network. The panel communicates directly with the paired Mac app and, when configured, Home Assistant. The Mac pairing credential is stored in Keychain, approved folder paths stay on the Mac, and system statistics are shared only when you turn that option on. Internet access is used for firmware update checks and resources used by the panel's web page.

See the [Privacy Policy](/reference/privacy) for the full data and network boundaries.
