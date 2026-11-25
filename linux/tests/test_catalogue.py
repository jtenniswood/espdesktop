from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from espdesktop_companion.catalogue import (  # noqa: E402
    Catalogue,
    _exec_arguments,
    _parse_desktop_file,
)
from espdesktop_companion.config import Config, Folder  # noqa: E402
from espdesktop_companion.ha import HAEntity  # noqa: E402

DESKTOP_ENTRY = """\
[Desktop Entry]
Type=Application
Name=Sample App
Exec=sample --flag %U %c
Icon=sample
StartupWMClass=sample-app
Categories=Utility;Development;
"""


class DesktopFileTests(unittest.TestCase):
    def test_parse_application(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.desktop"
            path.write_text(DESKTOP_ENTRY, encoding="utf-8")
            app = _parse_desktop_file(path, path.name, set())
            self.assertIsNotNone(app)
            assert app is not None
            self.assertEqual(app.name, "Sample App")
            self.assertEqual(app.id, "linux.sample")
            self.assertEqual(app.wm_class, "sample-app")
            self.assertEqual(app.exec_argv, ("sample", "--flag", "Sample App"))

    def test_hidden_and_nodisplay_are_skipped(self) -> None:
        for key in ("Hidden", "NoDisplay"):
            with tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / "hidden.desktop"
                path.write_text(DESKTOP_ENTRY.replace("Categories=", f"{key}=true\nCategories="), encoding="utf-8")
                self.assertIsNone(_parse_desktop_file(path, path.name, set()))

    def test_duplicate_ids_are_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.desktop"
            path.write_text(DESKTOP_ENTRY, encoding="utf-8")
            used: set[str] = set()
            self.assertIsNotNone(_parse_desktop_file(path, path.name, used))
            self.assertIsNone(_parse_desktop_file(path, path.name, used))

    def test_exec_field_codes(self) -> None:
        self.assertEqual(
            _exec_arguments('sample --file=%f --name "%c" %k', "Sample", Path("/tmp/sample.desktop")),
            ("sample", "--file=", "--name", "Sample", "/tmp/sample.desktop"),
        )


class CatalogueItemsTests(unittest.TestCase):
    def test_folders_then_apps(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder_path = Path(temporary) / "Projects"
            folder_path.mkdir()
            config = Config(path=Path(temporary) / "config.json")
            config.folders = [Folder("folder.test", "Projects", str(folder_path))]
            config.approved_apps = {"linux.sample"}
            catalogue = Catalogue(config)
            catalogue.apps = []
            from espdesktop_companion.catalogue import DesktopApp

            app = DesktopApp(
                id="linux.sample",
                desktop_id="sample.desktop",
                path=Path(temporary) / "sample.desktop",
                name="Sample",
                exec_argv=("sample",),
                terminal=False,
                icon="sample",
                wm_class=None,
                categories=(),
            )
            catalogue.apps = [app]
            self.assertEqual(
                catalogue.items(),
                [
                    {"id": "folder.test", "label": "Projects"},
                    {"id": "linux.sample", "label": "Sample"},
                ],
            )

    def test_home_assistant_items(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            config = Config(path=Path(temporary) / "config.json")
            config.ha_entities = [HAEntity("light.kitchen", "Kitchen Lights", "light")]
            catalogue = Catalogue(config)
            catalogue.apps = []
            self.assertEqual(
                catalogue.items(),
                [{"id": "ha.light.kitchen", "label": "HA · Kitchen Lights"}],
            )
            self.assertEqual(
                catalogue.find_ha("ha.light.kitchen").entity_id,
                "light.kitchen",
            )
            self.assertIsNone(catalogue.find_ha("ha.light.other"))


if __name__ == "__main__":
    unittest.main()
