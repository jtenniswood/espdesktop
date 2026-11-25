from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "linux" / "Packaging" / "build_linux_release.py"


def load_builder():
    spec = importlib.util.spec_from_file_location("build_linux_release", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(shutil.which("dpkg-deb"), "dpkg-deb is required")
class DebianPackageTests(unittest.TestCase):
    def test_package_contains_contract_and_can_load_it(self) -> None:
        builder = load_builder()
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "out"
            deb = builder.build_deb("0.0.1", output)
            extracted = Path(temporary) / "root"
            subprocess.run(["dpkg-deb", "-x", str(deb), str(extracted)], check=True)
            library = extracted / "usr/lib/espdesktop-companion"
            package = library / "espdesktop_companion"
            self.assertTrue((package / "companion_capabilities.json").is_file())

            environment = dict(os.environ)
            environment["PYTHONPATH"] = str(library)
            result = subprocess.run(
                [sys.executable, "-c",
                 "from espdesktop_companion.protocol import Protocol; print(Protocol.load().version)"],
                capture_output=True, text=True, env=environment, check=True,
            )
            self.assertEqual(result.stdout.strip(), "4")


if __name__ == "__main__":
    unittest.main()
