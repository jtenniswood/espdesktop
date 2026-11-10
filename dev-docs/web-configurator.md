# Web Configurator

The web configurator is the browser setup page loaded from a device's web
server. It is written in TypeScript and built as one shared application bundle,
an embedded offline fallback, a hosted compatibility bridge and asset manifest,
plus small per-device loader files.

## Source Layout

| Path | Purpose |
|---|---|
| `src/webserver/entry.ts` | Composition root. It installs application modules and card registrations in one deliberate order. |
| `src/webserver/application/` | Shared state, rendering, API, backup, settings, preview, and codec modules. Each file exports an explicit installer. |
| `src/webserver/cards/` | Card-specific settings panels and previews. Each file exports an explicit registration function. |
| `src/webserver/model/*.ts` | Typed model sources. |
| `src/webserver/state/*.ts` | Typed device configuration, application state factory, event aliases, and event parsing. |
| `src/webserver/api/*.ts` | Injectable HTTP transport, ordered POST queue, typed request results, and failure classification. |
| `src/webserver/generated/*.ts` | Typed card metadata, entity catalogue, and icon data generated from their shared sources. |
| `src/webserver/testing/*.ts` | Browser test hooks, included only in test bundles. |
| `docs/public/webserver/<slug>/www.js` | Generated per-device compatibility loader for older hosted URLs. |
| `docs/public/webserver/embedded/www.js` | Generated offline editor included by current firmware build entry points. |
| `docs/public/webserver/bundles/<sha256>/www.js` | Generated immutable hosted application bundle selected through `web-assets.json`. |

`entry.ts` imports every application installer and card registration directly.
The visible call order is the runtime order; the build does not discover files,
sort filenames, concatenate source, or depend on import side effects.
All TypeScript and generated data are imported directly by the bundle build.
The application exposes one mutable state instance created by
`createInitialState(deviceConfig)`; tests create isolated instances from the
same factory.
Controllers keep responsibility for banners, reconnect scheduling, and UI
locking; the typed device API owns transport, fallback attempts, throttling,
keepalive requests, and JSON decoding.

## Build

Run `npm ci` from the repository root, then `npm run webserver:build` to
generate the editor. The generated editor, manifest and loaders are ignored
by Git. The repository retains pinned compatibility bundles for release
builds that cannot fetch their published predecessors.

The web generator writes `docs/public/webserver/<slug>/www.js` for each supported
device. The shared `docs/public/webserver/www.js` is a small hosted bridge: it
uses `web-assets.json` to select an immutable content-addressed editor for the
development build and the stable release/rollback versions declared by the
generator. The matching offline editor is written to
`docs/public/webserver/embedded/www.js`. The public Guition 4848S040 firmware
starts its embedded editor for both factory installs and OTA upgrades. Editor
changes reach that panel through firmware updates. Firmware configured with
the hosted bridge still starts its local fallback if the hosted editor cannot
load.

The configurator page itself is served by the device. New build entry points in
`builds/*.yaml` bundle the matching JavaScript with `web_server.js_include`, so
a flashed branch uses that branch's setup UI. The local ESPHome wrapper
builds the editor before compilation. The PR firmware check also publishes
factory and OTA binaries under the matching `pr-firmware-<slug>` artifact.
GitHub Pages publishes the hosted version at:

```text
https://jtenniswood.github.io/espdesktop/webserver/<slug>/www.js
```

The fallback hosted bundle URL is set as `js_url` in
`common/device/core_infra.yaml`. Keep that path stable for older installed
firmware and imported configs.

## Device API Shape

The editor discovers the panel's supported layout versions at
`GET /api/v1/capabilities`. It reads the saved binary document from
`GET /api/v1/config` and writes updates to that endpoint. A write includes the
last observed `ETag` in its `If-Match` header, so a second browser cannot
silently overwrite a newer save.

On current firmware, use the layout API to inspect a saved configuration.
The following request shows the document version and generation without
printing the layout contents.

```bash
curl --fail --silent --show-error --dump-header - --output /dev/null \
  --header 'X-Panel-Config-Version: 2' "http://<device-ip>/api/v1/config"
```

Older firmware exposes card layout through ESPHome text entities. Current
firmware still uses ESPHome entities for some screen settings, while card
layout saves and rendering use the native document.

### Mac app setup

Firmware that advertises `configuration.companion_auto_open_app_subpages`
applies the automatic switching preference from the native layout document.
The first-run wizard writes the home cards and shortcut pages directly to
the native layout and commits them with the preference and completion marker
in one generation-checked save. Setup Again reads the current layout and
stops if another editor changes the layout or preference before saving.
The Screen settings toggle edits that field through the same API. A layout without the field
retains the panel's previously saved preference. The switch publishes the
live value to the editor after the layout commit. Existing backups can supply
the preference through their portable settings.

