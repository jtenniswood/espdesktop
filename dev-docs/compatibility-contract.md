# Compatibility Contract

Treat these as product promises. Changes can still happen, but they need an
explicit migration path, compatibility fixture, release note, and rollback plan.

## Must Keep Working

| Surface | Promise | Protected by |
|---|---|---|
| Saved card strings | Existing `Button N Config` and subpage config strings keep parsing after firmware or web updates. | `npm run check:firmware-parser`, `npm run check:web-smoke`, `npm run check:backup-contract` |
| Backup import/export | Backups created by older supported releases import without users recreating layouts by hand. | `product/v2/product_compatibility.json`, `npm run check:backup-contract` |
| Card type names and aliases | Saved card `type` values keep their meaning, including hidden and legacy types. | `product/v2/card_contract.json`, `npm run check:card-contract-outputs` |
| Option values | Existing option keys and values either keep working or have a fallback parser. | `src/webserver/application/config_codec.ts`, `components/espdesktop/button_grid_config.h` |
| Device slugs | Published device slugs remain valid for firmware bundles, web bundles, docs, manifests, and release assets. | `devices/manifest.json`, `npm run check:device-profiles`, `npm run check:firmware-release` |
| Public firmware URLs | Installed panels can still find update manifests and OTA assets at the expected public paths. | `npm run check:firmware-release`, `npm run check:public-firmware-script` |
| Public web assets | Older firmware can still load `docs/public/webserver/<slug>/www.js`; the hosted bridge and `web-assets.json` select a compatible immutable bundle, while new build entrypoints include `embedded/www.js` as the offline fallback. | `python3 scripts/build.py www`, `npm run check:web-smoke`, `npm run check:web-asset-manifest` |
| Generated device YAML | Generated package and sensor blocks stay reproducible from manifest data. | `python3 scripts/generate_device_slots.py --check` |
| Home Assistant actions | Existing card controls keep calling the same Home Assistant services unless a migration is deliberate. | `npm run check:firmware-ha-bindings`, `npm run check:firmware-card-runtime` |

## Compatibility Rules

- Do not rename a saved card type without a migration alias.
- Do not reuse an old compact type code for a different meaning.
- Do not remove option parsing while existing configs can still contain that
  option.
- Do not make backup export produce a shape that backup import cannot read.
- Do not change a device slug, firmware manifest slug, release asset name, or
  public web bundle path without a compatibility plan.
- Do not require users to resave cards after updating unless the release notes
  clearly call out the migration.

### PanelConfig release lifecycle

`product/release_contract.json` and `configuration_release_policy.h` enable
native v2 writes and two navigation levels. This release explicitly selects
`panelConfigDowngradePolicy: current-release-only`: saving with it does not
maintain a mirror for older firmware. Older v1 documents and backups remain
readable/importable; downgrading requires a pre-upgrade backup and compatible
firmware. The release check validates this policy without inventing published
reader releases. Policies that promise an older reader floor still require the
published reader and consecutive dual-write release evidence.

The port from EspControl #2440 retains EspDesktop's card renderer and Companion
transport. A prepared PageStore feeds its existing live text bindings and the
additional page definitions together, while the complete v2 document remains
the durable source. Runtime text records are separate from saved wire records, so escaping text does not consume the saved-record byte budget. Legacy text values are a live rendering projection, not a
saved downgrade copy. The existing total card budget is retained; secondary
card placements and Back widgets also cannot exceed the old renderer's maximum
of one full secondary screen per home slot. Failed preparation does not replace
the saved graph. `companion_nested_pages.json` covers Folder → App → Shortcuts,
exact native bytes, subtree transfers and the current firmware requirement.

The grid reads home cards and nested pages directly from the active page
store. Activating a saved layout schedules one grid rebuild. In the current
release, the legacy adapter publishes only the grid order and accent colour
for the screen automations that still use text bindings. Card and subpage
text remain inputs for the one-time import.

## Required Migration Shape

Every compatibility-affecting change needs:

1. Old input example: compact card string, backup fixture, device slug, URL, or
   generated output being preserved.
2. New parser behavior: where the old shape is accepted and normalized.
3. Fixture or check: the command that proves the old shape still works.
4. Generated output review: which generated files are expected to change.
5. User-facing note: only when behavior or upgrade expectations change.

## Stop Conditions

Stop and redesign the change if:

- A fixture fails and the only fix is to tell users to recreate cards.
- Web import accepts a backup that firmware cannot render.
- Firmware renders a card differently from the web preview for the same saved
  config.
- A published device slug or release asset disappears from generated metadata.
- A generated output changed and no authored source explains why.
