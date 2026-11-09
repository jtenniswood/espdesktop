---
title: Local Speaker Output
description: Local speaker hardware on the ESP32-P4-86 and the retirement of Home Assistant playback.
---

# Speaker Playback

The ESP32-P4-86 profile retains its local ES8311 speaker output, amplifier and ESPHome speaker media-player component. Custom ESPHome automations can use that local component. Other standard display profiles do not include this audio output.

Home Assistant playback, announcement events, voice services and alarm-delay audio settings are retired. The firmware no longer advertises a native API speaker entity for Home Assistant to control.

For Home Assistant speaker integration, use the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).
