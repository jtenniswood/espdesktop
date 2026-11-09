---
title: Supported EspDesktop Firmware Profiles
description: Identify EspDesktop firmware profiles and match the panel hardware revision.
---

# Supported EspDesktop Firmware Profiles

The Mac Companion product currently supports the **4-inch Guition ESP32-S3 4848S040**. Other profiles below retain firmware builds for local panel features; a successful build does not establish Mac Companion support on that device.

Home Assistant integration is retired. For a Home Assistant panel, use the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).

## Compare Supported Screens

These are the standard home-screen layouts. A larger card occupies several slots. Each [subpage](/features/subpages) reserves one slot for Back.

<p class="screen-comparison-hint">Swipe the table sideways to compare layouts.</p>

| Screen and installation guide | Processor | Resolution and default layout | Home slots |
| --- | --- | --- | --- |
| [4-inch Guition 4848S040](/screens/4848s040) | ESP32-S3 | 480 × 480, square | 9 |
| [4.3-inch Guition JC4880P443](/screens/jc4880p443) | ESP32-P4 | 480 × 800, portrait | 6 |
| [4.3-inch Guition JC4880P443 V3](/screens/jc4880p443-v3) | ESP32-P4 v3.x | 480 × 800, portrait | 6 |
| [4-inch P4 86 Panel, ETH-2RO](/screens/p4-86) | ESP32-P4 | 720 × 720, square | 9 |
| [7-inch Guition JC1060P470](/screens/jc1060p470) | ESP32-P4 | 1024 × 600, landscape | 15 |
| [10.1-inch Guition JC8012P4A1](/screens/jc8012p4a1) | ESP32-P4 | 1280 × 800, landscape | 20 |

Camera, media-player, climate and other Home Assistant cards are no longer available. Saved records remain in layouts and backups with unavailable-card warnings. Mac app icons and fullscreen Mac artwork remain available on the Companion profile.

## Networking and Power

All standard browser installs use **2.4 GHz WiFi**. The JC1060P470 and P4 86 Panel also have documented **advanced Ethernet-only builds** on their model guides. These require manual ESPHome installation, disable WiFi setup, and use different update settings. Switch between networking variants over USB.

Use the model's USB programming port and a data-capable cable for installation. For everyday power, check the exact board's labelled input, voltage, required current, and connector before buying a supply. USB connector shape does not establish support for another voltage or power input.

The Waveshare **ESP32-P4-86-Panel-ETH-2RO** supports USB-C power or its separate DC 6–30 V input, as documented in the [manufacturer's power guidance](https://docs.waveshare.com/ESP32-P4-WIFI6-Touch-LCD-4B/FAQ). This specification applies to that exact board, not the Guition panels. An Ethernet socket does not by itself establish PoE support. Battery measurement is only documented for [compatible JC8012P4A1 battery hardware](/features/battery).

## Identify the Hardware Revision Before Installing

- **10.1-inch JC8012P4A1:** check chip information first. ESP32-P4 v3.x production silicon needs [V3 firmware](/screens/jc8012p4a1-v3), regardless of the case date. Otherwise, rear-case markings `2627` or lower use [V1](/screens/jc8012p4a1-v1), and `2628` or higher use [V2](/screens/jc8012p4a1-v2).
- **7-inch JC1060P470:** a case marked `V2`, or a screen-board date `2622` or higher, identifies [V2](/screens/jc1060p470-v2). An unmarked case with an earlier board date identifies [V1](/screens/jc1060p470-v1). Follow the [identification guide](/screens/jc1060p470) if uncertain.
- **4-inch P4:** EspDesktop targets **ESP32-P4-86-Panel-ETH-2RO**. Other rear boards or similarly named camera variants are not automatically supported.

Matching screen size, resolution, or processor is not sufficient. The common Cheap Yellow Display and other unlisted boards do not have ready-to-install EspDesktop firmware.

## Buy, Mount, and Install

Each model guide above links to its seller and installation instructions. Seller prices and revisions can change; confirm the exact model before ordering. Match [printable stands and mounts](/reference/3d-printable-stands) to the rear board and cable clearance as well as the screen size.

Once you have the correct screen, follow **[Install EspDesktop](/getting-started/install)**. On the 4848S040, pair the Mac app and test one control before building the rest of your layout.
