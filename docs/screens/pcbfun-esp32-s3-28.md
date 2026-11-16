---
title: PCBfun ESP32-S3 2.8-inch display
description: Experimental EspDesktop target for the 2.8-inch PCBfun ESP32-S3 touchscreen.
---

# PCBfun ESP32-S3 2.8-inch display

This is an experimental development target for the PCBfun 2.8-inch ESP32-S3 touchscreen. It is not included in the public firmware installer.

The target is configured for the 240 × 320 portrait ILI9341V SPI screen, FT6336G capacitive touch controller, 16 MB flash, and 8 MB PSRAM. It provides six home-screen slots. Other ESP32-S3 screens with a similar size or chip are not automatically compatible.

The board uses its USB-C port for ESP32-S3 USB Serial/JTAG. First installation requires a data-capable USB-C cable and a locally built firmware image. The current public EspDesktop installer remains for the [Guition 4848S040](/screens/4848s040).

For hardware details, see the [LCDWiki board documentation](https://lcdwiki.com/2.8inch_ESP32-S3_Display).
