#!/usr/bin/env python3
"""Contributor-file validation and discovery regression checks."""
import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app_shortcuts_codegen import icon_names, load_apps, outputs, validate_app

ROOT = Path(__file__).resolve().parents[1]


class AppShortcutTests(unittest.TestCase):
    def setUp(self):
        self.icons = icon_names(json.loads((ROOT / 'product/v2/icons.json').read_text()))
        self.app = json.loads((ROOT / 'product/v2/app_shortcuts/safari.json').read_text())

    def test_existing_files_and_legacy_ids(self):
        apps = load_apps(ROOT)
        self.assertEqual([app['label'] for app in apps if app['catalog']], ['Safari'])
        safari = next(app for app in apps if app['appId'] == 'com.apple.Safari')
        self.assertEqual([item['id'] for item in safari['shortcuts']], ['0', '1', '2', '3', '4'])
        self.assertEqual(safari['shortcuts'][2]['shortcut'], 'command+r')

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

    def test_new_file_is_discovered_and_reordering_preserves_ids(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            directory = root / 'product/v2/app_shortcuts'
            directory.mkdir(parents=True)
            (root / 'product/v2/icons.json').write_text((ROOT / 'product/v2/icons.json').read_text())
            self.app.update(appId='org.example.Editor', label='Example Editor', catalog=True)
            self.app['shortcuts'][0]['id'] = '12'
            self.app['shortcuts'].reverse()
            (directory / 'example.json').write_text(json.dumps(self.app))
            apps = load_apps(root)
            self.assertEqual(apps[0]['shortcuts'][-1]['id'], '12')
            generated = dict((path.suffix, content) for path, content in outputs(root))
            self.assertIn('org.example.Editor', generated['.ts'])
            self.assertIn('id == "12"', generated['.h'])
            self.assertIn('Example Editor', generated['.h'])
            (directory / 'duplicate.json').write_text(json.dumps(self.app))
            with self.assertRaisesRegex(ValueError, 'duplicate appId'):
                load_apps(root)


if __name__ == '__main__':
    unittest.main()
