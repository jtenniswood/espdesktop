"""Validate contributor app files and generate shared web/firmware shortcut metadata."""
from __future__ import annotations

import json
import re

MODIFIERS = {'command', 'control', 'option', 'shift'}
KEYS = set('space enter tab escape delete forwarddelete left right up down home end pageup pagedown keycomma keyperiod keyslash keysemicolon keyquote keybackslash keyminus keyequal keybracketleft keybracketright keybackquote'.split())
SAFARI_TEMPLATES = {'com.apple.Safari', 'com.apple.Safari.WebApp'}
SAFARI_UNMODIFIED_KEYS = {'tab', 'escape'}
BOOKS_EXTENDED_SHORTCUTS = {'right', 'left', 'space', 'function+f'}
CHATGPT_DESKTOP_ID = 'com.openai.codex'
CHATGPT_CLEAR_UNREADS = 'shift+escape'


def shortcut_valid(value):
    if not isinstance(value, str):
        return False
    parts = value.split('+')
    modifiers, key = parts[:-1], parts[-1]
    return (1 <= len(modifiers) <= 4 and len(set(modifiers)) == len(modifiers)
            and set(modifiers) <= MODIFIERS and bool(set(modifiers) - {'shift'})
            and (key in KEYS or re.fullmatch(r'[a-z0-9]|f(?:[1-9]|1[0-9]|20)', key) is not None))


def icon_names(data):
    if isinstance(data, dict):
        return ({data['name']} if 'name' in data else set()).union(*(icon_names(v) for v in data.values()))
    if isinstance(data, list):
        return set().union(*(icon_names(v) for v in data))
    return set()


def validate_app(data, icons):
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def text(value, maximum):
        return (isinstance(value, str) and bool(value.strip()) and value == value.strip()
                and len(value.encode('utf-8')) <= maximum and not any(ord(c) < 32 for c in value))

    require(isinstance(data, dict), 'expected an app object')
    fields = {'version', 'appId', 'label', 'catalog', 'shortcuts'}
    require(set(data) - {'extendedShortcuts', 'additionalShortcuts'} == fields,
            'expected version, appId, label, catalog, shortcuts and optional extendedShortcuts or additionalShortcuts')
    require(type(data['version']) is int and data['version'] == 1, 'version must be 1')
    require(text(data['appId'], 96) and re.fullmatch(r'[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', data['appId']), 'appId must be a Mac bundle identifier (maximum 96 bytes)')
    require(text(data['label'], 48), 'label must contain 1–48 bytes of text')
    require(type(data['catalog']) is bool, 'catalog must be true or false')
    extended = data.get('extendedShortcuts', [])
    additional = data.get('additionalShortcuts', [])
    require(isinstance(extended, list) and (not extended or data['appId'] in SAFARI_TEMPLATES
             or (data['appId'] == 'com.apple.iBooksX' and not data['catalog'])),
            'extendedShortcuts are supported only in Safari and Books templates')
    require(isinstance(additional, list) and (not additional or (data['appId'] == CHATGPT_DESKTOP_ID and not data['catalog'])),
            'additionalShortcuts are supported only on the ChatGPT Desktop app subpage')
    require(isinstance(data['shortcuts'], list) and 1 <= len(data['shortcuts']) <= 64 - len(extended),
            'shortcuts must contain at least one entry and at most 64 entries including extendedShortcuts')
    require(len(data['shortcuts']) + len(additional) <= 96, 'ChatGPT Desktop supports at most 96 shortcuts')
    ids = set()
    for index, item in enumerate(extended + data['shortcuts'] + additional):
        require(isinstance(item, dict) and set(item) == {'id', 'label', 'shortcut', 'icon'}, 'each shortcut needs id, label, shortcut, icon only')
        ident = item['id']
        require(isinstance(ident, str) and re.fullmatch(r'0|[1-9][0-9]{0,2}', ident), 'shortcut id must be a permanent numeric string from "0" to "999"')
        require(ident not in ids, f'duplicate shortcut id: {ident}')
        ids.add(ident)
        require(text(item['label'], 48), f'{ident}: label must contain 1–48 bytes of text')
        shortcut = item['shortcut']
        extended_keys = SAFARI_UNMODIFIED_KEYS if data['appId'] in SAFARI_TEMPLATES else BOOKS_EXTENDED_SHORTCUTS
        valid = (isinstance(shortcut, str) and shortcut in extended_keys
                 if index < len(extended) else shortcut_valid(shortcut))
        if index >= len(extended) + len(data['shortcuts']):
            valid = valid or shortcut == CHATGPT_CLEAR_UNREADS
        require(valid, f'{ident}: invalid keyboard shortcut: {shortcut!r}')
        require(isinstance(item['icon'], str) and item['icon'] in icons, f'{ident}: icon must be a name from product/v2/icons.json')
    require(len(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) <= 12000,
            'compact serialized definition exceeds 12000 bytes')
    return data


