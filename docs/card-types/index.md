---
title: "EspDesktop Card Types"
description: "Choose Mac controls, local panel actions, information cards and folders."
---

# Card Types

Webhook cards saved with older firmware appear as empty slots after updating.

Cards show information and controls on the display. Mac controls use the paired [EspDesktop Mac app](/getting-started/mac-app); local cards run on the panel.

| Goal | Card |
|---|---|
| Launch apps, run shortcuts, open websites and folders, or arrange windows | [Companion](./companion) |
| Open another page of cards | [Subpage](/features/subpages) |

[Existing Stats cards](/mac-controls/statistics) continue to show readings from the paired Mac.

## Removed Mac audio cards

Saved Volume, Mic, and mute cards leave empty spaces when the display loads a layout or restores a backup.

## Saved Home Assistant cards

Home Assistant control cards are retired. Existing records keep their identifiers and saved configuration in layouts and backups. They appear unavailable and do not subscribe to entity state, send actions, or open remote controls. Their editors explain replacement.

Folders continue to provide navigation, including access to Mac and local child cards. Replace retired child cards individually when updating an existing layout.

Sensor, Internal Switches, Wifi Sharing, Screensaver and Screen Lock cards are no longer supported, including in saved layouts. Their spaces become available for replacement cards.

Date & Time cards have been removed. Existing Date, Time & Date, Clock, and World Clock cards leave empty spaces when the panel loads a layout or restores a backup.
