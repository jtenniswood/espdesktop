# App shortcut files

Each `*.json` file defines one Mac application's keyboard shortcuts. Files are discovered automatically when the project is built: adding an app requires no TypeScript or C++ registration. These files ship with the web editor and firmware; they are not files users upload to a running display.

To add an app, copy `safari.json` to a short, descriptive filename, change `appId` and `label`, and replace the shortcut entries. Use the application's actual Mac bundle identifier. Each file has this shape:

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

## Fields

| Field | Meaning |
| --- | --- |
| `version` | File format version; currently `1`. |
| `appId` | Unique Mac bundle identifier, at most 96 bytes. |
| `label` | App name shown in the editor and unlabelled app subpages, at most 48 bytes. |
| `catalog` | `true` shows the app in **Shortcut Catalog**. `false` keeps its presets available to app subpages only. Safari is currently the only catalog app; Codex and Slack retain their existing subpage support. |
| `shortcuts` | Between 1 and 64 entries, in the desired display order. Existing subpage capacity checks still apply. |
| Shortcut `id` | Permanent numeric string from `"0"` to `"999"`, unique within the app. This is an identity, not a position in the list. |
| Shortcut `label` | Short card name, at most 48 bytes. |
| Shortcut `shortcut` | Modifier/key combination, without the `shortcut.` prefix. |
| Shortcut `icon` | Exact icon name from `product/v2/icons.json`, such as `Plus` or `Chevron Left`. |

Every app file also supplies the presets for **Launch app → App subpage** once that app is approved in the Mac Companion app. `catalog` controls only visibility in the standalone shortcut catalog.

## Editing existing files

Keep an existing shortcut's `id` when renaming it or moving it in the file. Give each new shortcut an unused ID; gaps are fine. Never reuse a removed ID for a different action. The migrated Safari, Codex, and Slack IDs match their original saved identities.

Changing a definition does not overwrite existing saved card key combinations, labels, or icons. Removing a definition leaves saved cards usable as custom shortcuts. Saved subpages keep their user's chosen order and edited cards. Review removals carefully because those entries will no longer be selectable as presets.

## Supported keys

Use lowercase modifiers `command`, `control`, `option`, and `shift`, joined with `+`, followed by one key. Include at least Command, Control, or Option; do not repeat a modifier. For example: `command+shift+t` or `control+tab`.

Supported keys:

- Letters `a`–`z`, digits `0`–`9`, and `f1`–`f20`.
- `space`, `enter`, `tab`, `escape`, `delete`, `forwarddelete`.
- `left`, `right`, `up`, `down`, `home`, `end`, `pageup`, `pagedown`.
- `keycomma`, `keyperiod`, `keyslash`, `keysemicolon`, `keyquote`, `keybackslash`, `keyminus`, `keyequal`, `keybracketleft`, `keybracketright`, `keybackquote`.

Shortcuts replay keyboard input in the active Mac app. A catalog entry does not launch its app or run a shell command. Verify the combination in the target application and note any keyboard-layout or app-version requirements in the contribution's PR.

## Build and check

From the repository root, after installing the project's npm dependencies:

```sh
python3 scripts/build.py companion icons www
python3 scripts/build.py --check
python3 scripts/check_app_shortcuts.py
npm run check:types
npm run test:web-unit
```

The build validates every file, then generates the shared TypeScript definitions and firmware app/ID tables. Commit the JSON change and generated outputs together. Do not edit `src/webserver/generated/app_shortcuts.ts` or `components/espdesktop/app_shortcuts_generated.h` directly. If adding a new icon, add its pinned definition to `product/v2/icons.json` and its gallery group in `docs/.vitepress/theme/components/IconGallery.vue` before building, then run `python3 scripts/check_product_snapshot.py --update`. Choosing an existing icon avoids these extra steps.

Test on a supported display with matching firmware and web assets: select the app and shortcut, save and reload, check its name/icon, and tap the card with the intended Mac app at the front. Also test its app subpage and existing saved shortcuts. Automated validation does not establish that a shortcut performs the intended action in the application.
