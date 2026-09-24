#!/usr/bin/env python3
"""Contributor-file validation and discovery regression checks."""
import copy
import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
import unittest

from app_shortcuts_codegen import icon_names, load_apps, outputs, validate_app
from web_apps_codegen import load_web_apps, outputs as web_outputs

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

    def test_reference_example_is_valid(self):
        example = json.loads((ROOT / 'product/v2/app_shortcuts/examples/example-editor.json').read_text())
        validate_app(example, self.icons)

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


class WebAppTests(unittest.TestCase):
    def test_reference_example_is_valid(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = ROOT / 'product/v2/web_apps'
            directory = root / 'product/v2/web_apps'
            (directory / 'icons').mkdir(parents=True)
            (root / 'product/v2/icons.json').write_text((ROOT / 'product/v2/icons.json').read_text())
            example = source / 'examples/example-service.json'
            (directory / 'example-service.json').write_text(example.read_text())
            shutil.copy2(source / 'icons/google-docs.png', directory / 'icons/google-docs.png')
            (directory / 'manifest.json').write_text(json.dumps({
                'formatVersion': 1,
                'catalogueVersion': 1,
                'minimumCompanionVersion': '1.0.0',
                'entries': [{'path': 'example-service.json'}],
            }))
            self.assertEqual([app['id'] for app in load_web_apps(root)], ['example-service'])

    def test_web_templates_manifest_and_hosted_icon(self):
        apps = load_web_apps(ROOT)
        self.assertEqual([app['id'] for app in apps], ['google-docs'])
        self.assertEqual(apps[0]['matchHost'], 'docs.google.com')
        generated = dict((path.name, content) for path, content in web_outputs(ROOT))
        self.assertIn('google-docs', generated['web_apps.ts'])
        self.assertIn('icon_url', generated['web_apps_generated.h'])

    def test_web_manifest_template_and_match_validation(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = ROOT / 'product/v2/web_apps'
            (root / 'product/v2/web_apps/icons').mkdir(parents=True)
            (root / 'product/v2/icons.json').write_text((ROOT / 'product/v2/icons.json').read_text())
            (root / 'product/v2/web_apps/google-docs.json').write_text((source / 'google-docs.json').read_text())
            (root / 'product/v2/web_apps/manifest.json').write_text((source / 'manifest.json').read_text())
            (root / 'product/v2/web_apps/icons/google-docs.png').write_bytes((source / 'icons/google-docs.png').read_bytes())
            self.assertEqual(len(load_web_apps(root)), 1)
            template_path = root / 'product/v2/web_apps/google-docs.json'
            template = json.loads(template_path.read_text())
            template['matchHost'] = 'example.com'
            template_path.write_text(json.dumps(template))
            with self.assertRaisesRegex(ValueError, 'matchHost must match'):
                load_web_apps(root)
            template['matchHost'] = 'docs.google.com'
            template_path.write_text(json.dumps(template))
            manifest = json.loads((root / 'product/v2/web_apps/manifest.json').read_text())
            manifest['entries'][0]['path'] = '../google-docs.json'
            (root / 'product/v2/web_apps/manifest.json').write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                load_web_apps(root)

    def test_web_labels_and_definition_size_fit_the_wire_format(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = ROOT / 'product/v2/web_apps'
            directory = root / 'product/v2/web_apps'
            (directory / 'icons').mkdir(parents=True)
            (root / 'product/v2/icons.json').write_text((ROOT / 'product/v2/icons.json').read_text())
            (directory / 'google-docs.json').write_text((source / 'google-docs.json').read_text())
            (directory / 'manifest.json').write_text((source / 'manifest.json').read_text())
            shutil.copy2(source / 'icons/google-docs.png', directory / 'icons/google-docs.png')
            template_path = directory / 'google-docs.json'
            template = json.loads(template_path.read_text())
            template['label'] = 'W' * 49
            template_path.write_text(json.dumps(template))
            with self.assertRaisesRegex(ValueError, 'label must contain 1–48 bytes'):
                load_web_apps(root)
            template['label'] = 'Google Docs'
            template['shortcuts'][0]['label'] = 'B' * 49
            template_path.write_text(json.dumps(template))
            with self.assertRaisesRegex(ValueError, 'invalid shortcut'):
                load_web_apps(root)
            template['shortcuts'][0]['label'] = 'Bold'
            template['url'] += '?q=' + ('x' * 12000)
            template_path.write_text(json.dumps(template))
            with self.assertRaisesRegex(ValueError, 'compact serialized definition exceeds 12000 bytes'):
                load_web_apps(root)


if __name__ == '__main__':
    unittest.main()