def load_apps(root):
    directory = root / 'product/v2/app_shortcuts'
    icons = icon_names(json.loads((root / 'product/v2/icons.json').read_text()))
    apps, seen = [], set()
    for path in sorted(directory.glob('*.json')):
        if path.name == 'manifest.json':
            continue
        try:
            app = validate_app(json.loads(path.read_text()), icons)
            if app['appId'] in seen:
                raise ValueError(f'duplicate appId: {app["appId"]}')
            seen.add(app['appId'])
            apps.append(app)
        except (ValueError, TypeError) as error:
            raise ValueError(f'{path.name}: {error}') from error
    if not apps:
        raise ValueError(f'{directory}: no app shortcut files found')
    validate_manifest(directory, {path.name for path in directory.glob('*.json') if path.name != 'manifest.json'})
    return sorted(apps, key=lambda app: (app['label'].casefold(), app['appId']))


def validate_manifest(directory, expected_paths):
    manifest_path = directory / 'manifest.json'
    if not manifest_path.exists():
        return
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, dict) or set(manifest) != {'formatVersion', 'catalogueVersion', 'minimumCompanionVersion', 'entries'}:
        raise ValueError(f'{manifest_path.name}: invalid catalogue manifest fields')
    if type(manifest['formatVersion']) is not int or manifest['formatVersion'] != 1:
        raise ValueError(f'{manifest_path.name}: formatVersion must be 1')
    if type(manifest['catalogueVersion']) is not int or manifest['catalogueVersion'] < 1:
        raise ValueError(f'{manifest_path.name}: catalogueVersion must be a positive integer')
    if not isinstance(manifest['minimumCompanionVersion'], str) or not re.fullmatch(r'\d+(?:\.\d+){0,3}', manifest['minimumCompanionVersion']):
        raise ValueError(f'{manifest_path.name}: minimumCompanionVersion must be numeric dotted version')
    entries = manifest['entries']
    if not isinstance(entries, list) or not entries or len(entries) > 128:
        raise ValueError(f'{manifest_path.name}: entries must contain 1–128 templates')
    paths = []
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {'path'} or not isinstance(entry['path'], str):
            raise ValueError(f'{manifest_path.name}: each entry requires a path')
        path = entry['path']
        if path.startswith('/') or '..' in path.split('/') or not re.fullmatch(r'[A-Za-z0-9._/-]+', path):
            raise ValueError(f'{manifest_path.name}: unsafe template path {path!r}')
        paths.append(path)
    if len(set(paths)) != len(paths) or set(paths) != set(expected_paths):
        raise ValueError(f'{manifest_path.name}: entries must list each template file exactly once')


