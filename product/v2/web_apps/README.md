# Web App catalogues

A Web App template defines the display card label and icon, the URL launched on the Mac, the browser-tab URL matching rules, and the keyboard shortcuts shown on its optional shortcut subpage.

The Mac Companion downloads the Web App manifest and its listed templates from GitHub at launch and reconnect. It sends definitions to the paired display over the Companion connection; the display does not contact GitHub itself. The Mac bundles a starter copy for offline use, and the display firmware also keeps generated starter metadata. Changes merged to GitHub reach existing Companion installations without a Mac app release.

## Add or update a Web App

1. Copy [`examples/example-service.json`](examples/example-service.json) to a new top-level JSON file in this folder. Files in `examples/` are documentation references, not live catalogue entries. The sample points to the existing Google Docs icon only to demonstrate a real hosted icon URL; replace it with the new service's icon.
2. Add the Web App's icon under `icons/`. Use a PNG or JPEG that is reasonably small for the display.
3. Change the example's `id`, `label`, `url`, `matchHost`, `matchPath`, and `icon` to match the service. The `icon` field must be a raw GitHub URL pointing to the committed image under `product/v2/web_apps/icons/`, on the `main` branch. Example format:

   ```text
   https://raw.githubusercontent.com/jtenniswood/espdesktop/main/product/v2/web_apps/icons/your-app.png
   ```

4. Add shortcuts that you have confirmed in the target service. Use stable numeric string IDs and supported icon names.
5. Add the template filename to `manifest.json` and increment `catalogueVersion` when a template or manifest changes. Keep `formatVersion` at `1` unless the manifest structure changes. Raise `minimumCompanionVersion` only if a newer Companion reader is required.
6. Run the validation and generation commands below, then submit the JSON template, icon, manifest, and generated outputs together in a PR.

The manifest must list every top-level template JSON file in this folder exactly once. Keep examples in `examples/` so they are not published as active Web Apps.

## Template fields

```json
{
  "version": 1,
  "id": "example-service",
  "label": "Example Service",
  "url": "https://example.com/workspace/",
  "matchHost": "example.com",
  "matchPath": "/workspace",
  "icon": "https://raw.githubusercontent.com/jtenniswood/espdesktop/main/product/v2/web_apps/icons/example-service.png",
  "shortcuts": [
    { "id": "0", "label": "New item", "shortcut": "command+n", "icon": "Plus" }
  ]
}
```

- `id`: lowercase, hyphenated identifier. The display card entity is `webapp.<id>`.
- `url`: HTTPS address the card opens in the Mac's default browser.
- `matchHost`: lowercase host name from `url`, without a scheme or path.
- `matchPath`: optional path prefix. When omitted, any path on that host matches. When set, it matches that path and its subpaths. Query strings and fragments do not affect a match.
- `icon`: GitHub-hosted PNG or JPEG shown on the display card. The Mac validates that it is under this repository's Web App icon directory.
- `shortcuts`: 1–64 entries using the same stable ID, key-combination, and icon rules as native app templates.

The Mac reads the focused tab URL locally from Safari or Google Chrome. It sends the display only IDs for configured Web App and URL cards that match. If tab access is unavailable, the active-tab matches clear and the user can still open the card or its subpage manually. Web App cards open through the system-default browser.

## Validate and generate

```sh
python3 scripts/build.py companion icons www
python3 scripts/build.py --check
python3 scripts/check_app_shortcuts.py
npm run check:types
npm run test:web-unit
```

The checker validates the manifest, template fields, URL/host relationship, icon file and URL, and shortcuts. Do not edit `src/webserver/generated/web_apps.ts`, `components/espdesktop/web_apps_generated.h`, or the generated Mac resource copies directly. The current [`google-docs.json`](google-docs.json) and its icon are complete live examples.