### Reset and editing sessions

Reset-capable firmware advertises `reset.modes` in capabilities. Read
`GET /api/v1/reset` when opening an editing session and retain its `epoch` for
that session. Configuration POST/PUT requests require `X-EspDesktop-Epoch`;
after a reset, a stale or missing epoch is rejected with 409/428. Reload the
device state instead of refreshing the epoch and replaying old edits. Older
firmware returns 404 for reset discovery and keeps its existing write protocol.
Standard ESPHome control routes (such as `/light/.../turn_on` and
`/button/.../press`, plus operational switches such as the P4-86 relays) and the `/wifisave` and `/update` forms do not require an
epoch. Configuration routes, including text, number, select and switch
settings, still require it. Switches marked as configuration or diagnostic
entities remain protected; unknown switch routes are not exempt. A supplied stale epoch is rejected on every route,
and all mutations are blocked while reset is pending. OTA transport status is
tracked per source, and the active native flash handle stays reserved until
ESP-IDF ends or aborts it. A rejected or failed overlapping OTA attempt cannot
release another writer's reset protection.

Both reset modes clear the saved panel name, including legacy NVS identity
records, before panel identity loads. Firmware-default names remain.

Partial reset also retains the P4-86 one-time Wi-Fi initialization marker, so
its boot action cannot clear the preserved credentials. Its preference key is
an adapter for the pinned ESPHome version, alongside the Wi-Fi and API keys.

The firmware requires web asset version 2 so an older hosted editor cannot
omit these write preconditions. The current bundle also has a version 1
manifest entry for older firmware; reset discovery hides unsupported actions.

`POST /api/v1/reset` requires `Content-Type: application/json`,
`X-EspDesktop-Request: reset`, the session epoch, and a body containing only
`{"mode":"customization"}` or `{"mode":"factory"}`. Existing web authentication
applies; cross-origin requests are rejected. A 202 response means intent is
durable, not that cleanup has completed. Stop saves/imports immediately, and
reload only after a newer epoch reports `pending: false`. A lost response may
still mean reset was accepted. The same pending mode is idempotent; conflicting
modes and requests during firmware installation receive 409.
A journal-write failure returns 500 and schedules a restart to resolve whether
the intent persisted; writes stay blocked until that restart. Reset recording
and OTA flash entry points share an interlock, so an automatic, web, native OTA
or C6 update cannot begin writing after reset intent has been reserved. The
ESP-IDF `esp_ota_begin` and hosted `esp_hosted_slave_ota_begin` linker adapters
must remain covered when upgrading the pinned ESPHome/SDK versions.

The early-startup coordinator owns cleanup independently of configuration
loading. Its `espdesktop_rst` journal survives factory cleanup. Failed cleanup
blocks restoration and retries with a serial recovery message. The credential
adapter in `reset_policy.h` is coupled to the pinned ESPHome Wi-Fi and API
preference keys and must be checked when upgrading ESPHome.
Reset cleanup always erases individual records. ESPHome's platform-level NVS
initialization recovery remains unchanged; if NVS itself is unreadable and the
platform erases it before setup, the reset journal cannot be recovered. The
interrupted-reset guarantees assume NVS can initialize and read its journal.

## Adding a Card Settings UI

Each card module registers its label/default providers, preview renderer,
settings renderer, and selection initializer with the shared card registry.
Contract helpers keep labels, defaults, picker behavior, and visibility aligned
with firmware metadata. `entry.ts` owns deliberate registration order.

Use [Change the Web Configurator](playbooks/change-web-configurator.md) for the
exact edit, generation, and verification steps, or the
[card playbook](playbooks/add-card-type.md) when both UI surfaces change.

## Preview and Persistence Rules

- Inline rename and drag-and-drop on native panels commit an edit before
  refreshing the preview. A rename changes one card. Drag-and-drop changes
  the page order while retaining the card records.
- Update the draft object first for settings that use the legacy save path.
- Use the existing helper save functions where available.
- Schedule a preview refresh after changing fields that affect the tile.
- Keep option-backed fields in the `options` string, not as new top-level fields,
  unless the saved config format intentionally changes.
- Confirm reload behavior. If the setting saves but vanishes after reload, check
  option preservation in `config_codec.js`.

## Local Testing

The web playbook owns browser checks and the physical-display loop. Browsers
cache `www.js` aggressively, so physical testing must hard reload after each
rebuild.

The theme's mode, automatic method, local start times, and solar offsets are
stored as one versioned native display preference. The editor discovers
support before using it. The firmware's theme entities submit edits to the
same record, including the first edit on a fresh panel. Firmware publishes
the complete theme after storage commits and uses product defaults when the
record is absent.
