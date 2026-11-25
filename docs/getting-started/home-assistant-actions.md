---
title: "Run EspDesktop actions from Home Assistant"
description: "Connect an EspDesktop display to Home Assistant, press saved cards from automations, and refresh the button list from the display’s web editor."
---

# Run EspDesktop actions from Home Assistant

The 4-inch Guition 4848S040 and 7-inch Guition JC1060P470 V3 can share their saved card actions as buttons through Home Assistant’s built-in ESPHome integration. Use firmware that shows **Home Assistant** under **System → Connectors** in the display’s web editor.

## Connect the display

1. In the display’s web editor, open **System → Connectors → Home Assistant**.
2. Turn on **Enable ESPHome API**. It starts off by default. The display restarts and keeps your saved cards.
3. In Home Assistant, open **Settings → Devices & services** and add the display under **Discovered**. If it doesn’t appear, choose **Add integration → ESPHome** and enter the display’s local address.
4. Complete the standard ESPHome setup. Compatible Home Assistant versions generate the encryption key automatically. This connection uses the existing ESPHome integration and needs no separate EspDesktop pairing in Home Assistant.

## Press a card from Home Assistant

On the ESPHome device page, look under **Controls**. Saved apps, Finder folders, websites, keyboard shortcuts, Lock Machine cards, and subpages appear automatically, including actions on nested pages. A button’s name starts with its app or folder, for example **Safari – Close Tab**. Cards that only show information have no button.

To use a card in an automation, add the **Button: Press** action and select the card’s button as the target. You can also add the button to a dashboard.

Mac actions require an unlocked Mac with the [EspDesktop Mac app running and paired to the display](/screens/4848s040#pair-the-display). A keyboard shortcut on an app’s subpage opens or focuses that app first. If the Mac cannot confirm the app is frontmost, the shortcut is skipped.

## Turn the display on or off

Use **Display Power** under **Controls** on the ESPHome device page. Add it to a dashboard or select it in a **Switch: Turn on** or **Switch: Turn off** automation action. The switch also reflects when the panel's screensaver turns the backlight off.

Switching off keeps the screen dark until you switch it on again or restart the panel. Switching on wakes the screen using its saved brightness and screen schedule. You can wake the panel while the Mac sleeps. The Mac stays locked, and normal Mac-driven sleep resumes once the Mac wakes. First-time setup and alerts that need your attention can still light the screen.

## Refresh the button list

Home Assistant reads the latest button list when it reconnects. If a newly added card is missing or a name looks out of date, go to **System → Connectors → Home Assistant** in the display’s web editor and select **Resync buttons**. The display stays running while its ESPHome connection briefly reconnects. Reopen **Controls** in Home Assistant to see the refreshed list.

If a button still shows an old name, check its entity settings in Home Assistant for a custom **Name**. Clear it to show the name supplied by EspDesktop. Home Assistant 2026.11.1 can match renamed cards to their existing entities using the previous button list, including across a restart when that list has been saved. If you use an older Home Assistant version and rename a card while it’s offline, check the automations that use it. Moving a card or changing its action can also change its entity.

Turn off **Enable ESPHome API** in the web editor to disable remote presses.

To control Home Assistant devices from a touchscreen, see the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).
