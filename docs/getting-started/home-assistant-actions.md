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
can press saved cards that have a tap action.

1. In the display's web editor, open **Connectors → Home Assistant** and switch
   on **Enable ESPHome API**. It starts off. The display restarts when
   you change this setting, and your saved cards are retained.
2. In Home Assistant, open **Settings → Devices & services** and add your
   display under **Discovered**. If discovery is unavailable, use **Add
   integration → ESPHome** and enter its local address.
3. Finish standard ESPHome setup. Compatible Home Assistant versions
   generate the native encryption key automatically.
4. Open the display in Home Assistant to find its buttons. Saved app, Finder folder,
   website, shortcut, Lock Machine, and Subpage cards appear automatically,
   including cards on nested pages. Button names start with the app or folder
   that contains the action, for example **Safari – Close Tab**.
5. In Home Assistant, add the button to a dashboard or use **Button: Press**
   as an action in an automation. The card list refreshes when Home Assistant reconnects. Mac actions require an unlocked Mac with EspDesktop running and paired.

Resizing a card keeps its button identity. Home Assistant can track a rename
while connected. After renaming a card with Home Assistant stopped, check any
automations that use it. Moving a card to another page or changing its action
can also give it a new button identity. Turning off **Enable ESPHome API** disables all remote presses.
