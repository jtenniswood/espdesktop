# App shortcut files

Each `*.json` file defines one Mac application's keyboard shortcuts. `python3 scripts/build.py companion` discovers every file in this directory and generates the browser catalog and firmware lookup tables. Adding an app does not require app-specific TypeScript or C++ registration. These definitions are packaged into EspDesktop builds; they are not downloaded by a running display or installed by uploading a JSON file.

To add an app, copy an existing file such as `safari.json` to a short, descriptive filename, then update its app identity, label, and shortcuts. Keep each app in its own file.

## Match the exact Mac app

`appId` must be the app's exact macOS bundle identifier (`CFBundleIdentifier`). The Mac Companion catalog uses this identifier when it lists approved apps. Matching is by this identifier, not by the `.app` filename or the visible name, so two apps with the same display name can still have separate definitions.

To look up an app's bundle identifier, replace the example path with the app's actual location and run this in Terminal:

```sh
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
  "/Applications/Your App.app/Contents/Info.plist"
```

Copy the returned value exactly into `appId`. Set `label` to the name users see in the Companion app list; it is a friendly label and does not control matching. If the app is not in `/Applications`, use its actual `.app` path.

For example, Safari's bundle identifier is `com.apple.Safari`. A definition with that `appId` applies to the Safari app, even if the JSON file has a different filename. The app must be approved in the Mac Companion app to use its Applications card and app subpage.

## File format

```json
{
  "version": 1,
  "appId": "org.example.Editor",
  "label": "Example Editor",
  "catalog": true,
  "shortcuts": [
    {
      "id": "0",
      "label": "New Document",
      "shortcut": "command+n",
      "icon": "Plus"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `version` | File format version; currently `1`. |
| `appId` | Unique Mac bundle identifier, at most 96 bytes. |
| `label` | App name shown in the editor and on unlabelled app subpages, at most 48 bytes. |
| `catalog` | `true` includes this app in the standalone **Shortcut Catalog** picker. `false` keeps its presets available to matching app subpages only. |
| `shortcuts` | Between 1 and 64 entries, in the desired display order. Existing subpage capacity checks still apply. |
| Shortcut `id` | Permanent numeric string from `"0"` to `"999"`, unique within the app. This is an identity, not a position in the list. |
| Shortcut `label` | Short card name, at most 48 bytes. |
| Shortcut `shortcut` | Modifier/key combination, without the `shortcut.` prefix. |
| Shortcut `icon` | Exact icon name from `product/v2/icons.json`, such as `Plus` or `Chevron Left`. |

Every valid app file supplies templates for the matching **Applications → App subpage**. The `catalog` flag controls only whether those same templates can be selected as standalone **Companion → Keyboard shortcut** cards. For example, the current Safari file is in the standalone catalog; Codex and Slack are currently subpage-only.

## Stable shortcut IDs

Keep an existing shortcut's `id` when renaming it or moving it in the file. Give each new shortcut an unused ID; gaps are fine. Never reuse a removed ID for a different action. The Safari, Codex, and Slack IDs were kept when their earlier definitions were imported into this format.

Changing a definition does not overwrite existing saved card key combinations, labels, or icons. Removing a definition leaves saved cards usable as custom shortcuts. Saved subpages keep each user's chosen order and edited cards. Review removals carefully because those entries will no longer be selectable as presets.

## Supported keys

Use lowercase modifiers `command`, `control`, `option`, and `shift`, joined with `+`, followed by one key. Include at least Command, Control, or Option; do not repeat a modifier. For example: `command+shift+t` or `control+tab`.

Supported keys:

- Letters `a`–`z`, digits `0`–`9`, and `f1`–`f20`.
- `space`, `enter`, `tab`, `escape`, `delete`, `forwarddelete`.
- `left`, `right`, `up`, `down`, `home`, `end`, `pageup`, `pagedown`.
- `keycomma`, `keyperiod`, `keyslash`, `keysemicolon`, `keyquote`, `keybackslash`, `keyminus`, `keyequal`, `keybracketleft`, `keybracketright`, `keybackquote`.

Shortcuts replay keyboard input in the active Mac app. A catalog entry does not launch its app or run a shell command. Verify the combination in the target application and note any keyboard-layout or app-version requirements in the contribution's PR.

## Submit a template through a PR

1. Add one JSON file to `product/v2/app_shortcuts/`, using the format above. Choose `catalog: true` for standalone card choices, or `false` if the shortcuts should appear only on that app's subpage.
2. Use the exact bundle identifier and existing icon names. Keep existing numeric shortcut IDs stable.
3. From the repository root, generate and check the shared outputs:

   ```sh
   python3 scripts/build.py companion icons www
   python3 scripts/build.py --check
   python3 scripts/check_app_shortcuts.py
   npm run check:types
   npm run test:web-unit
   ```

4. Include the new JSON file and generated outputs in the PR. In the PR description, name the app/version and macOS version, identify the bundle ID, and say which combinations you confirmed in the app.

CI checks the file format and generated output. After the PR is reviewed and merged, the normal Companion and web asset build automatically discovers the new file and packages its templates. No one needs to edit an app registration list. The catalog is build-time data rather than a live download, so the new template reaches users with the next build or release that includes it; an open or unmerged PR is not installed on displays.

Do not edit `src/webserver/generated/app_shortcuts.ts` or `components/espdesktop/app_shortcuts_generated.h` directly. If adding a new icon, add its pinned definition to `product/v2/icons.json` and its gallery group in `docs/.vitepress/theme/components/IconGallery.vue` before building, then run `python3 scripts/check_product_snapshot.py --update`. Choosing an existing icon avoids these extra steps.

Test on a supported display with matching firmware and web assets: select the app and shortcut, save and reload, check its name/icon, and tap the card with the intended Mac app at the front. Also test its app subpage and existing saved shortcuts. Automated validation does not establish that a shortcut performs the intended action in the application.
