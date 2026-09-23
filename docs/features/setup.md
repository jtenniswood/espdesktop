---
title: Configure Your Mac Control Surface
description: Add Mac Companion cards, arrange them into pages, and customise the EspDesktop touchscreen from its built-in web editor.
---

# Configure Your Mac Control Surface

After pairing the Mac app, open the display's address in a browser and use its built-in editor to add cards and organise your controls. The Mac app supplies the actions; the display editor determines where those controls appear.

## Add a Mac Control

1. Open the **Screen** tab in the display's web page.
2. Select an empty tile and choose **Companion**.
3. Choose a control type, such as **Applications**, **Keyboard shortcut**, **Open folder**, **Open URL**, **Window control**, or **Stats**.
4. Set the options and choose **Apply Configuration** to save the layout.

Apps and folders must first be approved in the Mac app. Keyboard shortcuts and window controls need Accessibility permission. See [Mac Controls](/card-types/companion) for the available actions and requirements.

## Arrange and Personalise Cards

- Drag cards to move them. Dropping one onto an occupied tile shifts that card to the next available space.
- Right-click a card and choose **Size** to make it wider or taller.
- Change a card's icon, label, and colour in its settings.
- Create [subpages](/features/subpages) to group related Mac controls or keep an app's shortcuts together.
- Right-click a card and use **Copy Code** and **Paste Code** to reuse a layout on another display.

The display preview shows the saved arrangement. Choose **Apply Configuration** after editing to send it to the touchscreen.

## Back Up Your Layout

Use the setup page's backup controls to save a copy of the display configuration before making major changes. Keep the backup file private if it contains web addresses or other personal configuration.

The **Connectors** tab provides setup and status for Mac Companion. Home Assistant support is off by default.

> **Unsupported feature:** This Home Assistant opt-in is provided for experimentation only. It is not supported and may be removed at any time.

To opt in on a display, add this setting under its `espdesktop:` section in the ESPHome YAML, then install the updated firmware:

```yaml
espdesktop:
  home_assistant_support: true
```

When enabled, the Connectors tab offers Home Assistant setup and the editor can add Home Assistant-backed cards. With the setting omitted or set to `false`, Home Assistant setup and new Home Assistant controls stay hidden, including when the display was previously connected.

For Home Assistant setup and panel features, see [EspControl docs](https://jtenniswood.github.io/espcontrol/).
