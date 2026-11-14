---
title: "Home Assistant and EspDesktop"
description: "Press shared EspDesktop cards from Home Assistant and learn how retired controls behave."
---

# Home Assistant and EspDesktop

The previous Home Assistant controls are retired. EspDesktop lets Home Assistant press shared cards through its built-in ESPHome integration.

For Mac controls, follow [Mac app setup](/screens/4848s040#install-and-pair-the-espdesktop-mac-app).

For Home Assistant touchscreen controls, use the [EspControl documentation](https://jtenniswood.github.io/espcontrol/).

## Press EspDesktop cards from Home Assistant

On 4-inch Guition 4848S040 firmware that supports card exposure, Home Assistant
can press cards you choose to share.

1. In the display's web editor, open **System → Home Assistant** and switch
   on **Enable ESPHome API**. It starts off. The display restarts when
   you change this setting, and your shared card selections are retained.
2. In Home Assistant, open **Settings → Devices & services** and add your
   display under **Discovered**. If discovery is unavailable, use **Add
   integration → ESPHome** and enter its local address.
3. Finish standard ESPHome setup. Compatible Home Assistant versions
   generate the native encryption key automatically.
4. In the display's **Layout** editor, edit an app, Finder folder, website, shortcut,
   Lock Machine, or Subpage card. Enable **Expose to Home Assistant** and save.
   Saved cards in nested pages work too.
5. In Home Assistant, add the button to a dashboard or use **Button: Press**
   as an action in an automation. The card list refreshes when Home Assistant reconnects. Mac actions require an unlocked Mac with EspDesktop running and paired.

Renaming, resizing, or moving a shared card preserves its automation. Copying a
card starts with exposure disabled. Turning exposure off blocks remote presses
immediately. Remove the display from the ESPHome integration to end the connection. Use a backup made before testing when returning to older firmware.