def outputs(root):
    apps = load_apps(root)
    for app in apps:
        extended = app.pop('extendedShortcuts', [])
        if app['appId'] in SAFARI_TEMPLATES:
            app['shortcuts'] = app['shortcuts'] + extended
        else:
            app['shortcuts'] = extended + app['shortcuts'] + app.pop('additionalShortcuts', [])
    ts = '''// Generated by scripts/build.py companion from product/v2/app_shortcuts/*.json. Do not edit.
export interface AppShortcutDefinition {
    readonly id: string;
    readonly label: string;
    readonly shortcut: string;
    readonly icon: string;
}
export interface AppShortcutApplication {
    readonly version: number;
    readonly appId: string;
    readonly label: string;
    readonly catalog: boolean;
    readonly shortcuts: readonly AppShortcutDefinition[];
    readonly extendedShortcuts?: readonly AppShortcutDefinition[];
    readonly additionalShortcuts?: readonly AppShortcutDefinition[];
}
export const COMPANION_SHORTCUT_APPS: readonly AppShortcutApplication[] = ''' + json.dumps(apps, indent=2, ensure_ascii=False) + ';\n'
    cpp = ['#pragma once', '// Generated by scripts/build.py companion from product/v2/app_shortcuts/*.json. Do not edit.', '#include <string>', 'namespace companion_shortcut_catalog {', 'inline bool is_versioned_premiere_pro(const std::string &app) {', '  const std::string prefix = "com.adobe.PremierePro.";', '  if (app.compare(0, prefix.size(), prefix) != 0 || app.size() == prefix.size()) return false;', '  for (std::string::size_type i = prefix.size(); i < app.size(); ++i) {', '    if (app[i] < \'0\' || app[i] > \'9\') return false;', '  }', '  return true;', '}']
    cpp += [
        'inline bool is_safari_web_app(const std::string &app) {',
        '  const std::string prefix = "com.apple.Safari.WebApp.";',
        '  if (app.size() != prefix.size() + 36 || app.compare(0, prefix.size(), prefix) != 0) return false;',
        '  for (std::string::size_type i = 0; i < 36; ++i) {',
        '    const char ch = app[prefix.size() + i];',
        "    const bool separator = i == 8 || i == 13 || i == 18 || i == 23;",
        "    const bool hex = (ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'F') || (ch >= 'a' && ch <= 'f');",
        "    if (separator ? ch != '-' : !hex) return false;",
        '  }',
        '  return true;',
        '}',
        'inline const char *app_label(const std::string &app) {',
    ]
    for app in apps:
        match = f'app == {json.dumps(app["appId"])}'
        if app['appId'] == 'com.adobe.PremierePro':
            match += ' || is_versioned_premiere_pro(app)'
        if app['appId'] == 'com.apple.Safari.WebApp':
            match += ' || is_safari_web_app(app)'
        cpp.append(f'  if ({match}) return {json.dumps(app["label"], ensure_ascii=False)};')
    cpp += ['  return "";', '}', 'inline bool has_shortcut(const std::string &app, const std::string &id) {']
    for app in apps:
        ids = ' || '.join('id == ' + json.dumps(item['id']) for item in app['shortcuts'])
        match = f'app == {json.dumps(app["appId"])}'
        if app['appId'] == 'com.adobe.PremierePro':
            match += ' || is_versioned_premiere_pro(app)'
        if app['appId'] == 'com.apple.Safari.WebApp':
            match += ' || is_safari_web_app(app)'
        cpp.append(f'  if ({match}) return {ids};')
    cpp += ['  return false;', '}', '}  // namespace companion_shortcut_catalog', '']
    generated = [(root / 'src/webserver/generated/app_shortcuts.ts', ts),
                 (root / 'components/espdesktop/app_shortcuts_generated.h', '\n'.join(cpp))]
    resources = root / 'macos/EspDesktop/Sources/Companion/Resources/AppShortcuts'
    manifest = root / 'product/v2/app_shortcuts/manifest.json'
    if manifest.exists():
        generated.append((resources / 'manifest.json', manifest.read_text()))
    generated.extend((resources / path.name, path.read_text())
                     for path in sorted((root / 'product/v2/app_shortcuts').glob('*.json'))
                     if path.name != 'manifest.json')
    return generated
