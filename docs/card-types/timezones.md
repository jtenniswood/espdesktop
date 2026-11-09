---
title: "Show World Clocks on Your Touchscreen"
description:
  How to show the current time for another city on your EspDesktop panel.
---

# World Clock

A world clock card shows the current time in a selected city. The time appears above the city name.

## Editing an Existing World Clock Card

The card picker no longer offers [**Date & Time**](/card-types/calendar). Open a saved **World Clock** card to change **City / Timezone** or adjust **Large Clock**. On a **Wide** card, the city label is hidden when **Large Clock** is enabled.

## How It Works on the Panel

- The dropdown uses the same city/timezone list as the main [Time Settings](/features/clock) setting.
- The card follows the panel's 12-hour or 24-hour clock format.
- The time updates once per minute from the panel's own synced time source.
- The card uses the fixed **tertiary** background colour, like Sensor, Date, and Weather cards.
- If the panel has not synced time yet, the card shows `--:--` until time becomes available.
- Older backups or logs may still refer to this as `timezone`. That is the internal saved name for the same **World Clock** card, kept so existing cards continue to load.
