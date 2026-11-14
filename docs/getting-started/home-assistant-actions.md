---
title: "Home Assistant and EspDesktop"
description: "Press shared EspDesktop cards from Home Assistant and learn how retired controls behave."
---

# Home Assistant and EspDesktop

The previous Home Assistant controls are retired. EspDesktop uses a local integration to let Home Assistant press shared EspDesktop cards.

For Mac controls, follow [Mac app setup](/screens/4848s040#install-and-pair-the-espdesktop-mac-app).

For Home Assistant touchscreen controls, use the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).

## Press EspDesktop cards from Home Assistant

On 4-inch Guition 4848S040 firmware that supports card exposure, Home Assistant
can press cards you choose to share. This uses the EspDesktop custom integration
and the display's secure local connection.

1. Copy the repository's `custom_components/espdesktop` folder into the
   `custom_components` directory in your Home Assistant configuration and restart
   Home Assistant.
2. Wake and unlock the display. Open its web editor, go to **System → Home
   Assistant**, and select **Pair Home Assistant**.
3. In Home Assistant, select the discovered EspDesktop display or add
   **EspDesktop** under **Settings → Devices & services**. Enter the display's
   address if prompted. Enter the certificate fingerprint and pairing code shown
   on the touchscreen.
4. In the display's Layout editor, edit an app, Finder folder, website, shortcut,
   Lock Machine, or Subpage card. Enable **Expose to Home Assistant** and save.
   Saved cards in nested pages work too.
5. In Home Assistant, add the button to a dashboard or use **Button: Press**
   as an action in an automation. Allow up to 15 seconds for the card list to
   refresh. Mac actions require an unlocked Mac with EspDesktop running and paired.

Renaming, resizing, or moving a shared card preserves its automation. Copying a
card starts with exposure disabled. Turning exposure off blocks remote presses
immediately. **Disconnect** in the display editor revokes Home Assistant's
credential. Use a backup made before testing when returning to older firmware.
