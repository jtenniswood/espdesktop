# Web App templates

Each JSON file defines one Web App card type: the address launched by the card, the host and optional path prefix used for browser-tab focus matching, a GitHub-hosted display icon, and keyboard shortcuts for that site's shortcut subpage.

```json
{
  "version": 1,
  "id": "example-service",
  "label": "Example Service",
  "url": "https://example.com/",
  "matchHost": "example.com",
  "matchPath": "/workspace",
  "icon": "https://raw.githubusercontent.com/jtenniswood/espdesktop/main/product/v2/web_apps/icons/example-service.png",
  "shortcuts": [
    { "id": "0", "label": "New document", "shortcut": "command+n", "icon": "Plus" }
  ]
}
```

`matchHost` must match the launch URL host. If `matchPath` is omitted, every path on that host matches. If set, it matches that path and its subpaths. Query strings and fragments do not affect matching. The active browser address is read locally by the Mac Companion; only IDs for matching configured cards are sent to the display. Safari and Google Chrome are supported for focus detection. Web App cards open through the Mac's default browser.

`icon` must point to a file committed under `product/v2/web_apps/icons/`. The display downloads that hosted image for the card. Keep icons reasonably small and use PNG or JPEG.

`manifest.json` lists every template JSON file in this directory. Increment its `catalogueVersion` when changing templates. Connected Mac Companion installations fetch both the manifest and each listed template on launch and reconnect. A failed or invalid refresh leaves that catalogue's previous valid definitions in place; the release-bundled Google Docs template is the first-launch offline starter.

To add a Web App, add its icon and JSON template, list the JSON filename in `manifest.json`, then run:

```sh
python3 scripts/build.py companion icons www
python3 scripts/build.py --check
python3 scripts/check_app_shortcuts.py
npm run check:types
npm run test:web-unit
```

The generator validates the template, supported shortcut key names, icon path, and manifest. Template and icon changes merged to GitHub can reach users without a Mac app release.
