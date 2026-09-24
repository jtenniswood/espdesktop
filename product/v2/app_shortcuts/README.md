# Native Mac app shortcut catalogues

This folder contains the editable templates used for native Mac app shortcuts. The Mac Companion reads `manifest.json` and its listed templates from the EspDesktop GitHub repository at launch and reconnect. It sends the validated definitions to the paired display, where the web configurator uses them to build app subpages and shortcut choices. The display does not fetch GitHub directly.

EspDesktop builds also bundle a starter copy for offline use. `python3 scripts/build.py companion` regenerates that starter copy and the browser/firmware lookup tables from the live catalogue files. A merged template update is fetched by existing Mac Companion installations without a new app release.

## Add or update a native app

1. Copy [`examples/example-editor.json`](examples/example-editor.json) to a new top-level JSON file in this folder. The examples directory is reference material and is not part of the live catalogue.
2. Set `appId` to the app's exact macOS bundle identifier (`CFBundleIdentifier`). For example, find it in Terminal with:

   ```sh
   /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
     "/Applications/Your App.app/Contents/Info.plist"
   ```

3. Add shortcuts in the order you want them shown. Use the field rules below and keep existing shortcut IDs stable.
4. Add the new template filename to `manifest.json` and increment `catalogueVersion` whenever a template or the manifest changes. Keep `formatVersion` at `1` unless the manifest structure changes. Raise `minimumCompanionVersion` only when the new data needs a newer Companion reader.
5. Run the validation and generation commands below, then submit the template, manifest, and generated outputs together in a PR.

The manifest must list every top-level template JSON file in this folder exactly once. Keep examples in the `examples/` subfolder; do not add them to the manifest.

## Template fields

```json
{
  "version": 1,
  "appId": "org.example.Editor",
  "label": "Example Editor",
  "catalog": true,
  "shortcuts": [
    { "id": "0", "label": "New Document", "shortcut": "command+n", "icon": "Plus" }
  ]
}
```

- `appId`: exact bundle ID, used to match the approved Mac app.
- `label`: app name shown in Companion; up to 48 bytes.
- `catalog`: set to `true` to include these shortcuts in the standalone **Shortcut Catalog** picker. Set to `false` to offer them only on that app's subpage.
- `shortcuts`: 1–64 items. IDs are permanent numeric strings from `"0"` to `"999"`; keep an ID when renaming or reordering a shortcut, and never reuse a removed ID.
- Each shortcut's `icon` must be a name from `product/v2/icons.json`.

Supported shortcut strings use lowercase modifiers `command`, `control`, `option`, and `shift`, followed by a supported key, such as `command+shift+t` or `control+tab`. A shortcut sends keyboard input to the active Mac app; it does not launch an app or run a shell command. Check each binding in the named app and record any app-version or keyboard-layout requirements in the PR.

The current live files are useful examples too: Safari is in the standalone catalog; Codex and Slack provide app-subpage presets only.

## Validate and generate

```sh
python3 scripts/build.py companion icons www
python3 scripts/build.py --check
python3 scripts/check_app_shortcuts.py
npm run check:types
npm run test:web-unit
```

Do not edit `src/webserver/generated/app_shortcuts.ts`, `components/espdesktop/app_shortcuts_generated.h`, or the generated Mac resource copies directly. If you add an icon name, first add it to `product/v2/icons.json` and its gallery group in `docs/.vitepress/theme/components/IconGallery.vue`, then run `python3 scripts/check_product_snapshot.py --update` and the generation commands above.

Existing user-saved shortcut cards and app subpages keep their own labels, key combinations, icons, and order. A template update changes new choices and generated defaults; it does not rewrite saved user layouts. Removing a template also leaves saved custom shortcuts usable.

For a test display, select the app and a shortcut, save and reload, check its name and icon, then tap it with the intended Mac app at the front. Also check the app subpage and existing saved shortcuts. Automated checks do not confirm that a binding performs the intended action in the target app.
