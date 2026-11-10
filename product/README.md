# Product Source Map

The individual card and device definitions in [`v2/`](v2/) are the source of
truth. [`model_v2.json`](model_v2.json) lists them in the order used by firmware,
the editor, and documentation. Keep existing card IDs and device slugs when
changing a definition.

- `v2/cards/<type>.json` owns card defaults, supported fields, and normalisation.
- `v2/card_contract_shared.json` owns cross-card rules, runtime registration,
  aliases, and compact codes.
- `v2/devices/<slug>.json` owns device-specific settings and profile selections.
- `v2/device_catalog_shared.json` owns reusable hardware and display profiles.
- `v2/entity_names.json`, `v2/icons.json`, and `v2/companion_capabilities.json`
  own their shared names, icons, and Companion protocol respectively.
- `v2/product_compatibility.json` owns compatibility fixtures for saved layouts
  and backups.

Build with `python3 scripts/build.py`. To regenerate just the two aggregate
catalogues, use `python3 scripts/check_product_model_v2.py --update`. The
[Source of Truth Contract](../dev-docs/source-of-truth.md) lists downstream
outputs and checks.

## Firmware translations

`v2/translations/strings.en.txt` defines firmware display strings; every language
file must contain the same keys. Keys starting with `label_` are available only
through `espdesktop_i18n_key(...)`: they are excluded from English-text lookup
so a matching Home Assistant name or option is not translated as a card label.
The firmware recognizes editor-generated English defaults for Wi-Fi sharing,
preset subpage categories and alarm actions in their corresponding card context;
other custom labels remain unchanged.

## Generated Outputs

Do not hand-edit generated sections or files. Rebuild them with
`python3 scripts/build.py`, `python3 scripts/generate_device_slots.py`, or
`python3 scripts/check_product_snapshot.py --update`.

- `v2/card_contract.json`
- `v2/device_catalog.json`
- `common/config/entity_names.yaml`
- `devices/manifest.json`
- `src/webserver/generated/entity_catalog.ts`
- `src/webserver/generated/card_contract.ts`
- `components/espdesktop/button_grid_contract_generated.h`
- `docs/generated/cards/capabilities.md`
- `docs/generated/screens/*.md`
- `docs/public/device-profiles.json`
- `docs/public/webserver/*/www.js`
- generated blocks inside `devices/*/packages.yaml`
- generated blocks inside `devices/*/device/sensors.yaml`
- `product/product_snapshot.json`
- `src/webserver/generated/companion_capabilities.ts`
- `components/espdesktop/companion_capabilities_generated.h`
- `macos/EspDesktop/Sources/Companion/CompanionCapabilities.generated.swift`
- `product/generated/companion_manifest.json`

## Checks

Run `npm run check:product` after changing authored product sources. Run
`npm run check:product-model-v2` when changing the ownership adapter, and
`npm run check:product-snapshot` when the combined product snapshot changes.
Run `npm run check:fast` before committing broader changes.
Run `npm run check:companion-contract` after any Companion protocol, pairing,
capability, or generated-contract change.
