#!/usr/bin/env python3
"""Contributor-file validation and discovery regression checks."""
import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app_shortcuts_codegen import icon_names, load_apps, outputs, validate_app, validate_windows_apps, windows_shortcut_valid

ROOT = Path(__file__).resolve().parents[1]


class AppShortcutTests(unittest.TestCase):
    def setUp(self):
        self.icons = icon_names(json.loads((ROOT / 'product/v2/icons.json').read_text()))
        self.app = json.loads((ROOT / 'product/v2/app_shortcuts/safari.json').read_text())
        self.app.pop('safariShortcuts', None)

    def test_windows_templates_and_key_syntax(self):
        validate_windows_apps(ROOT)
        for shortcut in ('control+t', 'option+shift+q', 'space', 'control+k~control+s', 'f11', 'shift+forwarddelete',
                         'control+shift+insert', 'control+keypad6', 'keypaddecimal'):
            self.assertTrue(windows_shortcut_valid(shortcut), shortcut)
        for shortcut in ('command+t', 'control+a~option+tab', 'a~b~c~d', 'option+tab', 'option+f4',
                         'control+escape', 'control+option+forwarddelete', 'control+control+t', 'keypadunknown'):
            self.assertFalse(windows_shortcut_valid(shortcut), shortcut)

    def test_existing_files_and_legacy_ids(self):
        apps = load_apps(ROOT)
        self.assertEqual([app['label'] for app in apps if app['catalog']], ['Safari'])
        safari = next(app for app in apps if app['appId'] == 'com.apple.Safari')
        self.assertEqual([item['id'] for item in safari['shortcuts'][:10]], [str(index) for index in range(10)])
        self.assertEqual(safari['shortcuts'][2]['shortcut'], 'command+r')

    def test_safari_plain_keys_are_reserved_for_the_safari_templates(self):
        safari = copy.deepcopy(self.app)
        safari['safariShortcuts'] = [{'id': '90', 'label': 'Next Field', 'shortcut': 'tab', 'icon': 'Shortcut Tab'}]
        validate_app(safari, self.icons)
        with self.assertRaisesRegex(ValueError, 'only in Safari'):
            validate_app(dict(safari, appId='org.example.Editor'), self.icons)
        safari['safariShortcuts'][0]['shortcut'] = 'enter'
        with self.assertRaisesRegex(ValueError, 'invalid keyboard shortcut'):
            validate_app(safari, self.icons)

    def test_invalid_definitions(self):
        for field, value in [('appId', 'invalid/id'), ('catalog', 'yes'), ('version', True), ('label', '')]:
            with self.subTest(field=field):
                app = copy.deepcopy(self.app)
                app[field] = value
                with self.assertRaises(ValueError):
                    validate_app(app, self.icons)
        for field, value in [('id', '01'), ('id', 3), ('icon', 'Missing Icon'), ('label', ''),
                             ('shortcut', 'shift+a'), ('shortcut', 'command+command+a'),
                             ('shortcut', 'command+unknown'), ('shortcut', 'command+a;rm')]:
            with self.subTest(field=field, value=value):
                app = copy.deepcopy(self.app)
                app['shortcuts'][0][field] = value
                with self.assertRaises(ValueError):
                    validate_app(app, self.icons)
        self.app['shortcuts'].append(copy.deepcopy(self.app['shortcuts'][0]))
        with self.assertRaisesRegex(ValueError, 'duplicate shortcut id'):
            validate_app(self.app, self.icons)

    def test_reference_example_is_valid(self):
        example = json.loads((ROOT / 'product/v2/app_shortcuts/examples/example-editor.json').read_text())
        validate_app(example, self.icons)

    def test_claude_numbered_choices_and_additional_keys(self):
        claude = json.loads((ROOT / 'product/v2/app_shortcuts/claude-desktop.json').read_text())
        validate_app(claude, self.icons)
        shortcuts = {item['shortcut'] for item in claude['shortcuts'] + claude['claudeShortcuts']}
        for digit in '123456789':
            self.assertTrue({digit, f'command+{digit}', f'command+option+{digit}'} <= shortcuts)
        with self.assertRaisesRegex(ValueError, 'only on the Claude Desktop'):
            validate_app(dict(claude, appId='org.example.Editor'), self.icons)
        claude['claudeShortcuts'][0]['shortcut'] = 'enter'
        with self.assertRaisesRegex(ValueError, 'invalid keyboard shortcut'):
            validate_app(claude, self.icons)

    def test_chatgpt_extra_presets_preserve_the_regular_list(self):
        app = json.loads((ROOT / 'product/v2/app_shortcuts/codex.json').read_text())
        validate_app(app, self.icons)
        app['additionalShortcuts'] = [
            {'id': '63', 'label': 'Clear Unreads', 'shortcut': 'shift+escape', 'icon': 'Check'},
        ]
        validate_app(app, self.icons)
        with self.assertRaisesRegex(ValueError, 'only on the ChatGPT Desktop'):
            validate_app(dict(app, appId='org.example.Editor'), self.icons)
        app['additionalShortcuts'][0]['shortcut'] = 'escape'
        with self.assertRaisesRegex(ValueError, 'invalid keyboard shortcut'):
            validate_app(app, self.icons)

    def test_new_file_is_discovered_and_reordering_preserves_ids(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            directory = root / 'product/v2/app_shortcuts'
            directory.mkdir(parents=True)
            (root / 'product/v2/icons.json').write_text((ROOT / 'product/v2/icons.json').read_text())
            self.app.update(appId='org.example.Editor', label='Example Editor', catalog=True)
            self.app['shortcuts'][0]['id'] = '99'
            self.app['defaultShortcutIds'] = ['99']
            self.app['shortcuts'].reverse()
            (directory / 'example.json').write_text(json.dumps(self.app))
            apps = load_apps(root)
            self.assertEqual(apps[0]['shortcuts'][-1]['id'], '99')
            self.assertEqual(apps[0]['defaultShortcutIds'], ['99'])
            generated = dict((path.suffix, content) for path, content in outputs(root))
            self.assertIn('org.example.Editor', generated['.ts'])
            self.assertIn('id == "99"', generated['.h'])
            self.assertIn('Example Editor', generated['.h'])
            (directory / 'duplicate.json').write_text(json.dumps(self.app))
            with self.assertRaisesRegex(ValueError, 'duplicate appId'):
                load_apps(root)

    def test_online_app_does_not_add_data_to_either_editor(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            directory = root / 'product/v2/app_shortcuts'
            directory.mkdir(parents=True)
            (root / 'product/v2/icons.json').write_text((ROOT / 'product/v2/icons.json').read_text())
            starter = {
                'version': 1, 'appId': 'org.example.Editor', 'label': 'Example Editor',
                'catalog': False, 'defaultShortcutIds': ['9'],
                'shortcuts': [{'id': '0', 'label': 'New Window', 'shortcut': 'command+n', 'icon': 'New Window'}],
                'moreShortcuts': [{'id': '9', 'label': 'Next item', 'shortcut': 'scoped.tab', 'icon': 'Arrow Right'}],
            }
            manifest = {'formatVersion': 1, 'catalogueVersion': 1, 'minimumCompanionVersion': '1.0.0',
                        'entries': [{'path': 'editor.json', 'offline': True}]}
            (directory / 'editor.json').write_text(json.dumps(starter))
            (directory / 'manifest.json').write_text(json.dumps(manifest))

            def editor_outputs():
                return {path.name: content for path, content in outputs(root) if path.suffix == '.ts'}

            original = editor_outputs()
            offline = original['app_shortcuts_offline.ts']
            self.assertIn('"scoped.tab"', offline, 'expanded entries can be selected as offline defaults')
            self.assertNotIn('"command+n"', offline, 'only defaults belong in the embedded editor')
            (directory / 'online.json').write_text(json.dumps(dict(starter, appId='org.example.Online')))
            manifest['entries'].append({'path': 'online.json'})
            (directory / 'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(editor_outputs(), original)
            self.assertIn('org.example.Online', {app['appId'] for app in load_apps(root)})


if __name__ == '__main__':
    unittest.main()
