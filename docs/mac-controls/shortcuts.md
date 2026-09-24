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

A shortcut card replays keys in the active Mac app. Choosing an app in **Shortcut Catalog** does not launch it. Bring that app to the front before using the card. When using an app subpage with **Auto switch to subpage**, EspDesktop waits for the Mac to confirm that the selected app is active before opening the page.

Shortcuts must include Command, Control, or Option with a supported letter, number, function, navigation, or punctuation key. Shift is optional. Modifier-only combinations and unsupported system keys are rejected.

## Use a Template on an App Subpage

An approved **Companion → Applications** card can offer an **App Subpage** when the app has a matching shortcut definition. Turn on **Add app subpage** to start an editable page from that app's templates. Choose which shortcuts to include and arrange them in the order you want. These are the same definitions used by the standalone Shortcut Catalog.

The available list grows as app templates are added to EspDesktop. Existing examples include Safari, Slack, and Codex. App-specific subpages are described on [Launch Mac Apps and Open Websites](/mac-controls/apps#ready-made-app-subpages).

## Add Templates for Another App

Anyone can contribute a template for an app that is not in the catalog. The matching key is the app's **bundle identifier**, not its display name or `.app` filename. To look it up, replace the example path with the actual location of the app and run this command in Terminal:

```sh
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
  "/Applications/Your App.app/Contents/Info.plist"
```

Use the returned value exactly as `appId` in the app's JSON file. The `label` field is the friendly name shown in EspDesktop. For example, the Safari definition uses `appId` `com.apple.Safari`; that exact identifier is how its shortcuts are matched to Safari. The Mac app must approve the app before its Applications card and subpage can be used.

To add a template:

1. Copy an app file from the [`product/v2/app_shortcuts` folder](https://github.com/jtenniswood/espdesktop/tree/main/product/v2/app_shortcuts) and add a new `app-name.json` file there.
2. Set `appId`, `label`, `catalog`, and the shortcut entries. Set `catalog` to `true` to make the shortcuts available as standalone cards. Set it to `false` to offer them on that app's subpage only. All app definitions can supply matching app subpages.
3. Use permanent numeric IDs, supported key names, and existing icon names. Verify each key combination in the target app.
4. Open a pull request with the JSON file and generated outputs. The [contributor format and checks](https://github.com/jtenniswood/espdesktop/blob/main/product/v2/app_shortcuts/README.md) explain the details.

The build automatically discovers every JSON file in the folder. After the PR is reviewed and merged, later builds and releases include the new templates; there is no separate app registration step. Templates are packaged with EspDesktop rather than downloaded live from GitHub.

## Allow Accessibility Access

macOS requires Accessibility access so EspDesktop can replay keyboard input. In the Mac app, choose **Open Settings**, then enable EspDesktop in **System Settings → Privacy & Security → Accessibility**.

For the currently active window, see [Window controls](/mac-controls/windows).
