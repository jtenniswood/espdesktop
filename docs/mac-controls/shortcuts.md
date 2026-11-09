---
title: Run Mac Keyboard Shortcuts
description: Create Companion cards from custom Mac keyboard combinations or app shortcut templates, and contribute templates for more apps.
---

# Run Mac Keyboard Shortcuts

A **Companion → Keyboard shortcut** card sends a chosen key combination to whichever Mac app is active when you tap it.

## Create a Shortcut Card

1. In the display setup page, add a **Companion → Keyboard shortcut** card.
2. Choose a type:
   - **Custom Shortcut**: expand the **Shortcut** panel, choose the modifiers, then choose a key. For Command-W, select **⌘ Command**, choose **W**, and save.
   - **Shortcut Catalog**: choose an app and one of its named shortcuts. The card starts with the template's label and icon; you can customise them in Card Settings.
3. Give the card a label and icon if needed, then save the display configuration.

A shortcut card replays keys in the active Mac app. Choosing an app in **Shortcut Catalog** does not launch it. Bring that app to the front before using the card. If the app has an enabled subpage, touching its app card opens that page immediately while asking the Mac to focus the app. The page also follows app focus changes reported by the Mac by default. In **Screen → Appearance → App Subpages**, turn off **Open app subpages on focus** to open subpages only by pressing an app card whose app is already active. Pressing an inactive app card focuses the app; press it again to open its subpage. This preference applies to all app subpages and is saved on the display.

An app subpage can open before its app finishes activating. Its app-specific keyboard shortcuts remain disabled until activation is confirmed, so they cannot act on the previous app.

Shortcuts must include Command, Control, or Option with a supported letter, number, function, navigation, or punctuation key. Shift is optional. Modifier-only combinations and unsupported system keys are rejected.

## Use a Template on an App Subpage

An approved **Companion → Applications** card can offer an **App Subpage** when the app has a matching shortcut definition. Turn on **Add app subpage** to start an editable page from that app's templates. Choose which shortcuts to include and arrange them in the order you want. Shortcut tiles start with a short action label and a matching icon. You can edit both on the card. Template updates apply to new cards and subpages. Existing cards keep the labels and icons saved in their layout.

The available list grows as app templates are added to EspDesktop. Existing examples include Safari, Slack, and Codex. App-specific subpages are described on [Launch Mac Apps and Open Websites](/mac-controls/apps#ready-made-app-subpages).

## Improve the Shortcut Catalog {#add-templates-for-another-app}

If a shortcut is missing or a preset needs correcting, see [Improve App Shortcuts](/mac-controls/improve-shortcuts) to suggest a change or contribute a template.

New shortcut icons need a display firmware version that includes them.

## Allow Accessibility Access

macOS requires Accessibility access so EspDesktop can replay keyboard input. In the Mac app, choose **Open Settings**, then enable EspDesktop in **System Settings → Privacy & Security → Accessibility**.
