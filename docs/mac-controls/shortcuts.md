---
title: Run Mac Keyboard Shortcuts
description: Create Companion cards from custom Mac keyboard combinations or built-in app shortcut templates.
---

# Run Mac Keyboard Shortcuts

A **Companion → Key Shortcut** card sends a chosen key combination to whichever Mac app is active when you tap it.

## Create a Shortcut Card

Try the key combination in the intended Mac app first.

1. In the display setup page, add a **Companion → Key Shortcut** card.
2. Choose a type:
   - **Custom Shortcut**: expand the **Shortcut** panel, choose the modifiers, then choose a key. For Command-W, select **⌘ Command**, choose **W**, and save.
   - **Shortcut Catalog**: choose an app and one of its named shortcuts. The card starts with the template's label and icon; you can customise them in Card Settings.
3. Give the card a label and icon if needed, then save the display configuration.

To edit the keys from a catalog preset, open its card settings and choose **Custom Shortcut**.

A shortcut card replays keys in the active Mac app. Choosing an app in **Shortcut Catalog** does not launch it. Bring that app to the front before using the card. If the app has an enabled subpage, touching its app card opens that page immediately while asking the Mac to focus the app. The page also follows app focus changes reported by the Mac by default. In **Screen → Appearance → App Subpages**, turn off **Open app subpages on focus** to open subpages only by pressing an app card whose app is already active. Pressing an inactive app card focuses the app; press it again to open its subpage. This preference applies to all app subpages and is saved on the display.

An app subpage can open before its app finishes activating. Its app-specific keyboard shortcuts remain disabled until activation is confirmed, so they cannot act on the previous app. The browser preview dims the same tiles when the app loses focus or the Mac disconnects. You can still edit and rearrange the tiles.

Custom shortcuts must include Command, Control, or Option with a supported letter, number, function, navigation, or punctuation key. Shift is optional. Modifier-only combinations and unsupported system keys are rejected.

## Use a Template on an App Subpage

An approved **Companion → Applications** card can offer an **App Subpage** when the app has a matching shortcut definition. Turn on **Add app subpage** to start an editable page from that app's templates. Choose which shortcuts to include and arrange them in the order you want. Shortcut tiles start with a short action label and a matching icon. You can edit both on the card. Template updates apply to new cards and subpages. Existing cards keep the labels and icons saved in their layout.

Safari and websites installed using Safari's **Add to Dock** each offer an app subpage. Installed sites appear under their own app names in Companion. Their presets include **Copy Link** and **Toggle Toolbar**. The **Next Field** and **Escape** presets require updated display firmware and Mac Companion, and run while Safari or an installed Safari web app is active. Use **Escape** to leave Reader or full screen where Safari supports it.

The **Athena** app subpage adds shortcuts for chat, search, the sidebar and conversation actions. Install Athena using Safari’s **Add to Dock**, then use matching versions of EspDesktop and the display firmware. The presets use Athena’s default Mac bindings. If you changed a binding in Athena, edit the matching tile to send your chosen keys.

The **Claude Desktop** subpage includes presets for the **Code** tab, including numbered environments, sessions and menu items. Use the menu item tiles with a numbered composer menu open. The plain key presets, **Previous Area** and **Rewind Session** require updated display firmware and Mac Companion.

The **Books** app subpage offers shortcuts for reading, library management and audiobooks. Page turns, full screen and audiobook play/pause require updated display firmware and a matching version of the Mac Companion.

The **ChatGPT Desktop** subpage includes chat and tab navigation, numbered chat shortcuts, and controls for the workspace and built-in browser. Some controls depend on the active mode or view. Use updated display firmware and Mac Companion to see the full list, including **Clear Unreads**.

The available list grows as app templates are added to EspDesktop. For example, the **Figma** app subpage includes presets for arranging layers, copying properties, and working with components and auto layout. App-specific subpages are described on [Launch Mac Apps and Open Websites](/mac-controls/apps#ready-made-app-subpages).

## Improve the Shortcut Catalog {#add-templates-for-another-app}

If a shortcut is missing or a preset needs correcting, see [Contribute App Shortcuts](/mac-controls/improve-shortcuts) to suggest a change or contribute a template.

New shortcut icons need a display firmware version that includes them.

## Allow Accessibility Access

macOS requires Accessibility access so EspDesktop can replay keyboard input. In the Mac app, choose **Open Settings**, then enable EspDesktop in **System Settings → Privacy & Security → Accessibility**.
