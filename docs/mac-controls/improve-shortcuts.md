---
title: Improve App Shortcuts
description: Add a shortcut to your own app page, suggest a change to the shared Shortcut Catalog, or contribute an app template.
---

# Improve App Shortcuts

You can add a shortcut to your own display right away, suggest a change to an existing template, or request a shortcut list for another Mac app.

## Add a Shortcut to Your Display

1. Open the app on your Mac and try the key combination there first.
2. In the display’s web editor, open the app card’s **Edit Subpage** view if you want the shortcut on that app’s page. You can also add it to the home screen or a regular [subpage](/features/subpages).
3. In an empty tile, choose **Companion → Keyboard shortcut → Custom Shortcut**. Set the keys and give the card a short label that describes the action.
4. Save the configuration. Bring the app to the front and tap the card to check that it performs the intended action.

To change a shortcut you’ve already added, open its card settings. Choose **Custom Shortcut** if you want to edit the keys from a catalog preset. See [Run Mac Keyboard Shortcuts](/mac-controls/shortcuts) for supported keys and Accessibility setup.

## Suggest an Addition or Correction

For each shortcut, include the app name, the action or menu item, and the exact Mac keys you tested. If you’re correcting a preset, name the existing card and describe what should change. Include the app version and keyboard layout if they affect the shortcut.

For example, a request for Safari could suggest **Reopen Last Closed Tab** with **Shift–Command–T**. See [Apple’s Safari shortcut reference](https://support.apple.com/en-gb/guide/safari/cpsh003/mac).

[Request an app shortcut on GitHub](https://github.com/jtenniswood/espdesktop/issues/new?title=App%20shortcut%20request&body=App%20name%20and%20version%3A%0A%0AShortcut%20to%20add%20or%20improve%3A%0A-%20Action%20or%20menu%20item%3A%0A-%20Mac%20key%20combination%3A%0A-%20Suggested%20card%20label%3A%0A%0AKeyboard%20layout%20or%20settings%20required%20%28if%20applicable%29%3A%0A)

You’ll need a GitHub account to submit the request.

## Contribute a Template

1. Edit the app’s existing template in the [app shortcut templates folder](https://github.com/jtenniswood/espdesktop/tree/main/product/v2/app_shortcuts). For a new app, start with the example and use its exact macOS bundle identifier to match the installed app.
2. Keep existing shortcut IDs when correcting labels or keys, and use a new ID for each new shortcut. Choose an icon already in EspDesktop.
3. Update the catalogue version, add new template files to the manifest, and run the [generation and validation steps](https://github.com/jtenniswood/espdesktop/blob/main/product/v2/app_shortcuts/README.md#validate-and-generate). Open a pull request with the template, manifest and generated outputs.

The Mac app checks for shared catalogue updates when it launches or reconnects to the display. Updated templates affect new shortcut choices and app page defaults. Cards and app pages you’ve already saved keep their own settings.
