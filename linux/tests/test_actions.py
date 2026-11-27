from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from espdesktop_companion.actions import ActionService  # noqa: E402
from espdesktop_companion.catalogue import Catalogue, DesktopApp  # noqa: E402
from espdesktop_companion.config import Config  # noqa: E402


class FakeActivator:
    def __init__(self, result: bool) -> None:
        self.result = result
        self.calls: list[str] = []

    def activate(self, app: DesktopApp) -> bool:
        self.calls.append(app.id)
        return self.result


class AppSwitchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.app = DesktopApp(
            id="linux.sample",
            desktop_id="sample.desktop",
            path=Path(self.temporary.name) / "sample.desktop",
            name="Sample",
            exec_argv=("sample",),
            terminal=False,
            icon="sample",
            wm_class="sample",
            categories=(),
        )
        self.config = Config(path=Path(self.temporary.name) / "config.json")
        self.config.approved_apps = {self.app.id}
        self.catalogue = Catalogue(self.config)
        self.catalogue.apps = [self.app]
        self.launched: list[str] = []
        self.catalogue.launch = lambda app: self.launched.append(app.id) or True

    def invoke(self, activator: FakeActivator, reuse: bool) -> tuple[str, str]:
        self.config.reuse_existing_apps = reuse
        service = ActionService(self.config, self.catalogue, activator=activator)
        return service.invoke(
            {"kind": "action", "requestId": "r1", "actionId": self.app.id},
            locked=False,
        )

    def test_switches_to_existing_window(self) -> None:
        activator = FakeActivator(True)
        self.assertEqual(self.invoke(activator, reuse=True)[0], "activated")
        self.assertEqual(activator.calls, [self.app.id])
        self.assertEqual(self.launched, [])

    def test_launches_when_no_window_matches(self) -> None:
        activator = FakeActivator(False)
        self.assertEqual(self.invoke(activator, reuse=True)[0], "opened")
        self.assertEqual(activator.calls, [self.app.id])
        self.assertEqual(self.launched, [self.app.id])

    def test_always_launches_when_option_is_off(self) -> None:
        activator = FakeActivator(True)
        self.assertEqual(self.invoke(activator, reuse=False)[0], "opened")
        self.assertEqual(activator.calls, [])
        self.assertEqual(self.launched, [self.app.id])

    def test_reuse_defaults_to_enabled(self) -> None:
        loaded = Config.load(self.config.path)
        self.assertTrue(loaded.reuse_existing_apps)
        self.config.reuse_existing_apps = False
        self.config.save()
        self.assertFalse(Config.load(self.config.path).reuse_existing_apps)


if __name__ == "__main__":
    unittest.main()
