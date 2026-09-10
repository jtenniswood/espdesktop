#!/usr/bin/env python3
"""Unified build script for espdesktop.

Combines icon synchronization and www.js generation into a single tool.

Usage:
    python scripts/build.py               # run all generators
    python scripts/build.py --check       # exit 1 if any output is stale
    python scripts/build.py devices       # sync public device capabilities only
    python scripts/build.py icons         # sync icons only
    python scripts/build.py i18n          # sync firmware translations only
    python scripts/build.py companion     # sync shared Companion capabilities
    python scripts/build.py www           # build www.js only
    python scripts/build.py www --temporary-output DIR  # isolated fresh bundles
    python scripts/build.py icons --check # check icons only
    python scripts/build.py --self-test    # verify transactional publishing
"""
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from device_profiles import load_device_profiles, public_device_capabilities, web_config
from check_timezones import AUTO_TIMEZONE_OPTION, load_timezone_select_options, timezone_option_id
from product_schema import (
    ProductSchemaError,
    assert_card_contract_valid,
    assert_entity_names_valid as assert_product_entity_names_valid,
)
from product_model_v2 import load_product_model_v2, source_directory, source_path

ROOT = Path(__file__).resolve().parent.parent
MDI_VERSION = "7.4.47"
MDI_CSS_URL = f"https://cdn.jsdelivr.net/npm/@mdi/font@{MDI_VERSION}/css/materialdesignicons.css"
MDI_WEB_FONT = ROOT / "common" / "assets" / "fonts" / f"materialdesignicons-webfont-{MDI_VERSION}.ttf"
INTER_WEB_FONT = ROOT / "node_modules" / "vitepress" / "dist" / "client" / "theme-default" / "fonts" / "inter-roman-latin.woff2"
ROBOTO_WEB_FONT = ROOT / "common" / "assets" / "fonts" / "roboto-latin.woff2"
SUPPORT_BUTTON_IMAGE = ROOT / "common" / "assets" / "images" / "buy-me-a-coffee-button.png"
WEB_SOURCE_DIR = ROOT / "src" / "webserver"

# The hosted editor remains available to the development firmware plus the
# current stable release and its four supported rollback releases. Keep this
# list aligned with the GitHub Pages release catalogue in pages.yml.
WEB_ASSET_SUPPORTED_FIRMWARE_VERSIONS = (
    "dev",
    "v2.8.5",
    "v2.8.4",
    "v2.8.3",
    "v2.8.2",
    "v2.8.1",
)

# Fixed editor controls use a few MDI glyphs that are not selectable Product
# Model icons. Keep their pinned codepoints here so rebuilding www.js remains
# possible without reaching the MDI CDN. Product Model icon codepoints are
# read directly from product/v2/icons.json below.
WEB_FIXED_MDI_ICON_CODEPOINTS = {
    "alarm": "F0020", "album": "F0025", "api": "F109B", "arrow-expand-all": "F004C",
    "arrow-top-right": "F005C", "blur": "F00B5", "calendar": "F00ED", "calendar-clock": "F00F0",
    "calendar-month": "F0E17", "cancel": "F073A", "card": "F0B6F", "card-outline": "F0B76",
    "chip": "F061A", "clipboard-outline": "F014C", "clock": "F0954", "code-json": "F0626",
    "content-copy": "F018F", "content-cut": "F0190", "content-paste": "F0192", "counter": "F0199",
    "decimal": "F10A1", "domain": "F01D7", "drag": "F01DB", "eye-off-outline": "F06D1",
    "eye-outline": "F06D0", "file": "F0214", "flag": "F023B", "folder-plus": "F0257",
    "form-dropdown": "F1400", "format-text": "F0284", "function": "F0295", "gesture-tap-button": "F12A8",
    "grid": "F02C1", "home-automation": "F07D1", "home-import-outline": "F0F9C", "hook": "F06E2",
    "information-outline": "F02FD", "keyboard-return": "F0311", "label": "F0315", "lightbulb-on": "F06E8",
    "link": "F0337", "loading": "F0772", "map-clock": "F0D1E", "map-marker-path": "F0D20",
    "map-marker-question": "F0F07", "movie": "F0381", "movie-open": "F0FCE", "network": "F06F3",
    "note": "F039A", "numeric": "F03A0", "pencil": "F03EB", "plex": "F06BA", "podcast": "F0994",
    "post": "F1008", "restore": "F099B", "script": "F0BC1", "script-text-play": "F1727",
    "security": "F0483", "select": "F0485", "spotify": "F04C7", "svg": "F0721", "switch": "F04E4", "sync": "F04E6",
    "tab": "F04E9", "target": "F04FE", "text": "F09A8", "timer": "F13AB",
    "toggle-switch": "F0521", "toggle-switch-variant": "F1A25", "toggle-switch-variant-off": "F1A26",
    "tune-vertical": "F066A", "tune-vertical-variant": "F1543", "upload": "F0552", "video": "F0567",
    "view-grid-plus": "F0F8D", "webhook": "F062F",
}

# ---------------------------------------------------------------------------
# Shared paths
# ---------------------------------------------------------------------------
ICONS_JSON = source_path("icons")
ENTITY_NAMES_JSON = source_path("entityNames")
ENTITY_NAMES_YAML = ROOT / "common" / "config" / "entity_names.yaml"
ENTITY_NAMES_TS = ROOT / "src" / "webserver" / "generated" / "entity_catalog.ts"
WEB_ICONS_TS = ROOT / "src" / "webserver" / "generated" / "icons.ts"
STRINGS_DIR = source_directory("translations")
I18N_GENERATED_H = ROOT / "components" / "espdesktop" / "i18n_generated.h"
CARD_CONTRACT_JSON = source_path("cardContract")
CARD_CONTRACT_TS = ROOT / "src" / "webserver" / "generated" / "card_contract.ts"
CARD_CONTRACT_H = ROOT / "components" / "espdesktop" / "button_grid_contract_generated.h"
COMPANION_CAPABILITIES_JSON = ROOT / "product" / "v2" / "companion_capabilities.json"
COMPANION_CAPABILITIES_TS = ROOT / "src" / "webserver" / "generated" / "companion_capabilities.ts"
COMPANION_CAPABILITIES_H = ROOT / "components" / "espdesktop" / "companion_capabilities_generated.h"
COMPANION_CAPABILITIES_SWIFT = ROOT / "macos" / "EspDesktop" / "Sources" / "Companion" / "CompanionCapabilities.generated.swift"
COMPANION_GENERATED_MANIFEST = ROOT / "product" / "generated" / "companion_manifest.json"
CARD_DOCS_DIR = ROOT / "docs" / "generated" / "cards"
DEVICE_CAPABILITIES_JSON = ROOT / "docs" / "public" / "device-profiles.json"
DEVICE_DOCS_DIR = ROOT / "docs" / "generated" / "screens"


class BuildError(RuntimeError):
    pass


class GeneratedOutputTransaction:
    """Stage generated text and promote the complete set only after success."""

    def __init__(self, replace_file=os.replace):
        self._staged = {}
        self._replace_file = replace_file

    def stage_text(self, path, content):
        self._staged[Path(path).resolve()] = content

    def overlays(self):
        return {str(path): content for path, content in self._staged.items()}

    def commit(self):
        if not self._staged:
            return

        prepared = {}
        originals = {}
        replaced = []
        try:
            for path, content in self._staged.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                target_mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
                originals[path] = (path.read_bytes(), target_mode) if path.exists() else None
                with tempfile.NamedTemporaryFile(
                    mode="w",
                    encoding="utf-8",
                    dir=path.parent,
                    prefix=f".{path.name}.",
                    suffix=".tmp",
                    delete=False,
                ) as handle:
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
                    os.chmod(handle.name, target_mode)
                    prepared[path] = Path(handle.name)

            for path, staged_path in prepared.items():
                self._replace_file(staged_path, path)
                replaced.append(path)
        except Exception as exc:
            for path in reversed(replaced):
                original = originals[path]
                if original is None:
                    path.unlink(missing_ok=True)
                    continue
                original_content, original_mode = original
                with tempfile.NamedTemporaryFile(
                    mode="wb",
                    dir=path.parent,
                    prefix=f".{path.name}.rollback.",
                    suffix=".tmp",
                    delete=False,
                ) as handle:
                    handle.write(original_content)
                    handle.flush()
                    os.fsync(handle.fileno())
                    os.chmod(handle.name, original_mode)
                    rollback_path = Path(handle.name)
                os.replace(rollback_path, path)
            raise BuildError(f"Unable to publish generated outputs; restored the previous set: {exc}") from exc
        finally:
            for staged_path in prepared.values():
                staged_path.unlink(missing_ok=True)


GENERATED_TRANSACTION = None


def write_generated_text(path, content):
    if GENERATED_TRANSACTION is None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        action = "updated"
    else:
        GENERATED_TRANSACTION.stage_text(path, content)
        action = "staged"
    print(f"  {action} {path.relative_to(ROOT)}")


