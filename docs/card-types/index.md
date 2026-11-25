---
title: "EspDesktop Card Types"
description: "Choose Mac controls, local panel actions, information cards and folders."
---

# Card Types

Webhook cards saved with older firmware appear as empty slots after updating.

Cards show information and controls on the display. Mac controls use the paired [EspDesktop Mac app](/screens/4848s040#install-and-pair-the-espdesktop-mac-app); local cards run on the panel.

| Goal | Card |
|---|---|
| Launch apps, run keyboard shortcuts, or open websites and folders | [Companion](/#what-you-can-control) |
| Show a system statistic from your Mac or Windows PC | [Stats](#stats) |
| Open another page of cards | [Subpage](/features/subpages) |

## Stats

On firmware that includes **Stats**, open the display editor and select an empty card on Home or in a subpage. Choose **Companion → Stats**, select a **Statistic**, and save. The display shows readings from the paired Mac or Windows PC while it is connected.

Available readings include processor usage, memory, storage, network throughput, IP address, and battery level when the computer reports one. For storage or IP address, you can choose a drive or network interface.

## Removed Mac audio cards

Saved Volume, Mic, and mute cards leave empty spaces when the display loads a layout or restores a backup.

## Saved Home Assistant cards

Home Assistant control cards are retired. Existing records keep their identifiers and saved configuration in layouts and backups. They appear unavailable and do not subscribe to entity state, send actions, or open remote controls. Their editors explain replacement.

Folders continue to provide navigation, including access to Mac and local child cards. Replace retired child cards individually when updating an existing layout.

Sensor, Internal Switches, Wifi Sharing, Screensaver and Screen Lock cards are no longer supported, including in saved layouts. Their spaces become available for replacement cards.

Date & Time cards have been removed. Existing Date, Time & Date, Clock, and World Clock cards leave empty spaces when the panel loads a layout or restores a backup.
