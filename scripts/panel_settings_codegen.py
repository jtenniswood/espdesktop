"""Generate the firmware and browser readers for portable panel settings."""

import json
import re


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


def generate_panel_settings(root):
    source = root / "product/v2/panel_settings.json"
    records = json.loads(source.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_keys)
    if not isinstance(records, dict) or not records:
        raise ValueError("expected an object containing panel settings records")
    cpp = [
        "// Generated from product/v2/panel_settings.json. Do not edit.",
        "#pragma once",
        "",
        '#include "panel_setting_record.h"',
        "",
        "namespace espdesktop::panel_settings {",
    ]
    ts = [
        "// Generated from product/v2/panel_settings.json. Do not edit.",
        'import { readSettingRecord } from "../model/panel_setting_record";',
    ]
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