def run_generated_transaction_self_test():
    with tempfile.TemporaryDirectory(prefix="espdesktop-generated-transaction-") as directory:
        root = Path(directory)
        first = root / "first.txt"
        second = root / "second.txt"
        third = root / "third.txt"
        first.write_text("first-old", encoding="utf-8")
        second.write_text("second-old", encoding="utf-8")
        first.chmod(0o640)

        transaction = GeneratedOutputTransaction()
        transaction.stage_text(first, "first-new")
        transaction.stage_text(second, "second-new")
        transaction.stage_text(third, "third-new")
        if first.read_text(encoding="utf-8") != "first-old" or second.read_text(encoding="utf-8") != "second-old":
            raise BuildError("Generated transaction changed files before commit")
        transaction.commit()
        if first.read_text(encoding="utf-8") != "first-new" or second.read_text(encoding="utf-8") != "second-new":
            raise BuildError("Generated transaction did not publish the complete set")
        if first.stat().st_mode & 0o777 != 0o640 or third.stat().st_mode & 0o777 != 0o644:
            raise BuildError("Generated transaction did not preserve safe file permissions")

        replacements = 0

        def fail_second_replace(source, destination):
            nonlocal replacements
            replacements += 1
            if replacements == 2:
                raise OSError("simulated publish failure")
            os.replace(source, destination)

        transaction = GeneratedOutputTransaction(replace_file=fail_second_replace)
        transaction.stage_text(first, "first-broken")
        transaction.stage_text(second, "second-broken")
        try:
            transaction.commit()
        except BuildError:
            pass
        else:
            raise BuildError("Generated transaction self-test did not exercise rollback")
        if first.read_text(encoding="utf-8") != "first-new" or second.read_text(encoding="utf-8") != "second-new":
            raise BuildError("Generated transaction did not restore the previous set")
        if first.stat().st_mode & 0o777 != 0o640:
            raise BuildError("Generated transaction rollback did not restore file permissions")

        marker = "espdesktop-generated-overlay-self-test"
        entry_path = ROOT / "src" / "webserver" / "entry.ts"
        entry_overlay = entry_path.read_text(encoding="utf-8") + (
            f'\n(globalThis as Record<string, unknown>)["{marker}"] = true;\n'
        )
        slug, config = next(iter(build_web_devices().items()))
        original_urlopen = urllib.request.urlopen
        try:
            urllib.request.urlopen = lambda *_args, **_kwargs: (_ for _ in ()).throw(
                AssertionError("web bundle build unexpectedly accessed the network")
            )
            embedded_mdi_styles = embedded_web_mdi_styles()
        finally:
            urllib.request.urlopen = original_urlopen
        bundle_root = root / "bundle"
        result = subprocess.run(
            ["node", str(ROOT / "scripts" / "build_web_bundle.js")],
            input=json.dumps({
                "outputDir": str(bundle_root),
                "devices": {slug: config},
                "embeddedMdiStyles": embedded_mdi_styles,
                "testHooks": False,
                "overlays": {str(entry_path): entry_overlay},
            }),
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise BuildError(result.stderr.strip() or "Generated overlay self-test could not build a web bundle")
        bundle = (bundle_root / "app.js").read_text(encoding="utf-8")
        if marker not in bundle:
            raise BuildError("Web bundle did not consume the staged generated overlay")

    print("Generated output transaction self-test passed.")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def load_entity_names_data():
    return load_json(ENTITY_NAMES_JSON)


def load_card_contract_data():
    return load_product_model_v2().card_contract_data()


def load_companion_capabilities_data():
    data = load_json(COMPANION_CAPABILITIES_JSON)
    required_lists = ("windowActions", "systemMetrics")
    if not isinstance(data.get("version"), int) or data["version"] < 1:
        raise BuildError("Companion capability version must be a positive integer")
    for key in required_lists:
        if not isinstance(data.get(key), list) or not data[key]:
            raise BuildError(f"Companion capability registry requires a non-empty {key} list")

    protocol = data.get("protocol")
    if not isinstance(protocol, dict) or not isinstance(protocol.get("version"), int) or protocol["version"] < 1:
        raise BuildError("Companion protocol requires a positive version")
    if not isinstance(protocol.get("path"), str) or not protocol["path"].startswith("/companion/"):
        raise BuildError("Companion protocol path must be under /companion/")
    for key in ("maximumTextFrameBytes",):
        if not isinstance(protocol.get(key), int) or protocol[key] < 1:
            raise BuildError(f"Companion protocol requires a positive {key}")
    messages = protocol.get("messages")
    message_ids = [item.get("id") for item in messages] if isinstance(messages, list) else []
    if not message_ids or any(not isinstance(item, str) or not item for item in message_ids) or len(message_ids) != len(set(message_ids)):
        raise BuildError("Companion protocol message ids must be non-empty and unique")
    allowed_directions = {"panel_to_mac", "mac_to_panel", "bidirectional"}
    allowed_authorization = {"public", "pairing_window", "paired", "session"}
    for message in messages:
        if message.get("direction") not in allowed_directions or message.get("authorization") not in allowed_authorization:
            raise BuildError(f"Invalid Companion message policy for {message.get('id')}")

    security = data.get("security")
    if not isinstance(security, dict) or security.get("pairingAuthorization") not in {"physical_presence", "device_web_access"}:
        raise BuildError("Unsupported Companion pairing authorization")
    if not isinstance(security.get("pairingWindowSeconds"), int) or security["pairingWindowSeconds"] < 30:
        raise BuildError("Companion pairing window must be at least 30 seconds")

    card_modes = data.get("cardModes")
    card_mode_ids = [item.get("id") for item in card_modes] if isinstance(card_modes, list) else []
    if not card_mode_ids or any(not isinstance(item, str) or not item for item in card_mode_ids) or len(card_mode_ids) != len(set(card_mode_ids)):
        raise BuildError("Companion card mode ids must be non-empty and unique")
    for mode in card_modes:
        if not all(isinstance(mode.get(key), str) and mode[key] for key in ("label", "capability", "defaultIcon")):
            raise BuildError(f"Invalid Companion card mode: {mode.get('id')}")

    identifiers = []
    for action in data["windowActions"]:
        if not all(isinstance(action.get(key), str) and action[key] for key in ("id", "label", "group", "key")):
            raise BuildError("Each Companion window action requires id, label, group, and key")
        if not action["id"].startswith("window."):
            raise BuildError(f"Invalid Companion window action id: {action['id']}")
        if not isinstance(action.get("minimumMacOS"), int):
            raise BuildError(f"Companion window action {action['id']} requires minimumMacOS")
        modifiers = action.get("modifiers")
        allowed_modifiers = {"command", "control", "option", "shift", "function"}
        if not isinstance(modifiers, list) or not modifiers or any(item not in allowed_modifiers for item in modifiers):
            raise BuildError(f"Invalid Companion window action modifiers: {action['id']}")
        identifiers.append(action["id"])
    for metric in data["systemMetrics"]:
        if not all(isinstance(metric.get(key), str) and (metric[key] or key == "unit") for key in ("mode", "id", "label", "labelKey", "unit")):
            raise BuildError("Each Companion system metric requires mode, id, label, labelKey, and unit")
        if not metric["id"].startswith("stat."):
            raise BuildError(f"Invalid Companion system metric id: {metric['id']}")
        identifiers.append(metric["id"])
        if metric.get("freeId"):
            identifiers.append(metric["freeId"])
    if len(identifiers) != len(set(identifiers)):
        raise BuildError("Companion capability identifiers must be unique")
    return data


def replace_between_markers(text, start_tag, end_tag, new_content):
    """Replace content between marker lines, preserving the markers themselves."""
    pattern = re.compile(
        r"(^[^\n]*" + re.escape(start_tag) + r"[^\n]*\n)"
        r"(.*?)"
        r"(^[^\n]*" + re.escape(end_tag) + r"[^\n]*$)",
        re.MULTILINE | re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        raise ValueError(f"Markers not found: {start_tag} / {end_tag}")
    return text[: m.start(2)] + new_content + text[m.start(3) :]


# ===========================================================================
# Entity name sync
# ===========================================================================

def entity_name_entries(data):
    entries = data.get("entities")
    if not isinstance(entries, list):
        raise BuildError(f"{ENTITY_NAMES_JSON.relative_to(ROOT)} must contain an entities list")
    return entries


def validate_entity_names(data):
    errors = []
    keys = set()
    names_by_domain = {}
    for index, entry in enumerate(entity_name_entries(data)):
        key = entry.get("key")
        domain = entry.get("domain")
        name = entry.get("name")
        template = entry.get("template")
        if not isinstance(key, str) or not key:
            errors.append(f"entry {index + 1} has a missing key")
            continue
        if key in keys:
            errors.append(f"duplicate key {key!r}")
        keys.add(key)
        if not isinstance(domain, str) or not domain:
            errors.append(f"{key}: missing domain")
        if bool(name) == bool(template):
            errors.append(f"{key}: define exactly one of name or template")
        if template and "{slot}" not in template:
            errors.append(f"{key}: template must contain {{slot}}")
        value = name or template
        if isinstance(value, str):
            names_by_domain.setdefault(domain, {}).setdefault(value, []).append(key)
        object_ids = entry.get("objectIds", [])
        if object_ids and (
            not isinstance(object_ids, list)
            or not all(isinstance(v, str) and v for v in object_ids)
        ):
            errors.append(f"{key}: objectIds must be a list of strings")
        elif isinstance(object_ids, list) and len(object_ids) != len(set(object_ids)):
            errors.append(f"{key}: objectIds must not contain duplicate values")
        groups = entry.get("groups", [])
        if groups and (not isinstance(groups, list) or not all(isinstance(v, str) and v for v in groups)):
            errors.append(f"{key}: groups must be a list of strings")

    for domain, names in names_by_domain.items():
        for name, entry_keys in names.items():
            if len(entry_keys) > 1:
                errors.append(f"duplicate entity name for {domain} {name!r}: {', '.join(entry_keys)}")
    return errors


def assert_entity_names_valid(data):
    try:
        assert_product_entity_names_valid(data)
    except ProductSchemaError as exc:
        raise BuildError(str(exc)) from exc


def yaml_quote(value):
    return json.dumps(value)


def split_slot_template(template):
    before, after = template.split("{slot}", 1)
    return before, after


def gen_entity_names_yaml(data):
    lines = [
        "# =============================================================================\n",
        "# GENERATED ENTITY NAMES - do not edit by hand\n",
        "# Generated by scripts/build.py from product/v2/entity_names.json.\n",
        "# =============================================================================\n",
        "\n",
        "substitutions:\n",
    ]
    for entry in entity_name_entries(data):
        key = entry["key"]
        if "name" in entry:
            lines.append(f"  entity_{key}: {yaml_quote(entry['name'])}\n")
        else:
            before, after = split_slot_template(entry["template"])
            lines.append(f"  entity_{key}_prefix: {yaml_quote(before)}\n")
            lines.append(f"  entity_{key}_suffix: {yaml_quote(after)}\n")
    return "".join(lines)


def gen_entity_names_js(data):
    entities = {}
    groups = {}
    for entry in entity_name_entries(data):
        key = entry["key"]
        entity = {"domain": entry["domain"]}
        if "name" in entry:
            entity["name"] = entry["name"]
        else:
            entity["template"] = entry["template"]
        if entry.get("objectIds"):
            entity["objectIds"] = entry["objectIds"]
        entities[key] = entity
        for group in entry.get("groups", []):
            groups.setdefault(group, []).append(key)

    payload = {
        "entities": entities,
        "groups": groups,
    }
    json_text = json.dumps(payload, indent=2)
    return (
        "// =============================================================================\n"
        "// GENERATED ENTITY CATALOG - do not edit by hand\n"
        "// Generated by scripts/build.py from product/v2/entity_names.json.\n"
        "// =============================================================================\n"
        f"export const ENTITY_CATALOG = {json_text} as const;\n"
    )


def sync_entity_names(check_only=False):
    data = load_entity_names_data()
    assert_entity_names_valid(data)
    outputs = [
        (ENTITY_NAMES_YAML, gen_entity_names_yaml(data)),
        (ENTITY_NAMES_TS, gen_entity_names_js(data)),
    ]
    dirty = []
    for path, content in outputs:
        if not path.exists() or path.read_text() != content:
            dirty.append(path.relative_to(ROOT))

    if check_only:
        if dirty:
            print("Entity name outputs are out of sync. Run 'python scripts/build.py entities' to fix:")
            for rel in dirty:
                print(f"  {rel}")
        return dirty

    for path, content in outputs:
        if path.exists() and path.read_text() == content:
            continue
        write_generated_text(path, content)
    return dirty


# ===========================================================================
# Firmware i18n generation
# ===========================================================================

def unescape_compact_string(value):
    out = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch != "\\" or i + 1 >= len(value):
            out.append(ch)
            i += 1
            continue
        nxt = value[i + 1]
        if nxt == "n":
            out.append("\n")
        elif nxt in {"\\", "="}:
            out.append(nxt)
        else:
            out.append(nxt)
        i += 2
    return "".join(out)


def load_compact_strings(path):
    strings = {}
    key_lines = {}
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise BuildError(f"Invalid strings entry in {path.relative_to(ROOT)}:{line_no}")
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            raise BuildError(f"Empty strings key in {path.relative_to(ROOT)}:{line_no}")
        if key in key_lines:
            raise BuildError(
                f"Duplicate strings key {key!r} in {path.relative_to(ROOT)}:"
                f"{line_no} (first defined on line {key_lines[key]})"
            )
        key_lines[key] = line_no
        strings[key] = unescape_compact_string(value)
    return strings


def cpp_string(value):
    return json.dumps(value, ensure_ascii=False)


def gen_i18n_header():
    english_path = STRINGS_DIR / "strings.en.txt"
    if not english_path.exists():
        raise BuildError(f"Missing {english_path.relative_to(ROOT)}")
    english = load_compact_strings(english_path)
    language_files = sorted(STRINGS_DIR.glob("strings.*.txt"))
    languages = []
    for path in language_files:
        code = path.stem.split(".", 1)[1]
        if code == "en":
            continue
        translated = load_compact_strings(path)
        missing = [key for key in english if key not in translated]
        extra = [key for key in translated if key not in english]
        if missing or extra:
            raise BuildError(
                f"{path.relative_to(ROOT)} keys do not match strings.en.txt "
                f"(missing={missing[:5]}, extra={extra[:5]})"
            )
        languages.append((code, translated))

    lines = [
        "// =============================================================================",
        "// GENERATED FIRMWARE I18N - do not edit by hand",
        "// Generated by scripts/build.py from product/v2/translations/strings.*.txt.",
        "// =============================================================================",
        "#pragma once",
        "#include <cstring>",
        "#include <string>",
        "",
        "inline std::string &espdesktop_language_code() {",
        "  static std::string language = \"en\";",
        "  return language;",
        "}",
        "",
        "inline void set_espdesktop_language(const std::string &language) {",
        "  espdesktop_language_code() = language;",
        "}",
        "",
    ]

    for code, translated in languages:
        fn = re.sub(r"[^A-Za-z0-9_]", "_", code)
        lines.extend([
            f"inline const char *espdesktop_i18n_{fn}(const char *text) {{",
            "  if (!text) return \"\";",
        ])
        seen_sources = set()
        for key, source in english.items():
            if source in seen_sources:
                continue
            seen_sources.add(source)
            target = translated[key]
            if target == source:
                continue
            lines.append(f"  if (std::strcmp(text, {cpp_string(source)}) == 0) return {cpp_string(target)};")
        lines.extend([
            "  return text;",
            "}",
            "",
        ])

    lines.extend([
        "inline const char *espdesktop_i18n_key_en(const char *key) {",
        "  if (!key) return \"\";",
    ])
    for key, source in english.items():
        lines.append(f"  if (std::strcmp(key, {cpp_string(key)}) == 0) return {cpp_string(source)};")
    lines.extend([
        "  return key;",
        "}",
        "",
    ])

    for code, translated in languages:
        fn = re.sub(r"[^A-Za-z0-9_]", "_", code)
        lines.extend([
            f"inline const char *espdesktop_i18n_key_{fn}(const char *key) {{",
            "  if (!key) return \"\";",
        ])
        for key, target in translated.items():
            source = english[key]
            if target == source:
                continue
            lines.append(f"  if (std::strcmp(key, {cpp_string(key)}) == 0) return {cpp_string(target)};")
        lines.extend([
            "  return espdesktop_i18n_key_en(key);",
            "}",
            "",
        ])

    lines.extend([
        "inline const char *espdesktop_i18n(const char *text) {",
        "  if (!text) return \"\";",
    ])
    for code, _translated in languages:
        fn = re.sub(r"[^A-Za-z0-9_]", "_", code)
        lines.append(f"  if (espdesktop_language_code() == {cpp_string(code)}) return espdesktop_i18n_{fn}(text);")
    lines.extend([
        "  return text;",
        "}",
        "",
        "inline std::string espdesktop_i18n(const std::string &text) {",
        "  return std::string(espdesktop_i18n(text.c_str()));",
        "}",
        "",
        "inline const char *espdesktop_i18n_key(const char *key) {",
        "  if (!key) return \"\";",
    ])
    for code, _translated in languages:
        fn = re.sub(r"[^A-Za-z0-9_]", "_", code)
        lines.append(f"  if (espdesktop_language_code() == {cpp_string(code)}) return espdesktop_i18n_key_{fn}(key);")
    lines.extend([
        "  return espdesktop_i18n_key_en(key);",
        "}",
        "",
        "inline std::string espdesktop_i18n_key(const std::string &key) {",
        "  return std::string(espdesktop_i18n_key(key.c_str()));",
        "}",
        "",
    ])
    return "\n".join(lines)


def sync_i18n(check_only=False):
    generated = gen_i18n_header()
    dirty = []
    if not I18N_GENERATED_H.exists() or I18N_GENERATED_H.read_text(encoding="utf-8") != generated:
        dirty.append(I18N_GENERATED_H.relative_to(ROOT))

    if check_only:
        if dirty:
            print("Firmware i18n output is out of sync. Run 'python scripts/build.py i18n' to fix:")
            for rel in dirty:
                print(f"  {rel}")
        return dirty

    if dirty:
        write_generated_text(I18N_GENERATED_H, generated)
    return dirty


# ===========================================================================
# Shared Companion capability generation
# ===========================================================================

def companion_ts_literal(value):
    return re.sub(
        r'^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":',
        r'\1\2:',
        json.dumps(value, indent=2),
        flags=re.MULTILINE,
    )


def gen_companion_capabilities_ts(data):
    protocol = data["protocol"]
    return (
        "// GENERATED COMPANION CAPABILITIES - do not edit by hand\n"
        "// Generated by scripts/build.py from product/v2/companion_capabilities.json.\n\n"
        "export interface CompanionWindowAction { readonly id: string; readonly label: string; readonly group: string; }\n"
        "export interface CompanionSystemMetric { readonly mode: string; readonly id: string; readonly label: string; readonly unit: string; readonly freeId?: string; }\n"
        "export interface CompanionCardMode { readonly id: string; readonly label: string; readonly capability: string; readonly defaultIcon: string; }\n"
        "export interface CompanionProtocolMessage { readonly id: string; readonly direction: string; readonly authorization: string; }\n\n"
        f"export const COMPANION_CAPABILITY_VERSION = {data['version']} as const;\n"
        f"export const COMPANION_PROTOCOL_VERSION = {protocol['version']} as const;\n"
        f"export const COMPANION_PROTOCOL_PATH = {json.dumps(protocol['path'])} as const;\n"
        f"export const COMPANION_MAXIMUM_TEXT_FRAME_BYTES = {protocol['maximumTextFrameBytes']} as const;\n"
        f"export const COMPANION_CARD_MODES = {companion_ts_literal(data['cardModes'])} as const satisfies readonly CompanionCardMode[];\n"
        f"export const COMPANION_PROTOCOL_MESSAGES: readonly CompanionProtocolMessage[] = {companion_ts_literal([{key: item[key] for key in ('id', 'direction', 'authorization')} for item in protocol['messages']])};\n"
        f"export const COMPANION_WINDOW_ACTIONS: readonly CompanionWindowAction[] = {companion_ts_literal([{key: item[key] for key in ('id', 'label', 'group')} for item in data['windowActions']])};\n"
        f"export const COMPANION_SYSTEM_METRICS: readonly CompanionSystemMetric[] = {companion_ts_literal([{key: item[key] for key in ('mode', 'id', 'freeId', 'label', 'unit') if key in item} for item in data['systemMetrics']])};\n"
    )


def gen_companion_capabilities_h(data):
    protocol = data["protocol"]
    metric_entries = []
    for metric in data["systemMetrics"]:
        metric_entries.append((metric["id"], metric["label"], metric["labelKey"], metric["unit"]))
        if metric.get("freeId"):
            metric_entries.append((metric["freeId"], metric["label"], metric["labelKey"], metric["unit"]))
    lines = [
        "#pragma once\n\n",
        "#include <cstddef>\n",
        "#include <cstdint>\n",
        "#include <string>\n\n",
        "// GENERATED COMPANION CAPABILITIES - do not edit by hand\n",
        "// Generated by scripts/build.py from product/v2/companion_capabilities.json.\n\n",
        f"constexpr int COMPANION_CAPABILITY_VERSION = {data['version']};\n",
        f"constexpr int COMPANION_PROTOCOL_VERSION = {protocol['version']};\n",
        f"constexpr const char *COMPANION_PROTOCOL_PATH = {json.dumps(protocol['path'])};\n",
        f"constexpr size_t COMPANION_MAXIMUM_TEXT_FRAME_BYTES = {protocol['maximumTextFrameBytes']};\n",
        f"constexpr uint32_t COMPANION_PAIRING_WINDOW_SECONDS = {data['security']['pairingWindowSeconds']};\n\n",
        f"constexpr bool COMPANION_BROWSER_STARTS_PAIRING = {str(data['security']['pairingAuthorization'] == 'device_web_access').lower()};\n",
        f"constexpr bool COMPANION_BROWSER_EXPOSES_PAIRING_CODE = {str(data['security']['browserExposesPairingCode']).lower()};\n",
        "struct CompanionProtocolMessagePolicy { const char *id; const char *direction; const char *authorization; };\n",
        "inline constexpr CompanionProtocolMessagePolicy COMPANION_PROTOCOL_MESSAGES[] = {\n",
    ]
    lines.extend(f"  {{{json.dumps(item['id'])}, {json.dumps(item['direction'])}, {json.dumps(item['authorization'])}}},\n" for item in protocol["messages"])
    lines.extend([
        "};\n\n",
        "struct CompanionCardModeCapability { const char *id; const char *label; const char *capability; const char *default_icon; };\n",
        "inline constexpr CompanionCardModeCapability COMPANION_CARD_MODES[] = {\n",
    ])
    lines.extend(f"  {{{json.dumps(item['id'])}, {json.dumps(item['label'])}, {json.dumps(item['capability'])}, {json.dumps(item['defaultIcon'])}}},\n" for item in data["cardModes"])
    lines.extend([
        "};\n\n",
        "struct CompanionWindowCapability { const char *id; const char *label; };\n",
        "inline constexpr CompanionWindowCapability COMPANION_WINDOW_CAPABILITIES[] = {\n",
    ])
    lines.extend(f"  {{{json.dumps(item['id'])}, {json.dumps(item['label'])}}},\n" for item in data["windowActions"])
    lines.extend([
        "};\n\n",
        "struct CompanionMetricCapability { const char *id; const char *label; const char *label_key; const char *unit; };\n",
        "inline constexpr CompanionMetricCapability COMPANION_METRIC_CAPABILITIES[] = {\n",
    ])
    lines.extend(f"  {{{json.dumps(item[0])}, {json.dumps(item[1])}, {json.dumps(item[2])}, {json.dumps(item[3])}}},\n" for item in metric_entries)
    lines.extend([
        "};\n\n",
        "inline const CompanionWindowCapability *companion_window_capability(const std::string &id) {\n",
        "  for (const auto &item : COMPANION_WINDOW_CAPABILITIES) if (id == item.id) return &item;\n",
        "  return nullptr;\n",
        "}\n\n",
        "inline const CompanionMetricCapability *companion_metric_capability(const std::string &id) {\n",
        '  for (const auto &item : COMPANION_METRIC_CAPABILITIES)\n',
        '    if (id == item.id || (std::string(item.id) == "stat.ip_address" && id.size() > std::string("stat.ip_address:").size() && id.rfind("stat.ip_address:", 0) == 0) || (std::string(item.id) == "stat.storage" && id.size() > std::string("stat.storage:").size() && id.rfind("stat.storage:", 0) == 0) || (std::string(item.id) == "stat.storage_free" && id.size() > std::string("stat.storage_free:").size() && id.rfind("stat.storage_free:", 0) == 0)) return &item;\n',
        "  return nullptr;\n",
        "}\n\n",
    ])
    return "".join(lines).rstrip() + "\n"


def gen_companion_capabilities_swift(data):
    flag_names = {
        "command": ".maskCommand", "control": ".maskControl", "option": ".maskAlternate",
        "shift": ".maskShift", "function": ".maskSecondaryFn",
    }
    lines = [
        "// GENERATED COMPANION CAPABILITIES - do not edit by hand\n",
        "// Generated by scripts/build.py from product/v2/companion_capabilities.json.\n\n",
        "import CoreGraphics\n\n",
        "struct CompanionWindowActionCapability {\n",
        "    let key: String\n",
        "    let flags: CGEventFlags\n",
        "    let minimumMacOS: Int\n",
        "}\n\n",
        "enum CompanionCapabilities {\n",
        f"    static let version = {data['version']}\n",
        f"    static let protocolVersion = {data['protocol']['version']}\n",
        f"    static let protocolPath = {json.dumps(data['protocol']['path'])}\n",
        f"    static let maximumTextFrameBytes = {data['protocol']['maximumTextFrameBytes']}\n",
        f"    static let pairingWindowSeconds = {data['security']['pairingWindowSeconds']}\n",
        "    static let protocolMessages: Set<String> = [\n",
    ]
    lines.extend(f"        {json.dumps(item['id'])},\n" for item in data["protocol"]["messages"])
    lines.extend([
        "    ]\n",
        "    static let cardModes: [String: String] = [\n",
    ])
    lines.extend(f"        {json.dumps(item['id'])}: {json.dumps(item['label'])},\n" for item in data["cardModes"])
    lines.extend([
        "    ]\n",
        "    static let windowActions: [String: CompanionWindowActionCapability] = [\n",
    ])
    for item in data["windowActions"]:
        flags = ", ".join(flag_names[modifier] for modifier in item["modifiers"])
        lines.append(f"        {json.dumps(item['id'])}: .init(key: {json.dumps(item['key'])}, flags: [{flags}], minimumMacOS: {item['minimumMacOS']}),\n")
    lines.extend([
        "    ]\n",
        "}\n",
    ])
    return "".join(lines)


def sync_companion_capabilities(check_only=False):
    from companion_protocol_codegen import outputs as protocol_outputs
    from companion_release import compatibility
    data = load_companion_capabilities_data()
    outputs = [
        (COMPANION_CAPABILITIES_TS, gen_companion_capabilities_ts(data)),
        (COMPANION_CAPABILITIES_H, gen_companion_capabilities_h(data)),
        (COMPANION_CAPABILITIES_SWIFT, gen_companion_capabilities_swift(data)),
    ]
    outputs.extend(protocol_outputs(ROOT, data))
    release_compatibility = compatibility(ROOT)
    outputs.append((ROOT / "product/generated/companion_compatibility.json", json.dumps(release_compatibility, indent=2) + "\n"))
    outputs.append((ROOT / "docs/generated/companion-compatibility.md",
        "<!-- Generated by scripts/build.py companion. -->\n# Companion compatibility\n\n"
        f"Companion and firmware currently use protocol {release_compatibility['protocolVersion']} "
        f"and capability version {release_compatibility['capabilityVersion']}.\n\n"
        "Supported display: " + ", ".join(release_compatibility['supportedDevices']) + ".\n\n"
        "Install firmware and Companion from the same release. Saved panel configuration remains version "
        f"{release_compatibility['savedPanelConfigVersion']}. Protocol compatibility is separate from saved configuration.\n\n"
        "Each release includes companion-compatibility.json with the source revision, contract digest, "
        "and SHA-256 checksums of the matching firmware and Mac artifacts. Automated tests do not assert "
        "physical device validation. Independent Mac/firmware release delivery is not yet enabled.\n"))
    manifest = {
        "source": str(COMPANION_CAPABILITIES_JSON.relative_to(ROOT)),
        "generator": "python3 scripts/build.py companion",
        "outputs": [str(path.relative_to(ROOT)) for path, _content in outputs],
    }
    outputs.append((COMPANION_GENERATED_MANIFEST, json.dumps(manifest, indent=2) + "\n"))
    dirty = [path.relative_to(ROOT) for path, content in outputs if not path.exists() or path.read_text() != content]
    if check_only:
        if dirty:
            print("Companion capability outputs are out of sync. Run 'python scripts/build.py companion' to fix:")
            for path in dirty:
                print(f"  {path}")
        return dirty
    for path, content in outputs:
        if not path.exists() or path.read_text() != content:
            write_generated_text(path, content)
    return dirty


# ===========================================================================
# Card config contract generation
# ===========================================================================

def js_string_list(values):
    return "[" + ", ".join(json.dumps(v) for v in values) + "]"


def contract_option_names(data):
    names = {}
    for name in data.get("optionNames", []):
        if name:
            names[name] = name
    for card in data["cards"].values():
        for option in card.get("options", []):
            name = option.get("name")
            if name:
                names[name] = name
            for storage_name in option.get("storage", []):
                names[storage_name] = storage_name
    return dict(sorted(names.items()))


def option_constant_name(option_name):
    return "CARD_CONTRACT_OPTION_NAME_" + re.sub(r"[^A-Za-z0-9]+", "_", option_name).strip("_").upper()


def gen_card_contract_ts(data):
    groups = data["cardGroups"]
    fan = groups["fan"]
    fan_default_icons = {card_type: cfg["defaultIcon"] for card_type, cfg in fan.items()}
    fan_default_icon_on = {card_type: cfg["defaultIconOn"] for card_type, cfg in fan.items() if cfg.get("defaultIconOn")}
    codes = data["subpageTypeCodes"]
    code_to_type = {code: card_type for card_type, code in codes.items()}
    large = data["largeNumbers"]
    cards = json.loads(json.dumps(data["cards"]))
    # Hook implementation data is only needed by generated shadow helpers. Keep
    # it out of the production browser bundle until a family is switched over.
    for card in cards.values():
        normalization = card.get("normalization")
        if normalization:
            normalization.pop("hookData", None)
    aliases = data.get("migrationAliases", {})
    option_names = contract_option_names(data)
    return (
        "// =============================================================================\n"
        "// GENERATED TYPED CARD CONFIG CONTRACT - do not edit by hand\n"
        "// Generated by scripts/build.py from product/v2/card_contract.json.\n"
        "// =============================================================================\n"
        "import type { CardConfig, CardOptionSpec, CardRuntimeSpec, CardTypeSpec, MigrationActionSpec, ResolvedCardRuntimeSpec, SavedConfigField } from \"../contracts/types\";\n"
        "\n"
        "type LargeNumbersRule = true | {\n"
        "  readonly precisions?: readonly string[];\n"
        "  readonly excludedPrecisions?: readonly string[];\n"
        "};\n"
        "\n"
        f"export const CARD_CONTRACT_VERSION = {int(data['contractVersion'])} as const;\n"
        f"export const CARD_CONTRACT_NORMALIZATION_HOOKS = {js_string_list(data['normalizationHooks'])} as const;\n"
        f"export const CARD_CONTRACT_MIGRATION_ACTIONS: Readonly<Record<string, MigrationActionSpec>> = {json.dumps(data['migrationActions'], indent=2)};\n"
        f"export const CARD_CONTRACT_RETIRED_SUBPAGE_TYPE_CODES = {js_string_list(data['retiredSubpageTypeCodes'])} as const;\n"
        f"export const CARD_CONFIG_FIELDS = {json.dumps(data['fields'])} as const satisfies readonly SavedConfigField[];\n"
        f"export const CARD_CONTRACT_CARDS: Readonly<Record<string, CardTypeSpec>> = {json.dumps(cards, indent=2)};\n"
        f"export const CARD_RUNTIME_SPECS: Readonly<Record<string, CardRuntimeSpec>> = {json.dumps(data['runtime']['specs'], indent=2)};\n"
        f"export const CARD_CONTRACT_MIGRATION_ALIASES: Readonly<Record<string, Partial<CardConfig>>> = {json.dumps(aliases, indent=2)};\n"
        f"export const CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES = {js_string_list(groups['brightnessSlider'])} as const;\n"
        f"export const CARD_CONTRACT_FAN_DEFAULT_ICONS: Readonly<Record<string, string>> = {json.dumps(fan_default_icons, indent=2)};\n"
        f"export const CARD_CONTRACT_FAN_DEFAULT_ICON_ON: Readonly<Record<string, string>> = {json.dumps(fan_default_icon_on, indent=2)};\n"
        f"export const CARD_CONTRACT_OPTION_SELECT_ACTION = {json.dumps(data['optionSelect']['canonicalAction'])};\n"
        f"export const CARD_CONTRACT_OPTION_SELECT_ACTIONS = {js_string_list(data['optionSelect']['actions'])} as const;\n"
        f"export const CARD_CONTRACT_SUBPAGE_TYPE_CODES: Readonly<Record<string, string>> = {json.dumps(codes, indent=2)};\n"
        f"export const CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE: Readonly<Record<string, string>> = {json.dumps(code_to_type, indent=2)};\n"
        f"export const CARD_CONTRACT_LARGE_NUMBERS: Readonly<Record<string, LargeNumbersRule>> = {json.dumps(large, indent=2)};\n"
        f"export const CARD_CONTRACT_OPTION_NAMES: Readonly<Record<string, string>> = {json.dumps(option_names, indent=2)};\n"
        "\n"
        "function cardContractListContains(list: readonly string[] | undefined, value: string): boolean {\n"
        "  return (list || []).indexOf(value) >= 0;\n"
        "}\n"
        "\n"
        "export function cardContractCard(type: string | null | undefined): CardTypeSpec | null {\n"
        "  return CARD_CONTRACT_CARDS[type || \"\"] || null;\n"
        "}\n"
        "\n"
        "export function cardContractCardKeys(): string[] {\n"
        "  return Object.keys(CARD_CONTRACT_CARDS);\n"
        "}\n"
        "\n"
        "export function cardRuntimeSpec(type: string | null | undefined): CardRuntimeSpec | null {\n"
        "  return CARD_RUNTIME_SPECS[type || \"\"] || null;\n"
        "}\n"
        "\n"
        "export function resolveCardRuntimeSpec(config: CardConfig): ResolvedCardRuntimeSpec | null {\n"
        "  const spec = cardRuntimeSpec(config.type);\n"
        "  if (!spec) return null;\n"
        "  let driver = spec.driver;\n"
        "  if (spec.modeField && spec.modes) {\n"
        "    driver = spec.modes[config[spec.modeField] || \"\"] || spec.defaultDriver || driver;\n"
        "  }\n"
        "  return Object.assign({}, spec, { driver });\n"
        "}\n"
        "\n"
        "export function cardContractCardLabel(type: string | null | undefined): string {\n"
        "  const card = cardContractCard(type);\n"
        "  return card ? card.label : (type || \"Switch\");\n"
        "}\n"
        "\n"
        "export function cardContractAllowInSubpage(type: string | null | undefined): boolean {\n"
        "  const card = cardContractCard(type);\n"
        "  return !!(card && card.allowInSubpage);\n"
        "}\n"
        "\n"
        "export function cardContractPickerKey(type: string | null | undefined): string {\n"
        "  const card = cardContractCard(type);\n"
        "  return card && card.pickerKey ? card.pickerKey : \"\";\n"
        "}\n"
        "\n"
        "export function cardContractHidden(type: string | null | undefined): boolean {\n"
        "  const card = cardContractCard(type);\n"
        "  return !!(card && card.hidden);\n"
        "}\n"
        "\n"
        "export function cardContractOptions(type: string | null | undefined): CardOptionSpec[] {\n"
        "  const card = cardContractCard(type);\n"
        "  return card && card.options ? JSON.parse(JSON.stringify(card.options)) as CardOptionSpec[] : [];\n"
        "}\n"
        "\n"
        "export function cardContractDefaultConfig(type: string | null | undefined): CardConfig {\n"
        "  const card = cardContractCard(type);\n"
        "  const defaults = card && card.default ? card.default : CARD_CONTRACT_CARDS[\"\"]!.default;\n"
        "  return Object.assign({}, defaults);\n"
        "}\n"
        "\n"
        "export function cardContractDomains(type: string | null | undefined): string[] {\n"
        "  const card = cardContractCard(type);\n"
        "  return card && card.domains ? card.domains.slice() : [];\n"
        "}\n"
        "\n"
        "export function cardContractMigrationAlias(type: string | null | undefined): Partial<CardConfig> | null {\n"
        "  const alias = CARD_CONTRACT_MIGRATION_ALIASES[type || \"\"];\n"
        "  return alias ? Object.assign({}, alias) : null;\n"
        "}\n"
        "\n"
        "export function cardContractIsBrightnessSliderType(type: string): boolean {\n"
        "  return cardContractListContains(CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES, type);\n"
        "}\n"
        "\n"
        "export function cardContractIsFanCardType(type: string | null | undefined): boolean {\n"
        "  return Object.prototype.hasOwnProperty.call(CARD_CONTRACT_FAN_DEFAULT_ICONS, type || \"\");\n"
        "}\n"
        "\n"
        "export function cardContractFanDefaultIcon(type: string): string {\n"
        "  return CARD_CONTRACT_FAN_DEFAULT_ICONS[type] || CARD_CONTRACT_FAN_DEFAULT_ICONS.fan_speed || \"Fan Speed 2\";\n"
        "}\n"
        "\n"
        "export function cardContractFanDefaultIconOn(type: string): string {\n"
        "  return CARD_CONTRACT_FAN_DEFAULT_ICON_ON[type] || \"Auto\";\n"
        "}\n"
        "\n"
        "export function cardContractIsOptionSelectType(type: string): boolean {\n"
        "  return type === \"option_select\";\n"
        "}\n"
        "\n"
        "export function cardContractIsOptionSelectAction(action: string): boolean {\n"
        "  return cardContractListContains(CARD_CONTRACT_OPTION_SELECT_ACTIONS, action);\n"
        "}\n"
        "\n"
        "export function cardContractSubpageTypeCode(type: string | null | undefined): string {\n"
        "  return CARD_CONTRACT_SUBPAGE_TYPE_CODES[type || \"\"] || (type || \"\");\n"
        "}\n"
        "\n"
        "export function cardContractSubpageTypeFromCode(code: string | null | undefined): string {\n"
        "  return CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE[code || \"\"] || (code || \"\");\n"
        "}\n"
        "\n"
        "export function cardContractLargeNumbersSupported(type: string | null | undefined, precision: string): boolean {\n"
        "  const rule = CARD_CONTRACT_LARGE_NUMBERS[type || \"\"];\n"
        "  if (rule === true) return true;\n"
        "  if (!rule) return false;\n"
        "  if (rule.excludedPrecisions) return !cardContractListContains(rule.excludedPrecisions, precision || \"\");\n"
        "  if (rule.precisions) return cardContractListContains(rule.precisions, precision || \"\");\n"
        "  return false;\n"
        "}\n"
        "\n"
        "export function cardContractOptionName(name: string | null | undefined): string {\n"
        "  return CARD_CONTRACT_OPTION_NAMES[name || \"\"] || name || \"\";\n"
        "}\n"
    )


def shadow_pilot_policies(data):
    pilot_types = ("action", "sensor", "media", "vacuum")
    return {
        card_type: data["cards"][card_type]["normalization"]
        for card_type in pilot_types
    }






































































































































def cpp_shadow_policy_kind(policy):
    return {
        "keep": "KEEP", "clear": "CLEAR", "default": "DEFAULT_VALUE",
        "allowed": "ALLOWED", "alias": "ALIAS", "hook": "HOOK",
    }[policy]




def cpp_string_array(name, values):
    quoted = ", ".join(json.dumps(v) for v in values)
    return f"inline const char *const {name}[] = {{{quoted}}};\n"


def contract_card_option(cards, card_type, option_name):
    for option in cards[card_type].get("options", []):
        if option.get("name") == option_name:
            return option
    raise KeyError(f"Missing {card_type}.{option_name} option metadata")


def contract_card_option_values(cards, card_type, option_name):
    return contract_card_option(cards, card_type, option_name).get("values", [])


def contract_card_option_default(cards, card_type, option_name):
    return contract_card_option(cards, card_type, option_name).get("defaultValue", "")


def contract_card_option_int(cards, card_type, option_name, key):
    return int(contract_card_option(cards, card_type, option_name).get(key, 0))


def runtime_enum_name(value, empty_name="SWITCH"):
    if not value:
        return empty_name
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").upper()


def runtime_capability_enum_name(value):
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    return f"CAPABILITY_{runtime_enum_name(words)}"


def gen_card_runtime_h(data):
    runtime = data["runtime"]
    specs = runtime["specs"]
    capabilities = runtime["capabilities"]
    lines = [
        "namespace espdesktop::card_runtime {\n",
        "\n",
        "enum class CardTypeId : uint8_t {\n",
    ]
    for card_type in specs:
        lines.append(f"  {runtime_enum_name(card_type)},\n")
    lines.extend([
        "  UNKNOWN,\n",
        "};\n",
        "\n",
        "enum class CardDriverId : uint8_t {\n",
    ])
    for driver in runtime["drivers"]:
        lines.append(f"  {runtime_enum_name(driver)},\n")
    lines.extend([
        "  UNKNOWN,\n",
        "};\n",
        "\n",
        "enum CardCapabilityFlag : uint16_t {\n",
        "  CAPABILITY_NONE = 0,\n",
    ])
    for index, capability in enumerate(capabilities):
        lines.append(f"  {runtime_capability_enum_name(capability)} = 1u << {index},\n")
    lines.extend([
        "};\n",
        "\n",
        "struct CardRuntimeSpec {\n",
        "  CardTypeId type = CardTypeId::UNKNOWN;\n",
        "  CardDriverId driver = CardDriverId::UNKNOWN;\n",
        "  uint16_t capabilities = CAPABILITY_NONE;\n",
        "};\n",
        "\n",
        "constexpr bool has_capability(const CardRuntimeSpec &spec, CardCapabilityFlag capability) {\n",
        "  return (spec.capabilities & static_cast<uint16_t>(capability)) != 0;\n",
        "}\n",
        "\n",
        "inline CardTypeId card_type_id(const std::string &type) {\n",
    ])
    for card_type in specs:
        condition = "type.empty()" if not card_type else f"type == {json.dumps(card_type)}"
        lines.append(f"  if ({condition}) return CardTypeId::{runtime_enum_name(card_type)};\n")
    lines.extend([
        "  return CardTypeId::UNKNOWN;\n",
        "}\n",
        "\n",
        "inline CardRuntimeSpec card_runtime_spec(CardTypeId type) {\n",
        "  switch (type) {\n",
    ])
    for card_type, spec in specs.items():
        enabled = [
            runtime_capability_enum_name(capability)
            for capability in capabilities
            if spec["capabilities"][capability]
        ]
        mask = " | ".join(enabled) if enabled else "CAPABILITY_NONE"
        lines.append(
            f"    case CardTypeId::{runtime_enum_name(card_type)}: return "
            f"{{type, CardDriverId::{runtime_enum_name(spec['driver'])}, static_cast<uint16_t>({mask})}};\n"
        )
    lines.extend([
        "    default: return {};\n",
        "  }\n",
        "}\n",
        "\n",
        "inline CardDriverId resolve_card_driver(CardTypeId type, const std::string &mode) {\n",
        "  switch (type) {\n",
    ])
    mode_specs = []
    for card_type, spec in specs.items():
        if "modeField" not in spec:
            continue
        mode_specs.append((card_type, spec))
        lines.append(f"    case CardTypeId::{runtime_enum_name(card_type)}:\n")
        for mode, driver in spec["modes"].items():
            lines.append(f"      if (mode == {json.dumps(mode)}) return CardDriverId::{runtime_enum_name(driver)};\n")
        lines.append(f"      return CardDriverId::{runtime_enum_name(spec['defaultDriver'])};\n")
    lines.extend([
        "    default: return card_runtime_spec(type).driver;\n",
        "  }\n",
        "}\n",
        "\n",
        "template<typename Config>\n",
        "inline CardRuntimeSpec resolve_card_runtime(const Config &config) {\n",
        "  CardRuntimeSpec spec = card_runtime_spec(card_type_id(config.type));\n",
        "  switch (spec.type) {\n",
    ])
    for card_type, spec in mode_specs:
        lines.extend([
            f"    case CardTypeId::{runtime_enum_name(card_type)}:\n",
            f"      spec.driver = resolve_card_driver(spec.type, config.{spec['modeField']});\n",
            "      break;\n",
        ])
    lines.extend([
        "    default:\n",
        "      break;\n",
        "  }\n",
        "  return spec;\n",
        "}\n",
        "\n",
        "}  // namespace espdesktop::card_runtime\n",
        "\n",
    ])
    return "".join(lines)


def gen_card_contract_h(data):
    lines = ["#pragma once\n#include <cstdint>\n#include <string>\n",
             "// Generated by scripts/build.py; edit product/v2/cards instead.\n",
             f"constexpr int CARD_CONTRACT_VERSION = {data['contractVersion']};\n",
             gen_card_runtime_h(data)]
    def mapping(name, parameter, values, fallback):
        lines.append(f"inline const char *{name}(const std::string &{parameter}) {{\n")
        for key, value in values.items():
            lines.append(f"  if ({parameter} == {json.dumps(key)}) return {json.dumps(value)};\n")
        lines.append(f"  return {json.dumps(fallback)};\n}}\n")
    mapping("card_contract_card_label", "type", {k:v["label"] for k,v in data["cards"].items()}, "")
    mapping("card_contract_default_icon_name", "type", {k:v["default"]["icon"] for k,v in data["cards"].items()}, "Auto")
    mapping("card_contract_default_icon_on_name", "type", {k:v["default"]["icon_on"] for k,v in data["cards"].items()}, "Auto")
    mapping("card_contract_subpage_type_from_code", "code", {v:k for k,v in data["subpageTypeCodes"].items()}, "")
    lines.append("inline bool card_contract_allow_in_subpage(const std::string &type) {\n  return " +
                 " || ".join(f"type == {json.dumps(k)}" for k,v in data["cards"].items() if v["allowInSubpage"]) + ";\n}\n")
    for name, value in contract_option_names(data).items():
        lines.append(f"constexpr const char *{option_constant_name(name)} = {json.dumps(value)};\n")
    return "".join(lines)


def generated_card_markdown_header(kind):
    return (
        "<!-- =============================================================================\n"
        f"GENERATED {kind} - do not edit by hand\n"
        "Generated by scripts/build.py from product/v2/card_contract.json.\n"
        "============================================================================= -->\n\n"
    )


def markdown_table_cell(value):
    return str(value).replace("|", "\\|").replace("\n", "<br>")


def card_doc_type_name(card_type):
    return card_type or "switch"


def summarize_card_options(card):
    options = []
    for option in card.get("options", []):
        if option.get("docsHidden"):
            continue
        label = option.get("label") or option["name"]
        values = option.get("values") or []
        if values:
            display_values = [value or "default" for value in values]
            options.append(f"{label}: {', '.join(display_values)}")
        elif option.get("kind") == "number":
            min_value = option.get("min")
            max_value = option.get("max")
            if min_value is not None and max_value is not None:
                options.append(f"{label}: {min_value}-{max_value}")
            else:
                options.append(label)
        else:
            options.append(label)
    return "; ".join(options) if options else "None"


def summarize_card_status(card):
    if card.get("hidden"):
        return "Hidden"
    return "Visible"


def summarize_picker_group(card_type, card, cards):
    picker_key = card.get("pickerKey")
    if not picker_key:
        return "Own picker item"
    picker_label = cards.get(picker_key, {}).get("label") or card_doc_type_name(picker_key)
    return f"{picker_label} ({card_doc_type_name(picker_key)})"


def gen_card_capability_docs(data):
    cards = data["cards"]
    lines = [
        generated_card_markdown_header("CARD CAPABILITIES"),
        "# Card Capability Reference\n\n",
        "This generated reference lists stable setup facts from the shared card contract. "
        "Explanations, screenshots, and card-specific guidance stay in the hand-written card docs.\n\n",
        "| Card | Type | Entity domains | Subpages | Picker grouping | Main modes and options | Status |\n",
        "|---|---|---|---|---|---|---|\n",
    ]
    for card_type, card in cards.items():
        domains = ", ".join(card.get("domains") or []) or "None"
        row = [
            card["label"],
            card_doc_type_name(card_type),
            domains,
            "Yes" if card.get("allowInSubpage") else "No",
            summarize_picker_group(card_type, card, cards),
            summarize_card_options(card),
            summarize_card_status(card),
        ]
        lines.append("| " + " | ".join(markdown_table_cell(value) for value in row) + " |\n")
    return "".join(lines)


def sync_card_contract(check_only=False):
    data = load_card_contract_data()
    assert_card_contract_valid(data)
    outputs = [
        (CARD_CONTRACT_TS, gen_card_contract_ts(data)),
        (CARD_CONTRACT_H, gen_card_contract_h(data)),
        (CARD_DOCS_DIR / "capabilities.md", gen_card_capability_docs(data)),
    ]
    dirty = []
    for path, content in outputs:
        if not path.exists() or path.read_text() != content:
            dirty.append(path.relative_to(ROOT))

    if check_only:
        if dirty:
            print("Card contract outputs are out of sync. Run 'python scripts/build.py contract' to fix:")
            for rel in dirty:
                print(f"  {rel}")
        return dirty

    for path, content in outputs:
        if path.exists() and path.read_text() == content:
            continue
        write_generated_text(path, content)
    return dirty


# ===========================================================================
# Public device capability generation
# ===========================================================================

def gen_device_capabilities_json():
    return json.dumps(public_device_capabilities(), indent=2) + "\n"


def generated_markdown_header(kind):
    return (
        "<!-- =============================================================================\n"
        f"GENERATED {kind} - do not edit by hand\n"
        "Generated by scripts/build.py from devices/manifest.json.\n"
        "============================================================================= -->\n\n"
    )


def screen_doc_stem(capability):
    return capability["docsPath"].rstrip("/").split("/")[-1]


def gen_device_grid_snippet(capability):
    rows = capability["grid"]["rows"]
    cols = capability["grid"]["cols"]
    slots = capability["slots"]
    if capability.get("subpages", True):
        layout_text = (
            f"The home screen uses a **{rows}-row x {cols}-column** grid, giving you "
            f"**{slots} card slots**. Any home-screen card can be turned into a "
            f"[Subpage](/features/subpages) folder containing up to {slots - 1} more cards.\n\n"
        )
    else:
        layout_text = (
            f"The home screen uses a **{rows}-row x {cols}-column** grid, giving you "
            f"**{slots} card slots**. Touch subpages are not available on this device.\n\n"
        )
    return (
        generated_markdown_header("SCREEN GRID CAPABILITIES") +
        layout_text +
        "Flexible card sizes are supported: Single, Tall, Wide, and Large.\n"
    )


def gen_device_install_snippet(capability):
    return (
        generated_markdown_header("SCREEN INSTALL BUTTON") +
        f'<EspInstallButton slug="{capability["installSlug"]}" />\n'
    )


def device_docs_outputs(capabilities):
    outputs = {}
    for capability in capabilities["devices"]:
        stem = screen_doc_stem(capability)
        outputs[DEVICE_DOCS_DIR / f"{stem}-grid.md"] = gen_device_grid_snippet(capability)
        outputs[DEVICE_DOCS_DIR / f"{stem}-install.md"] = gen_device_install_snippet(capability)
    return outputs


def sync_device_capabilities(check_only=False):
    capabilities = public_device_capabilities()
    outputs = {
        DEVICE_CAPABILITIES_JSON: gen_device_capabilities_json(),
        **device_docs_outputs(capabilities),
    }
    dirty = []
    for path, generated in outputs.items():
        if not path.exists() or path.read_text() != generated:
            dirty.append(path.relative_to(ROOT))

    if check_only:
        if dirty:
            print("Device capability outputs are out of sync. Run 'python scripts/build.py devices' to fix:")
            for rel in dirty:
                print(f"  {rel}")
        return dirty

    for path, generated in outputs.items():
        if path.exists() and path.read_text() == generated:
            continue
        write_generated_text(path, generated)
    return dirty


# ===========================================================================
# Icon sync
# ===========================================================================

def icon_items(data):
    return [data["fallback"], *data.get("structural", []), *data["icons"]]


def load_mdi_codepoints():
    """Load the codepoint map from the same MDI CSS version used by the web UI."""
    try:
        with urllib.request.urlopen(MDI_CSS_URL, timeout=20) as response:
            css = response.read().decode("utf-8")
    except Exception as exc:
        raise BuildError(f"Unable to fetch pinned MDI CSS from {MDI_CSS_URL}: {exc}") from exc

    return {
        match.group(1): match.group(2).upper()
        for match in re.finditer(
            r'\.mdi-([a-z0-9-]+)::before \{\s*content: "\\([0-9A-Fa-f]+)";',
            css,
        )
    }


def web_mdi_icon_codepoints(data):
    """Return the complete local glyph map required by the browser editor."""
    codepoints = {
        item["mdi"]: item["codepoint"].upper()
        for item in icon_items(data)
    }
    codepoints.update(WEB_FIXED_MDI_ICON_CODEPOINTS)
    return codepoints


def web_mdi_icon_names(data, codepoints):
    """Return every MDI glyph the browser editor can render.

    The picker gets its names from the Product Model. A smaller set of fixed
    controls and card badges is written directly in the editor source, so scan
    those string literals too. Filtering them through the pinned MDI map keeps
    unrelated UI text out of the font stylesheet.
    """
    names = {item["mdi"] for item in icon_items(data)}
    for path in WEB_SOURCE_DIR.rglob("*.ts"):
        source = path.read_text(encoding="utf-8")
        names.update(
            match.group(1)
            for match in re.finditer(r"\bmdi-([a-z0-9-]+)\b", source)
            if match.group(1) in codepoints
        )
        names.update(
            match.group(1)
            for match in re.finditer(r"['\"]([a-z][a-z0-9-]*)['\"]", source)
            if match.group(1) in codepoints
        )
    return names


def embedded_web_mdi_styles():
    """Build the local interface and icon font CSS used by the browser bundle.

    Browsers receive this as part of www.js, rather than requesting a CDN
    stylesheet or font after the editor has started. This matters when a display
    is reachable on the local network but cannot reach the Internet.
    """
    if not MDI_WEB_FONT.exists():
        raise BuildError(f"Missing bundled web icon font: {MDI_WEB_FONT.relative_to(ROOT)}")
    if not INTER_WEB_FONT.exists():
        raise BuildError(f"Missing bundled web interface font: {INTER_WEB_FONT.relative_to(ROOT)}")
    if not ROBOTO_WEB_FONT.exists():
        raise BuildError(f"Missing bundled web preview font: {ROBOTO_WEB_FONT.relative_to(ROOT)}")
    if not SUPPORT_BUTTON_IMAGE.exists():
        raise BuildError(f"Missing bundled support button image: {SUPPORT_BUTTON_IMAGE.relative_to(ROOT)}")

    data = load_json(ICONS_JSON)
    codepoints = web_mdi_icon_codepoints(data)
    icon_names = web_mdi_icon_names(data, codepoints)
    missing = sorted(name for name in icon_names if name not in codepoints)
    if missing:
        raise BuildError("Missing MDI codepoints for browser icons: " + ", ".join(missing))

    interface_font_data = base64.b64encode(INTER_WEB_FONT.read_bytes()).decode("ascii")
    preview_font_data = base64.b64encode(ROBOTO_WEB_FONT.read_bytes()).decode("ascii")
    support_button_image_data = base64.b64encode(SUPPORT_BUTTON_IMAGE.read_bytes()).decode("ascii")
    icon_font_data = base64.b64encode(MDI_WEB_FONT.read_bytes()).decode("ascii")
    css = [
        "@font-face{font-family:'Roboto';src:url(data:font/woff2;base64,",
        preview_font_data,
        ") format('woff2');font-weight:100 900;font-style:normal;font-display:swap}",
        ".sp-support-link{background:center/contain no-repeat url(data:image/png;base64,",
        support_button_image_data,
        ")}",
        "@font-face{font-family:'Inter';src:url(data:font/woff2;base64,",
        interface_font_data,
        ") format('woff2');font-weight:100 900;font-style:normal;font-display:swap}",
        "@font-face{font-family:'Material Design Icons';src:url(data:font/ttf;base64,",
        icon_font_data,
        ") format('truetype');font-weight:normal;font-style:normal;font-display:block}",
        ".mdi{display:inline-block;font-family:'Material Design Icons';font-weight:normal;font-style:normal;line-height:1;text-rendering:auto;-webkit-font-smoothing:antialiased}",
        ".mdi::before{display:inline-block}",
    ]
    css.extend(
        f".mdi-{name}::before{{content:'\\{codepoints[name]}'}}"
        for name in sorted(icon_names)
    )
    return "".join(css)


def check_duplicate_icon_fields(data):
    errors = []
    seen = {}
    for item in icon_items(data):
        seen.setdefault(item["name"], []).append(item["mdi"])
    for name, mdi_names in seen.items():
        if len(mdi_names) > 1:
            errors.append(f"duplicate name {name!r}: {', '.join(mdi_names)}")
    return errors


def normalize_icon_codepoint(value):
    return value.upper().lstrip("0") or "0"


def check_firmware_icon_literals(data):
    """Catch raw firmware icon literals that are missing from the device font subset."""
    known_codepoints = {
        normalize_icon_codepoint(item["codepoint"])
        for item in icon_items(data)
    }
    errors = []
    for path in sorted((ROOT / "components" / "espdesktop").glob("*.h")):
        if path.name == "icons.h":
            continue
        text = path.read_text()
        for match in re.finditer(r"\\U([0-9A-Fa-f]{8})", text):
            codepoint = normalize_icon_codepoint(match.group(1))
            if codepoint in known_codepoints:
                continue
            line_no = text.count("\n", 0, match.start()) + 1
            errors.append(
                f"{path.relative_to(ROOT)}:{line_no} uses U+{codepoint:0>8s} "
                f"but it is not in {ICONS_JSON.relative_to(ROOT)}"
            )
    return errors


def check_mdi_versions():
    """Make sure the browser CSS and device font URLs stay on the same MDI version."""
    files = [
        ROOT / "src" / "webserver" / "application" / "app.ts",
        ROOT / "common" / "assets" / "icons.yaml",
        *sorted(ROOT.glob("devices/*/device/device.yaml")),
        *sorted(ROOT.glob("devices/*/dev.yaml")),
        *sorted(ROOT.glob("builds/*.yaml")),
    ]
    version_re = re.compile(
        r"(?:@mdi/font@|MaterialDesign-Webfont/raw/v|materialdesignicons\.com/cdn/|materialdesignicons-webfont-)"
        r"([0-9]+(?:\.[0-9]+)+)"
    )
    errors = []
    for path in files:
        versions = set(version_re.findall(path.read_text()))
        if versions and versions != {MDI_VERSION}:
            rel = path.relative_to(ROOT)
            errors.append(f"{rel} references MDI version(s) {', '.join(sorted(versions))}, expected {MDI_VERSION}")
    return errors


def validate_icon_data(data):
    """Verify icons.json matches the pinned Material Design Icons release."""
    errors = []
    errors.extend(check_duplicate_icon_fields(data))
    errors.extend(check_mdi_versions())
    errors.extend(check_firmware_icon_literals(data))

    mdi_codepoints = load_mdi_codepoints()
    for item in icon_items(data):
        mdi = item["mdi"]
        expected = mdi_codepoints.get(mdi)
        actual = item["codepoint"].upper()
        if expected is None:
            errors.append(f"{item['name']} references missing mdi-{mdi}")
        elif actual != expected:
            errors.append(f"{item['name']} / mdi-{mdi}: icons.json={actual}, MDI {MDI_VERSION}={expected}")

    for mdi, actual in WEB_FIXED_MDI_ICON_CODEPOINTS.items():
        expected = mdi_codepoints.get(mdi)
        if expected is None:
            errors.append(f"browser fixed icon mdi-{mdi} is missing from MDI {MDI_VERSION}")
        elif actual != expected:
            errors.append(
                f"browser fixed icon mdi-{mdi}: local={actual}, MDI {MDI_VERSION}={expected}"
            )

    source_icons = web_mdi_icon_names(data, mdi_codepoints)
    local_icons = web_mdi_icon_codepoints(data)
    missing_local_icons = sorted(source_icons - local_icons.keys())
    if missing_local_icons:
        errors.append(
            "browser icon codepoint map is missing: " + ", ".join(f"mdi-{name}" for name in missing_local_icons)
        )

    return errors


def assert_icon_data_valid(data):
    errors = validate_icon_data(data)
    if not errors:
        return

    print(f"Icon data does not match Material Design Icons {MDI_VERSION}:")
    for error in errors:
        print(f"  {error}")
    raise BuildError("Icon validation failed.")


# ===========================================================================
# Icon sync (formerly sync_icons.py)
# ===========================================================================

def gen_icon_glyphs(data):
    """Font glyph codepoint list for LVGL font subsetting."""
    fb = data["fallback"]
    seen_codepoints = {fb["codepoint"]}
    lines = [f'- "\\U{fb["codepoint"]:>08s}"  # mdi-{fb["mdi"]} (Auto fallback)\n']
    for icon in data.get("structural", []):
        if icon["codepoint"] in seen_codepoints:
            continue
        seen_codepoints.add(icon["codepoint"])
        comment = icon.get("comment", "")
        suffix = f" ({comment})" if comment else ""
        lines.append(f'- "\\U{icon["codepoint"]:>08s}"  # mdi-{icon["mdi"]}{suffix}\n')
    for icon in data["icons"]:
        if icon["codepoint"] in seen_codepoints:
            continue
        seen_codepoints.add(icon["codepoint"])
        cp = icon["codepoint"]
        lines.append(f'- "\\U{cp:>08s}"  # mdi-{icon["mdi"]}\n')
    return "".join(lines)


def gen_icons_h_entries(data):
    """C++ IconEntry array initializers for icons.h."""
    firmware_icons = [*data.get("structural", []), *data["icons"]]
    max_name_len = max(len(i["name"]) for i in firmware_icons)
    lines = []
    for icon in firmware_icons:
        padded = f'"{icon["name"]}",'
        padded = padded.ljust(max_name_len + 3)
        lines.append(f'    {{{padded} "\\U{icon["codepoint"]:>08s}"}},\n')
    return "".join(lines)


def gen_icons_h_domain_icons(data):
    """C++ early-return chain for domain default icons in icons.h."""
    icon_by_name = {i["name"]: i for i in data["icons"]}
    entries = list(data["domain_defaults"].items())
    target_col = 46
    lines = []
    for domain, icon_name in entries:
        icon = icon_by_name[icon_name]
        cp = icon["codepoint"]
        prefix = f'  if (domain == "{domain}")'
        pad = max(target_col - len(prefix), 1)
        lines.append(
            f'{prefix}{" " * pad}'
            f'return "\\U{cp:>08s}";  // {icon_name}\n'
        )
    return "".join(lines)


def gen_web_icon_module(data):
    """Typed icon names and exception map for the web bundle."""
    fb = data["fallback"]
    exceptions = [f'    Auto: "{fb["mdi"]}",\n']
    names = [icon["name"] for icon in data["icons"]]

    # Saved cards can also reference structural icons used by firmware defaults.
    for icon in icon_items(data):
        name = icon["name"]
        mdi = icon["mdi"]
        expected = re.sub(r"[^a-z0-9 ]", "", name.lower()).replace(" ", "-")
        if expected != mdi:
            key = name if re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*$", name) else f'"{name}"'
            exceptions.append(f'    {key}: "{mdi}",\n')

    lines = ["export const GENERATED_ICON_EXCEPTIONS: Readonly<Record<string, string>> = {\n"]
    lines.extend(exceptions)
    lines.append("};\n")
    lines.append("export const GENERATED_ICON_NAMES: readonly string[] = [\n")
    for i in range(0, len(names), 6):
        chunk = names[i : i + 6]
        formatted = ", ".join(f'"{n}"' for n in chunk)
        lines.append(f"    {formatted},\n")
    lines.append("  ];\n")
    return "".join(lines)


def gen_web_domain_icon_module(data):
    """Typed domain-to-icon map for the web bundle."""
    icon_by_name = {i["name"]: i for i in data["icons"]}
    lines = ["export const GENERATED_DOMAIN_ICONS: Readonly<Record<string, string>> = {\n"]
    for domain, icon_name in data["domain_defaults"].items():
        mdi = icon_by_name[icon_name]["mdi"]
        lines.append(f'  {domain}: "{mdi}",\n')
    lines.append("};\n")
    return "".join(lines)


def sync_icons(check_only=False):
    """Sync icon data from icons.json into all downstream files."""
    data = load_json(ICONS_JSON)
    assert_icon_data_valid(data)
    dirty = []

    icons_h = ROOT / "components" / "espdesktop" / "icons.h"
    icon_glyphs = ROOT / "common" / "assets" / "icon_glyphs.yaml"
    web_icons = WEB_ICONS_TS

    patches = [
        (icon_glyphs, "GENERATED:ICONS START", "GENERATED:ICONS END", gen_icon_glyphs),
        (icons_h, "GENERATED:ICONS START", "GENERATED:ICONS END", gen_icons_h_entries),
        (icons_h, "GENERATED:DOMAIN_ICONS START", "GENERATED:DOMAIN_ICONS END", gen_icons_h_domain_icons),
        (web_icons, "GENERATED:ICONS START", "GENERATED:ICONS END", gen_web_icon_module),
        (web_icons, "GENERATED:DOMAIN_ICONS START", "GENERATED:DOMAIN_ICONS END", gen_web_domain_icon_module),
    ]

    file_contents = {}
    for path, start_tag, end_tag, generator in patches:
        if path not in file_contents:
            file_contents[path] = path.read_text()
        old = file_contents[path]
        new_content = generator(data)
        updated = replace_between_markers(old, start_tag, end_tag, new_content)
        if updated != old:
            file_contents[path] = updated
            dirty.append((path.relative_to(ROOT), start_tag))

    if check_only:
        if dirty:
            print("Icon data is out of sync. Run 'python scripts/build.py icons' to fix:")
            for rel, tag in dirty:
                print(f"  {rel} ({tag})")
        return dirty

    for path, content in file_contents.items():
        original = path.read_text()
        if content != original:
            write_generated_text(path, content)
    return dirty


# ===========================================================================
# www.js build (formerly build_www.py)
# ===========================================================================

WWW_OUTPUT_DIR = ROOT / "docs" / "public" / "webserver"
TIME_YAML = ROOT / "common" / "addon" / "time.yaml"


def build_web_devices():
    timezone_options = load_timezone_options()
    devices = {
        slug: web_config(profile)
        for slug, profile in load_device_profiles().items()
    }
    for cfg in devices.values():
        cfg["timezoneOptions"] = timezone_options
    return devices


def load_timezone_options():
    options = []
    for _line_no, option in load_timezone_select_options():
        if option == AUTO_TIMEZONE_OPTION or timezone_option_id(option) is not None:
            options.append(option)
    if not options:
        raise BuildError(f"No timezone options found in {TIME_YAML.relative_to(ROOT)}")
    return options


def build_www(check_only=False, output_dir=None, test_hooks=False):
    """Build one shared www.js containing the validated device profiles."""
    devices = build_web_devices()
    embedded_mdi_styles = embedded_web_mdi_styles()
    temporary_root = None
    if output_dir is None:
        temporary_root = tempfile.TemporaryDirectory(prefix="espdesktop-www-")
        build_root = Path(temporary_root.name)
    else:
        build_root = Path(output_dir).resolve()
        build_root.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "build_web_bundle.js")],
        input=json.dumps({
            "outputDir": str(build_root),
            "devices": devices,
            "embeddedMdiStyles": embedded_mdi_styles,
            "testHooks": test_hooks,
            "overlays": GENERATED_TRANSACTION.overlays() if GENERATED_TRANSACTION is not None else {},
        }),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        if temporary_root:
            temporary_root.cleanup()
        raise BuildError(result.stderr.strip() or "esbuild failed while building web bundles")

    bundle_text = (build_root / "app.js").read_text()
    embedded_text = (build_root / "embedded.js").read_text()
    bridge_text = (build_root / "www.js").read_text()
    bundle_sha256 = hashlib.sha256(bundle_text.encode("utf-8")).hexdigest()
    bundle_relative_path = Path("bundles") / bundle_sha256 / "www.js"
    manifest_text = json.dumps({
        "schemaVersion": 1,
        "bundles": [{
            "id": bundle_sha256,
            "sha256": bundle_sha256,
            "path": bundle_relative_path.as_posix(),
            "deviceProfiles": list(devices),
            "firmwareVersions": list(WEB_ASSET_SUPPORTED_FIRMWARE_VERSIONS),
            "webAssetVersion": 1,
        }],
    }, indent=2) + "\n"

    outputs = [(build_root / "www.js", bridge_text)]
    outputs.extend(
        (build_root / slug / "www.js", (build_root / slug / "www.js").read_text())
        for slug in devices
    )
    outputs.extend([
        (build_root / "embedded" / "www.js", embedded_text),
        (build_root / bundle_relative_path, bundle_text),
        (build_root / "web-assets.json", manifest_text),
    ])

    if output_dir is not None:
        for path, generated in outputs:
            if not path.exists() or path.read_text() != generated:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(generated, encoding="utf-8")
        print(f"Built shared www.js bundle, immutable asset, and {len(devices)} compatibility loader(s) in {build_root}")
        return []

    outputs = [
        (WWW_OUTPUT_DIR / path.relative_to(build_root), generated)
        for path, generated in outputs
    ]
    dirty = [
        str(path.relative_to(WWW_OUTPUT_DIR))
        for path, generated in outputs
        if not path.exists() or path.read_text() != generated
    ]

    if not check_only:
        for path, generated in outputs:
            if not path.exists() or path.read_text() != generated:
                write_generated_text(path, generated)

    if check_only and dirty:
        print("www.js outputs are out of date. Run 'python scripts/build.py www' to fix:")
        for relative_path in dirty:
            print(f"  docs/public/webserver/{relative_path}")
    if temporary_root:
        temporary_root.cleanup()
    return dirty


