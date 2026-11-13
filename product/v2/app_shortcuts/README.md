# Native Mac app shortcut catalogues

This folder contains the editable templates used for native Mac app shortcuts. The Mac Companion reads `manifest.json` and its listed templates from the EspDesktop GitHub repository at launch and reconnect. It sends the validated definitions to the paired display, where the web configurator uses them to build app subpages and shortcut choices. The display does not fetch GitHub directly.

EspDesktop builds also bundle a starter copy for offline use. `python3 scripts/build.py companion` regenerates that starter copy and the browser/firmware lookup tables from the live catalogue files. Compatible template updates are fetched on launch or reconnect. Expanded presets require a display and Companion build with expanded shortcut support.

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
- `catalog`: retained for older editors, where `true` enables the standalone **Shortcut Catalog** picker. The **Application** tab in current editors lists all available templates.
- `shortcuts`: 1–64 items. IDs are permanent numeric strings from `"0"` to `"999"`; keep an ID when renaming or reordering a shortcut, and never reuse a removed ID.
- Use a short action label (up to 48 UTF-8 bytes) and put the key combination in the shortcut field.
- Each shortcut's `icon` must be a name from `product/v2/icons.json`. Choose a [Material Design Icon](https://pictogrammers.com/library/mdi/) that represents the action.

Supported shortcut strings use lowercase modifiers `command`, `control`, `option`, and `shift`, followed by a supported key, such as `command+shift+t` or `control+tab`. A shortcut sends keyboard input to the active Mac app; it does not launch an app or run a shell command. Check each binding in the named app and record any app-version or keyboard-layout requirements in the PR.

The Safari templates use `safariShortcuts` for unmodified Tab and Escape. Both lists share IDs and the 64-entry limit. Older Companion versions can still read the regular list. The `com.apple.Safari.WebApp` template applies to approved Safari web apps with a macOS-generated UUID suffix on their bundle ID.

Books also has an optional `extendedShortcuts` list for its Left Arrow, Right Arrow, Space and Fn–F presets. These entries require updated Companion and display firmware and only run when Books is active. Older Companion versions can still read the regular `shortcuts` list. Both lists share the same shortcut IDs and 64-entry limit.

The Claude Desktop starter supports up to 96 entries to include its numbered environment, session and menu choices. The optional `claudeShortcuts` list contains those extra choices and app-scoped keys such as Shift–F6 and double Escape. Both Claude lists share the same IDs and the same 12,000-byte catalogue limit. Older Companion versions read the regular list.

The ChatGPT Desktop subpage uses the `com.openai.codex` bundle ID and supports up to 96 starter presets with its optional `additionalShortcuts` list. IDs remain unique across both lists, and older Companion versions can read the regular list. Shift–Escape only runs while ChatGPT Desktop is active.

Athena uses a template identifier in the catalogue. Mac Companion matches the installed Safari web app by its web manifest name and sends the definition under the installation’s bundle ID. Athena shortcut IDs start at 100 so saved generic Safari web app presets keep their IDs.

Use `moreShortcuts` for additional presets. These are available in the shortcut picker and when editing an app subpage. They are not preselected on new subpages. Finder presets are offered only in the standalone picker. The expanded list shares permanent IDs with the starter and other lists and allows up to 900 entries per app.

- Use `scoped.` for app-specific commands, for example `scoped.space`, `scoped.shift+left` or `scoped.command+k~command+s`. Companion checks that the approved app is frontmost before sending each key. The separator `~` denotes a sequence of up to three strokes. Scoped keys also support `function` and distinct keypad keys, such as `keypad0` and `keypadenter`.
- Use the regular shortcut syntax for documented global hotkeys. The display sends those to macOS regardless of the frontmost app.
- Add a preset for each documented action and useful key alternative. Context-dependent actions can share the same keys. Avoid adding gestures, held keys, user-assigned shortcuts, or commands without a verified Mac binding.
- Preserve the starter list, especially existing IDs and the default order. Older Companion installations ignore the expanded field. New builds carry the additional choices in bounded pages for approved apps, with a bundled offline copy in the editor.

The templates were compared with the original macOS shortcut research and supplemented with [first-party references](research-sources.md). Spotlight is system-wide. Finder shortcuts are available in the standalone picker alongside its dedicated folder page. Terminal-only OpenCode and browser-only Onshape are outside these native templates.

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
