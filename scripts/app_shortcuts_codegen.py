"""Validate contributor app files and generate shared web/firmware shortcut metadata."""
from __future__ import annotations

import json
import re

MODIFIERS = {'command', 'control', 'option', 'shift'}
MORE_SHORTCUTS_LIMIT = 900
KEYPAD_KEYS = set('keypadplus keypadminus keypadmultiply keypaddivide keypaddecimal keypadequal keypadenter keypadclear'.split()) | {f'keypad{n}' for n in range(10)}
KEYS = set('space enter tab escape delete forwarddelete left right up down home end pageup pagedown keycomma keyperiod keyslash keysemicolon keyquote keybackslash keyminus keyequal keybracketleft keybracketright keybackquote'.split())
SAFARI_TEMPLATES = {'com.apple.Safari', 'com.apple.Safari.WebApp'}
SAFARI_UNMODIFIED_KEYS = {'tab', 'escape'}
BOOKS_EXTENDED_SHORTCUTS = {'right', 'left', 'space', 'function+f'}
CHATGPT_DESKTOP_ID = 'com.openai.codex'
CHATGPT_CLEAR_UNREADS = 'shift+escape'
BOOKS_ID = 'com.apple.iBooksX'
CLAUDE_DESKTOP_ID = 'com.anthropic.claudefordesktop'
CLAUDE_SCOPED_SHORTCUTS = {'f6', 'shift+f6', 'claude-escape', 'escape-twice', 'up', 'down', *'123456789'}


def shortcut_valid(value):
    if not isinstance(value, str):
        return False
    parts = value.split('+')
    modifiers, key = parts[:-1], parts[-1]
    return (1 <= len(modifiers) <= 4 and len(set(modifiers)) == len(modifiers)
            and set(modifiers) <= MODIFIERS and bool(set(modifiers) - {'shift'})
            and (key in KEYS or re.fullmatch(r'[a-z0-9]|f(?:[1-9]|1[0-9]|20)', key) is not None))