# ===========================================================================
# Main
# ===========================================================================

def main():
    global GENERATED_TRANSACTION
    args = sys.argv[1:]
    if args == ["--self-test"]:
        try:
            run_generated_transaction_self_test()
        except BuildError as exc:
            print(exc)
            return 1
        return 0
    check_only = "--check" in args
    test_hooks = "--test-hooks" in args
    args = [arg for arg in args if arg != "--test-hooks"]
    temporary_output = None
    if "--temporary-output" in args:
        index = args.index("--temporary-output")
        if index + 1 >= len(args):
            raise BuildError("--temporary-output requires a directory")
        temporary_output = args[index + 1]
        del args[index:index + 2]
    commands = [a for a in args if a != "--check"]

    if not commands:
        commands = ["all"]

    exit_code = 0
    transaction = None
    if not check_only and temporary_output is None:
        transaction = GeneratedOutputTransaction()
        GENERATED_TRANSACTION = transaction

    try:
        for cmd in commands:
            if cmd == "all":
                entity_dirty = sync_entity_names(check_only=check_only)
                i18n_dirty = sync_i18n(check_only=check_only)
                contract_dirty = sync_card_contract(check_only=check_only)
                companion_dirty = sync_companion_capabilities(check_only=check_only)
                device_dirty = sync_device_capabilities(check_only=check_only)
                icon_dirty = sync_icons(check_only=check_only)
                www_dirty = build_www(check_only=check_only)
                if check_only and (entity_dirty or i18n_dirty or contract_dirty or companion_dirty or device_dirty or icon_dirty or www_dirty):
                    exit_code = 1
                elif not entity_dirty and not i18n_dirty and not contract_dirty and not device_dirty and not icon_dirty and not www_dirty:
                    print("All outputs are up to date.")
                else:
                    total = (
                        len(entity_dirty) + len(i18n_dirty) + len(contract_dirty) + len(companion_dirty) + len(device_dirty) +
                        len(icon_dirty) + len(www_dirty)
                    )
                    print(f"Updated {total} target(s).")
            elif cmd == "entities":
                dirty = sync_entity_names(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Entity name outputs are in sync.")
                else:
                    print(f"Synced {len(dirty)} entity name output(s).")
            elif cmd == "icons":
                dirty = sync_icons(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Icon data is in sync.")
                else:
                    print(f"Synced {len(dirty)} section(s).")
            elif cmd == "i18n":
                dirty = sync_i18n(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Firmware i18n output is in sync.")
                else:
                    print(f"Synced {len(dirty)} firmware i18n output(s).")
            elif cmd == "contract":
                dirty = sync_card_contract(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Card contract outputs are in sync.")
                else:
                    print(f"Synced {len(dirty)} card contract output(s).")
            elif cmd == "companion":
                dirty = sync_companion_capabilities(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Companion capability outputs are in sync.")
                else:
                    print(f"Synced {len(dirty)} Companion capability output(s).")
            elif cmd == "devices":
                dirty = sync_device_capabilities(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Device capability output is in sync.")
                else:
                    print(f"Synced {len(dirty)} device capability output(s).")
            elif cmd == "www":
                dirty = build_www(check_only=check_only, output_dir=temporary_output, test_hooks=test_hooks)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("All www.js outputs are up to date.")
                else:
                    print(f"Built {len(dirty)} file(s).")
            else:
                print(f"Unknown command: {cmd}")
                print("Usage: python scripts/build.py [all|entities|contract|devices|icons|i18n|www] [--check]")
                exit_code = 1
        if exit_code == 0 and transaction is not None:
            transaction.commit()
    except (BuildError, ProductSchemaError) as exc:
        print(exc)
        return 1
    finally:
        GENERATED_TRANSACTION = None

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
