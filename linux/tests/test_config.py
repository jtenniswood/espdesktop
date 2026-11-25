from __future__ import annotations

import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from espdesktop_companion.config import Config, Folder, Pairing  # noqa: E402
from espdesktop_companion.ha import HAEntity  # noqa: E402

KEY = "ab" * 32
FINGERPRINT = "cd" * 32


class ConfigTests(unittest.TestCase):
    def test_round_trip_keeps_pairing_private(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "config.json"
            config = Config(path=path)
            config.set_pairing(Pairing("192.168.1.94:8443", FINGERPRINT, KEY, sequence=3))
            config.approved_apps = {"linux.sample"}
            config.add_folder(temporary)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            loaded = Config.load(path)
            self.assertIsNotNone(loaded.pairing)
            assert loaded.pairing is not None
            self.assertEqual(loaded.pairing.key, bytes.fromhex(KEY))
            self.assertEqual(loaded.pairing.sequence, 3)
            self.assertEqual(loaded.approved_apps, {"linux.sample"})
            self.assertEqual(len(loaded.folders), 1)

    def test_invalid_pairing_is_ignored(self) -> None:
        self.assertIsNone(Pairing.from_dict({"address": "192.168.1.94", "fingerprint": "x", "key": KEY}))
        self.assertIsNone(Pairing.from_dict({"address": "", "fingerprint": FINGERPRINT, "key": KEY}))

    def test_missing_file_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            config = Config.load(Path(temporary) / "missing.json")
            self.assertIsNone(config.pairing)
            self.assertEqual(config.approved_apps, set())

    def test_folder_requires_absolute_path(self) -> None:
        self.assertIsNone(Folder.from_dict({"id": "folder.a", "label": "A", "path": "relative"}))
        self.assertIsNotNone(Folder.from_dict({"id": "folder.a", "label": "A", "path": "/tmp"}))

    def test_home_assistant_settings_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "config.json"
            config = Config(path=path)
            config.set_home_assistant("http://192.168.1.7:8123", "secret-token")
            config.set_ha_entities([HAEntity("light.kitchen", "Kitchen Lights", "light")])
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            loaded = Config.load(path)
            self.assertEqual(loaded.ha_url, "http://192.168.1.7:8123")
            self.assertEqual(loaded.ha_token, "secret-token")
            self.assertEqual(len(loaded.ha_entities), 1)
            self.assertEqual(loaded.ha_entities[0].entity_id, "light.kitchen")


if __name__ == "__main__":
    unittest.main()