def scoped_shortcut_valid(value):
    if not isinstance(value, str) or not value.startswith('scoped.') or len(value) > 87:
        return False
    strokes = value.removeprefix('scoped.').split('~')
    return len(strokes) <= 3 and all(
        len(parts := stroke.split('+')) <= 6
        and len(set(parts[:-1])) == len(parts) - 1
        and set(parts[:-1]) <= MODIFIERS | {'function'}
        and (parts[-1] in KEYS | KEYPAD_KEYS or re.fullmatch(r'[a-z0-9]|f(?:[1-9]|1[0-9]|20)', parts[-1]))
        for stroke in strokes
    )


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
    optional = {'extendedShortcuts', 'additionalShortcuts', 'claudeShortcuts', 'safariShortcuts', 'moreShortcuts'}
    require(set(data) - optional == fields,
            'expected version, appId, label, catalog, shortcuts and supported optional shortcut lists')
    require(type(data['version']) is int and data['version'] == 1, 'version must be 1')
    require(text(data['appId'], 96) and re.fullmatch(r'[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', data['appId']), 'appId must be a Mac bundle identifier (maximum 96 bytes)')
    require(text(data['label'], 48), 'label must contain 1–48 bytes of text')
    require(type(data['catalog']) is bool, 'catalog must be true or false')
    is_books = data['appId'] == BOOKS_ID and not data['catalog']
    is_claude = data['appId'] == CLAUDE_DESKTOP_ID and not data['catalog']
    is_safari = data['appId'] in SAFARI_TEMPLATES
    is_chatgpt = data['appId'] == CHATGPT_DESKTOP_ID and not data['catalog']
    extended_keys = SAFARI_UNMODIFIED_KEYS if is_safari else BOOKS_EXTENDED_SHORTCUTS
    extended = data.get('extendedShortcuts', [])
    additional = data.get('additionalShortcuts', [])
    require(isinstance(extended, list) and (not extended or is_books),
            'extendedShortcuts are supported only on the Books app subpage')
    safari = data.get('safariShortcuts', [])
    require(isinstance(safari, list) and (not safari or is_safari),
            'safariShortcuts are supported only in Safari templates')
    require(isinstance(additional, list) and (not additional or is_chatgpt),
            'additionalShortcuts are supported only on the ChatGPT Desktop app subpage')
    claude = data.get('claudeShortcuts', [])
    require(isinstance(claude, list) and (not claude or is_claude),
            'claudeShortcuts are supported only on the Claude Desktop app subpage')
    regular = data['shortcuts']
    require(isinstance(regular, list) and 1 <= len(regular) <= 64 - len(extended) - len(safari),
            'shortcuts must contain at least one entry and at most 64 including extended or Safari shortcuts')
    require(len(regular) + len(additional) + len(claude) <= 96, 'app subpages support at most 96 shortcuts')
    more = data.get('moreShortcuts', [])
    require(isinstance(more, list) and len(more) <= MORE_SHORTCUTS_LIMIT, 'invalid expanded shortcut list size')
    legacy = regular + extended + safari + additional + claude
    ids = set()
    for index, item in enumerate(legacy + more):
        require(isinstance(item, dict) and set(item) == {'id', 'label', 'shortcut', 'icon'}, 'each shortcut needs id, label, shortcut, icon only')
        ident = item['id']
        require(isinstance(ident, str) and re.fullmatch(r'0|[1-9][0-9]{0,2}', ident), 'shortcut id must be a permanent numeric string from "0" to "999"')
        require(ident not in ids, f'duplicate shortcut id: {ident}')
        ids.add(ident)
        require(text(item['label'], 48), f'{ident}: label must contain 1–48 bytes of text')
        shortcut = item['shortcut']
        if index < len(regular):
            valid = shortcut_valid(shortcut)
        elif index < len(regular) + len(extended) + len(safari):
            valid = isinstance(shortcut, str) and shortcut in extended_keys
        elif index < len(legacy):
            valid = (shortcut_valid(shortcut) or
                     (is_claude and isinstance(shortcut, str) and shortcut in CLAUDE_SCOPED_SHORTCUTS) or
                     (is_chatgpt and shortcut == CHATGPT_CLEAR_UNREADS))
        else:
            valid = shortcut_valid(shortcut) or scoped_shortcut_valid(shortcut)
        require(valid, f'{ident}: invalid keyboard shortcut: {shortcut!r}')
        require(isinstance(item['icon'], str) and item['icon'] in icons and text(item['icon'], 48), f'{ident}: icon must be a name from product/v2/icons.json')
    base = {key: value for key, value in data.items() if key != 'moreShortcuts'}
    require(len(json.dumps(base, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) <= 12000,
            'compact starter definition exceeds 12000 bytes')
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
        additional = app.pop('additionalShortcuts', []) + app.pop('claudeShortcuts', [])
        safari = app.pop('safariShortcuts', [])
        app['shortcuts'] = extended + app['shortcuts'] + safari + additional
    # Pack the repeated keys/icons once so the full offline catalogue fits the
    # existing browser asset budget. Keep labels readable in the source JSON.
    more = {app['appId']: app.pop('moreShortcuts', []) for app in apps}
    alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
    icon_table = sorted({item['icon'] for items in more.values() for item in items})
    key_table = sorted({stroke.split('+')[-1] for items in more.values() for item in items
                        for stroke in item['shortcut'].removeprefix('scoped.').split('~')})
    if len(icon_table) > 4096 or len(key_table) > 4096:
        raise ValueError('expanded shortcut dictionary exceeds its encoding capacity')

    def encode_pair(index):
        return alphabet[index // 64] + alphabet[index % 64]

    # Each row: ID (2 digits), icon index (2), count/scoped flag (1),
    # then 3 digits per stroke (modifier bits and key index), then the label.
    def pack_item(item):
        shortcut = item['shortcut']
        scoped = shortcut.startswith('scoped.')
        chord = ''
        for stroke in shortcut.removeprefix('scoped.').split('~'):
            parts = stroke.split('+')
            flags = sum(1 << i for i, mod in enumerate(('command', 'control', 'option', 'shift', 'function'))
                        if mod in parts[:-1])
            chord += alphabet[flags] + encode_pair(key_table.index(parts[-1]))
        return (encode_pair(int(item['id'])) + encode_pair(icon_table.index(item['icon'])) +
                alphabet[len(chord) // 3 + (3 if scoped else 0)] + chord + item['label'])

    packed = {app_id: '\n'.join(map(pack_item, items)) for app_id, items in more.items() if items}
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
    readonly claudeShortcuts?: readonly AppShortcutDefinition[];
    readonly safariShortcuts?: readonly AppShortcutDefinition[];
    readonly moreShortcuts?: readonly AppShortcutDefinition[];
}
export const COMPANION_SHORTCUT_APPS: readonly AppShortcutApplication[] = ''' + json.dumps(apps, indent=2, ensure_ascii=False) + ';\n'
    ts += 'export const EXPANDED_SHORTCUT_KEYS = ' + json.dumps(key_table, ensure_ascii=False) + ';\n'
    ts += 'export const EXPANDED_SHORTCUT_ICONS = ' + json.dumps(icon_table, ensure_ascii=False) + ';\n'
    ts += 'export const EXPANDED_SHORTCUTS: Readonly<Record<string, string>> = ' + json.dumps(packed, indent=2, ensure_ascii=False) + ';\n'
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
        items = app['shortcuts'] + (more[app['appId']] if app['appId'] == 'io.github.jtenniswood.athena' else [])
        ids = ' || '.join('id == ' + json.dumps(item['id']) for item in items)
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
