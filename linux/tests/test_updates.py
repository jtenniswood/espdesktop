from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from espdesktop_companion import updates  # noqa: E402


class UpdateDetectionTests(unittest.TestCase):
    def test_fingerprint_changes_when_package_code_changes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "module.py").write_text("value = 1\n", encoding="utf-8")
            (root / "companion_capabilities.json").write_text("{}\n", encoding="utf-8")
            before = updates.code_fingerprint(root)
            self.assertEqual(before, updates.code_fingerprint(root))
            (root / "module.py").write_text("value = 2\n", encoding="utf-8")
            self.assertNotEqual(before, updates.code_fingerprint(root))

    def test_fingerprint_ignores_unrelated_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "module.py").write_text("value = 1\n", encoding="utf-8")
            before = updates.code_fingerprint(root)
            (root / "notes.txt").write_text("ignored\n", encoding="utf-8")
            self.assertEqual(before, updates.code_fingerprint(root))

    def test_should_restart_only_for_installed_changes(self) -> None:
        self.assertTrue(updates.should_restart("old", "new", True))
        self.assertFalse(updates.should_restart("same", "same", True))
        self.assertFalse(updates.should_restart("old", "new", False))
        self.assertFalse(updates.should_restart("old", "", True))

    def test_running_from_install(self) -> None:
        with mock.patch.object(updates, "PACKAGE_DIR",
                               Path("/usr/lib/espdesktop-companion/espdesktop_companion")):
            self.assertTrue(updates.running_from_install())
        with mock.patch.object(updates, "PACKAGE_DIR",
                               Path("/home/user/espdesktop/linux/espdesktop_companion")):
            self.assertFalse(updates.running_from_install())


if __name__ == "__main__":
    unittest.main()
