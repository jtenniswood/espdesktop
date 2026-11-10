"""Generate the firmware and browser readers for portable panel settings."""

import json
import re

from check_timezones import load_time_select_options
from device_profiles import load_device_profiles


def name_is_valid(name):
    return re.fullmatch(r"[a-z][a-z0-9_]*", name)


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate key {key!r}")
        result[key] = value
    return result


def cpp_rule(field, rule):
    if isinstance(rule, list) and rule and all(
        isinstance(choice, str) and re.fullmatch(r"[a-z0-9_]+", choice) for choice in rule
    ) and len(set(rule)) == len(rule):
        choices = " && ".join(f'{field} != "{choice}"' for choice in rule)
        return "std::string_view", f"({choices})"
    if isinstance(rule, dict) and set(rule) == {"min", "max"}:
        low, high = rule["min"], rule["max"]
        if type(low) is int and type(high) is int and -(2**31) <= low <= high < 2**31:
            return "int", f"!read_integer({field}, result.{field}, {low}, {high})"
    if isinstance(rule, dict) and set(rule) == {"hex"}:
        length = rule["hex"]
        if type(length) is int and 0 < length <= 16:
            return "std::string_view", f"!is_hex({field}, {length})"
    raise ValueError(f"invalid rule for {field!r}")


def append_scalar_settings(cpp, ts, settings, time_yaml):
    if not isinstance(settings, dict) or not 0 < len(settings) < 255:
        raise ValueError("expected scalar settings")
    rows = []
    choice_lists = []
    profile_defaults = []
    for name, entry in settings.items():
        if not name_is_valid(name) or not isinstance(entry, dict):
            raise ValueError(f"invalid scalar setting {name!r}")
        if set(entry) == {"default", "min", "max"}:
            low, high = entry["min"], entry["max"]
            default = entry["default"]
            if (type(low) is not int or type(high) is not int or type(default) is not int
                    or not -(2**31) <= low <= default <= high < 2**31):
                raise ValueError(f"invalid range or default for {name!r}")
            rows.append((name, str(default), f"min: {low}, max: {high}",
                         f"int parsed; return read_integer(value, parsed, {low}, {high});"))
            continue
        if set(entry) == {"default", "ascii_text_max"}:
            limit = entry["ascii_text_max"]
            default = entry["default"]
            if (type(limit) is not int or not 0 < limit <= 255 or not isinstance(default, str)
                    or len(default) > limit or not re.fullmatch(r"[ -~]*", default)):
                raise ValueError(f"invalid text length or default for {name!r}")
            rows.append((name, default, f"asciiTextMax: {limit}",
                         f"return valid_ascii_text(value, {limit});"))
            continue
        if set(entry) == {"default", "type"} and entry["type"] == "switch":
            choices = ["0", "1"]
        elif set(entry) == {"default", "choices"} and isinstance(entry["choices"], list):
            choices = entry["choices"]
        elif set(entry) == {"default", "time_select"} and isinstance(entry["time_select"], str):
            choices = [option for _, option in load_time_select_options(entry["time_select"], time_yaml)]
        elif name == "screen_rotation" and set(entry) == {"default", "device_rotation"} and entry["device_rotation"] is True:
            choices = []
            for slug, profile in load_device_profiles().items():
                rotation = profile["rotation"]
                if not rotation.get("enabled"):
                    continue
                choices.extend(option for option in rotation["options"] if option not in choices)
                default = rotation.get("default", "0")
                if default not in rotation["options"]:
                    raise ValueError(f"invalid rotation default for {slug!r}")
                if default != entry["default"]:
                    profile_defaults.append((name, slug, default))
        else:
            raise ValueError(f"invalid scalar rule for {name!r}")
        if (not choices or not all(isinstance(choice, str) and re.fullmatch(r"[A-Za-z0-9 _./()+:-]+", choice)
                                   for choice in choices) or len(set(choices)) != len(choices)
                or entry["default"] not in choices):
            raise ValueError(f"invalid choices or default for {name!r}")
        if "time_select" in entry:
            choice_lists.extend([
                f"inline constexpr std::string_view {name}_choices[] = {{",
                *(f"  {json.dumps(choice)}," for choice in choices),
                "};",
            ])
            accepted = (f"for (const auto choice : {name}_choices) "
                        "if (value == choice) return true; return false;")
            ts_choices = "[\n" + "".join(f"    {json.dumps(choice)},\n" for choice in choices) + "  ]"
        else:
            accepted = "return " + " || ".join(f'value == {json.dumps(choice)}' for choice in choices) + ";"
            ts_choices = json.dumps(choices)
        rows.append((name, entry["default"], f"choices: {ts_choices}", accepted))
    cpp.extend([
        "",
        "enum class ScalarSetting : uint8_t {",
        *(f"  {name.upper()}," for name, _, _, _ in rows),
        "  COUNT",
        "};",
        "struct ScalarRule {",
        "  std::string_view key;",
        "  std::string_view default_value;",
        "  bool (*valid)(std::string_view);",
        "};",
        "inline bool valid_ascii_text(std::string_view value, size_t max_length) {",
        "  if (value.size() > max_length) return false;",
        "  for (const unsigned char ch : value)",
        "    if (ch < 0x20 || ch > 0x7e) return false;",
        "  return true;",
        "}",
        *choice_lists,
        "inline constexpr std::array<ScalarRule, size_t(ScalarSetting::COUNT)> SCALAR_RULES{{",
        *(f'  {{"{name}", {json.dumps(default)}, [](std::string_view value) {{ {accepted} }}}},'
          for name, default, _, accepted in rows),
        "}};",
        "",
        "inline constexpr std::string_view scalar_setting_default(ScalarSetting setting, std::string_view profile) {",
        *(f'  if (setting == ScalarSetting::{name.upper()} && profile == {json.dumps(slug)}) return {json.dumps(value)};'
          for name, slug, value in profile_defaults),
        "  return SCALAR_RULES[size_t(setting)].default_value;",
        "}",
        "",
        "inline size_t scalar_setting_index(std::string_view key) {",
        "  for (size_t i = 0; i < SCALAR_RULES.size(); ++i)",
        "    if (SCALAR_RULES[i].key == key) return i;",
        "  return SCALAR_RULES.size();",
        "}",
    ])
    ts.extend([
        "",
        "export const PANEL_SCALAR_SETTINGS = {",
        *(f"  {name}: {{ defaultValue: {json.dumps(default)}, {rule} }},"
          for name, default, rule, _ in rows),
        "} as const;",
        "",
        "export function validPanelScalarSetting(key: string, value: string): boolean {",
        "  if (!Object.hasOwn(PANEL_SCALAR_SETTINGS, key)) return true;",
        "  const rule = PANEL_SCALAR_SETTINGS[key as keyof typeof PANEL_SCALAR_SETTINGS];",
        '  if ("choices" in rule) return (rule.choices as readonly string[]).includes(value);',
        '  if ("asciiTextMax" in rule) return value.length <= rule.asciiTextMax && !/[^\\x20-\\x7e]/.test(value);',
        '  const digits = rule.min < 0 && value.startsWith("-") ? value.slice(1) : value;',
        "  if (!digits || /[^0-9]/.test(digits)) return false;",
        "  const parsed = Number(value);",
        "  return parsed >= rule.min && parsed <= rule.max;",
        "}",
    ])


