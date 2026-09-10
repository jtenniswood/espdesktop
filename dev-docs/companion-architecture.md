# Companion architecture

Companion is a local connector and must remain independent of Home Assistant's
API, cards, and runtime. Its product contract is authored in
`product/v2/companion_capabilities.json`; `python3 scripts/build.py companion`
generates the matching C++, TypeScript, Swift, and output manifest.

## App shortcut definitions

App shortcut presets are authored in one JSON file per app under
`product/v2/app_shortcuts/`. The [contributor guide](../product/v2/app_shortcuts/README.md)
explains the format, permanent IDs, and build/test steps. `build.py companion`
validates and discovers these files, generating shared browser definitions and
firmware app names/shortcut IDs. The catalog and app subpages consume the same
definitions; adding a file requires no app-specific code.

## Ownership boundaries

- `components/companion/` owns TLS, pairing, authentication, protocol parsing,
  catalogue transfer, and artwork transport.
- `components/espdesktop/companion_*` owns the device-facing Companion state and
  card integration. It must not add behaviour to Home Assistant card drivers.
- `src/webserver/cards/companion.ts` and the Companion settings modules own the
  browser experience. Saved cards must remain editable while the Mac is offline.
- `macos/EspDesktop/` owns macOS permissions, approved resources, providers, and
  action execution. Folder paths and arbitrary commands never cross the protocol.

Protocol v3 uses typed JSON control messages on `/companion/v3`; only bounded
artwork chunks are binary. New messages and card modes must be added to the
product contract before they are implemented. Pairing starts when an unpaired display’s Companion setup page is opened.
The endpoint applies the configured device web authentication before starting
a pairing window or returning its code. Without device web authentication,
anyone with network access to that page can start pairing. The code expires
after 15 minutes and is hidden once paired; the touchscreen can also activate
pairing. This is a device-web-access policy, not a physical-presence guarantee.

## Compatibility and testing

Saved panel configuration compatibility remains separate from transport
compatibility. Changes should run generated-output checks, TypeScript checks,
web smoke tests, firmware parser tests, a 4848S040 compile, and a Swift build.
Physical pairing, Accessibility actions, reconnects, and artwork still require
testing with matching firmware and Companion builds.

## Enforced boundaries

The authored protocol includes payload fields, bounds, conditional requirements,
message direction and legal session states. Generated C++ and Swift decoders
validate messages before dispatch. Both test suites consume
`compatibility/fixtures/companion_protocol_v3.json`, including malformed and
wrong-session cases. Protocol v3 remains the wire format.

`EspDesktopAppCore` owns Companion runtime state, wiring callbacks, pending
requests, and the LVGL view registry. Simple status reads do not copy catalogues.
Transport events queued for the UI carry a session generation; replacing or
closing a session invalidates its deferred work and releases stale artwork.
`companion_runtime_access.h` is the temporary adapter for existing card/YAML
entry points; its fallback exists only in host tests.

On macOS, `CompanionConnection` accepts preferences, resources and credentials
through `CompanionSessionPorts.swift` and publishes events observed by the store.
Native settings views live in `CompanionSettings.swift`; application lifecycle
and the menu bar remain in `CompanionApp.swift`.

Browser card variants live in `model/companion_card.ts`. The saved-format adapter
in `model/companion_card_codec.ts` retains current bytes and unknown options;
`api/companion_catalogue.ts` owns isolated request/cache state. Offline catalogue
availability never rewrites a saved card identity.

## Release compatibility

`product/generated/companion_compatibility.json` and the generated public
compatibility page describe supported protocol pairs and devices. Releases stay
coordinated until independently supported version pairs have executable tests.
After firmware and Mac builds succeed, `scripts/companion_release.py` records the
source revision and artifact hashes in the published
`companion-compatibility.json`; verification rejects changed files, ambiguous
Mac artifacts and mismatched firmware provenance. This does not claim physical
device testing.

Run `npm run check:companion-contract`, `npm run test:firmware`, browser unit
checks, and `swift test --package-path macos/EspDesktop` after boundary changes.
Host protocol tests fetch checksum-pinned ArduinoJson 7.4.3. Offline CMake runs
can use `-DFETCHCONTENT_SOURCE_DIR_ARDUINOJSON=/path/to/ArduinoJson-7.4.3`.

## Local discovery

Companion registers `_espdesktop._tcp` with the existing ESPHome/ESP-IDF mDNS responder after its TLS server starts. The SRV port is the configured Companion port; TXT fields are `v=1`, `name` (friendly name), and `id` (lowercase SHA-256 of the stored DER certificate). Registration retries until the shared responder is ready. ESPHome continues to own the hostname, other services and network-interface lifecycle. Firmware without Companion does not advertise this service.

The Mac browses only during display selection and reconnect recovery. Bonjour data is untrusted: hostname/TXT validation limits accepted records, and the existing certificate pin remains authoritative. The recovery candidate and in-flight endpoint are separate from the saved `panelHost`; only successful pinned TLS plus `auth.accepted` commits the attempted endpoint. `pairingAccount`, Keychain credentials and authentication sequence keys retain their existing identity. The browser pairing page uses HTTP's default port independently of the advertised TLS port. Existing firmware and pairings retain manual-address support.
