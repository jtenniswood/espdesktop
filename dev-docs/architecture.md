# Architecture

The display owns the saved layout and renders it. The browser edits that layout
through the panel API. The Mac app owns permissions, approved apps and folders,
and the execution of Mac actions. The firmware and browser share generated
card and device definitions, and the display and Mac app share the Companion
protocol. See the [source of truth](source-of-truth.md) for the authored files
and their generated outputs.

## Main Source Areas

| Area | Path | Purpose |
|---|---|---|
| Product profiles | `product/v2/devices/` and `product/v2/device_catalog_shared.json` | Supported displays, reusable profiles, slot counts, layout, firmware substitutions, font roles, and public device facts. |
| Card metadata | `product/v2/cards/` and `product/v2/card_contract_shared.json` | Card IDs, defaults, fields, options, aliases, and subpage codes. |
| Entity names | `product/v2/entity_names.json` | Shared ESPHome setting names used by firmware and the setup page. |
| Icons | `product/v2/icons.json` and `common/assets/*glyphs.yaml` | Icon names, glyphs, and font glyph sets. |
| Firmware UI | `components/espdesktop/*.h` | LVGL card grid, card renderers, modals, and display navigation. |
| Configuration service | `components/espdesktop/configuration_service.*` and `configuration_store.*` | Atomic two-slot storage and generation-matched saves. Legacy text import lives behind a separate adapter. |
| Native panel document | `components/espdesktop/panel_config_document_v2.h` and `src/webserver/model/panel_config_v2.ts` | Bounded versioned layout shared by the browser and firmware. The configuration service validates it before activation. |
| Native configuration discovery | `components/espdesktop/panel_config_capabilities*.h` | `GET /api/v1/capabilities` advertises the native document, read/write API, and web-asset versions so the browser can select the compatible configuration path. |
| Mac Companion | `macos/EspDesktop/` and `components/companion/` | Native Mac app and the local panel-hosted Companion connection. |
| Web setup page | `src/webserver/` | Browser UI for configuring cards, settings, backup/restore, and previews. |
| Typed web state | `src/webserver/state/` | Device configuration and application state types, isolated state creation, direct module-owned state access, event aliases, and event parsing. Application state must not be published as a browser global. |
| Typed device API | `src/webserver/api/` | Injectable HTTP transport and ordered request queue; UI modules retain user-facing reactions. |
| Device config | `devices/<slug>/` | ESPHome entry points and per-device display/font/pin config. |
| Build scripts | `scripts/` | Generators, validators, smoke checks, and release helpers. |

## Generated Outputs

Do not hand-edit these unless the generator has been intentionally retired. The
full source-to-output ownership table lives in
[`source-of-truth.md`](source-of-truth.md).

- `common/config/entity_names.yaml`
- `src/webserver/generated/entity_catalog.ts`
- `src/webserver/generated/card_contract.ts`
- `components/espdesktop/button_grid_contract_generated.h`
- `components/espdesktop/i18n_generated.h`
- `docs/generated/cards/capabilities.md`
- `docs/generated/screens/*.md`
- `docs/public/device-profiles.json`
- `docs/public/webserver/www.js`
- `docs/public/webserver/web-assets.json`
- `docs/public/webserver/embedded/www.js`
- `docs/public/webserver/bundles/*/www.js`
- `docs/public/webserver/*/www.js`
- generated blocks inside `devices/*/packages.yaml`
- generated blocks inside `devices/*/device/sensors.yaml`

The central generator is:

```bash
python3 scripts/build.py
```

Use `python3 scripts/build.py --check` to check tracked generated source.
Use `python3 scripts/build.py www --check` to compare a staged editor with
its source. CI, local firmware builds and Pages generate the editor from the
checked-out revision. Release firmware and Pages use the verified release
artifact. Git retains the pinned compatibility bundles used as a fallback.

## Runtime Flow

1. ESPHome starts the display. Shared YAML wires up the screen and touch
   hardware, and the C++ firmware owns the card grid.
2. The panel serves its bundled browser editor. Older firmware can still load
   the hosted editor from `docs/public/webserver/<slug>/www.js`.
3. The editor discovers the panel capabilities, loads the versioned layout,
   and sends edits back with the generation it loaded.
4. The configuration service validates and atomically saves the document. The
   native runtime activates the new page store and schedules a refresh. The
   home grid and nested pages render from that active store.
5. The display sends Companion action requests over the paired local
   connection. The Mac app checks permissions before executing the action.

`EspDesktopAppCore` owns the long-lived configuration, card, Companion,
display lifecycle, navigation, and modal state. The LVGL layer owns the
widgets. Navigation and modal state have fixed memory budgets.

## Build-Time Flow

```text
product/v2/cards/* + card_contract_shared.json
  -> product/v2/card_contract.json
  -> src/webserver/generated/card_contract.ts
  -> components/espdesktop/button_grid_contract_generated.h
  -> docs/generated/cards/capabilities.md

product/v2/entity_names.json
  -> common/config/entity_names.yaml
  -> src/webserver/generated/entity_catalog.ts

product/v2/devices/* + device_catalog_shared.json
  -> product/v2/device_catalog.json
  -> devices/manifest.json

devices/manifest.json
  -> docs/public/device-profiles.json
  -> docs/generated/screens/*.md
  -> generated package and sensor blocks

src/webserver/**
  -> docs/public/webserver/www.js
  -> docs/public/webserver/web-assets.json
  -> docs/public/webserver/embedded/www.js
  -> docs/public/webserver/bundles/<sha256>/www.js
  -> docs/public/webserver/<slug>/www.js
```

## Public Docs Boundary

The public docs site is built from `docs/` with `vitepress build docs`.

This `dev-docs/` folder is intentionally outside that tree. It can be linked from
root-level contributor material if needed, but should not be added to the
VitePress sidebar unless the publication decision changes.