def generate_panel_settings(root):
    source = root / "product/v2/panel_settings.json"
    records = json.loads(source.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_keys)
    if not isinstance(records, dict) or not records:
        raise ValueError("expected an object containing panel settings records")
    cpp = [
        "// Generated from product/v2/panel_settings.json. Do not edit.",
        "#pragma once",
        "",
        "#include <cstdint>",
        '#include "panel_setting_record.h"',
        "",
        "namespace espdesktop::panel_settings {",
    ]
    ts = [
        "// Generated from product/v2/panel_settings.json. Do not edit.",
        'import { readSettingRecord } from "../model/panel_setting_record";',
    ]
    append_scalar_settings(cpp, ts, records.pop("scalar_settings", None), root / "common/addon/time.yaml")
    for name, record in records.items():
        if not name_is_valid(name) or not isinstance(record, dict) or set(record) != {"version", "fields"}:
            raise ValueError(f"invalid panel settings record {name!r}")
        version, fields = record["version"], record["fields"]
        if type(version) is not int or not 1 <= version <= 255:
            raise ValueError(f"invalid version for {name!r}")
        if not isinstance(fields, dict) or not fields or not all(name_is_valid(field) for field in fields):
            raise ValueError(f"invalid field names for {name!r}")
        type_name = "".join(word.capitalize() for word in name.split("_")) + "Record"
        cpp.extend([
            "",
            f'inline constexpr std::string_view {name}_key = "{name}";',
            f"inline constexpr int {name}_version = {version};",
            "",
            f"struct {type_name} {{",
        ])
        declarations, validation = [], []
        for index, (field, rule) in enumerate(fields.items(), 1):
            field_type, invalid = cpp_rule(field, rule)
            cpp.append(f"  {field_type} {field}{{}};")
            declarations.append(f"  const auto {field} = (*fields)[{index}];")
            validation.append(f"  if ({invalid}) return {{}};")
            if field_type != "int":
                validation.append(f"  result.{field} = {field};")
        cpp.extend([
            "};",
            "",
            f"inline std::optional<{type_name}> read_{name}(std::string_view value) {{",
            f"  const auto fields = split_fields<{len(fields) + 1}>(value);",
            f'  if (!fields || (*fields)[0] != "{version}") return {{}};',
            f"  {type_name} result;",
            *declarations,
            *validation,
            "  return result;",
            "}",
        ])
        ts.extend([
            "",
            f'export const {name}_key = "{name}";',
            f"export const {name}_version = {version};",
            f"export const read_{name} = (value?: string) =>",
            f"  readSettingRecord(value, {name}_version, {{",
            *(f"    {field}: {json.dumps(rule)}," for field, rule in fields.items()),
            "  } as const);",
        ])
    cpp.extend(["", "}  // namespace espdesktop::panel_settings", ""])
    ts.append("")
    return {
        root / "components/espdesktop/panel_settings_generated.h": "\n".join(cpp),
        root / "src/webserver/generated/panel_settings.ts": "\n".join(ts),
    }
