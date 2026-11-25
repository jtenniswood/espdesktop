"""Detect an installed package update and restart into it.

The package manager replaces files on disk while the old process keeps running
its already-loaded code. Fingerprinting the installed package lets the running
companion notice the change and relaunch itself without the user having to quit
and start it manually.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

INSTALL_ROOT = Path("/usr/lib/espdesktop-companion")
PACKAGE_DIR = Path(__file__).resolve().parent
INSTALLED_LAUNCHER = INSTALL_ROOT / "run.py"
INSTALLED_BIN = Path("/usr/bin/espdesktop-companion")


def code_fingerprint(directory: Path | None = None) -> str:
    """Hash the package's Python sources and protocol contract."""
    root = directory if directory is not None else PACKAGE_DIR
    digest = hashlib.sha256()
    if not root.is_dir():
        return digest.hexdigest()
    for path in sorted(root.iterdir()):
        if not path.is_file() or path.suffix not in (".py", ".json"):
            continue
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


def running_from_install() -> bool:
    """True when this process was loaded from the installed package."""
    try:
        PACKAGE_DIR.relative_to(INSTALL_ROOT)
    except ValueError:
        return False
    return True


def should_restart(running_fingerprint: str, current_fingerprint: str,
                   from_install: bool) -> bool:
    return from_install and bool(current_fingerprint) and current_fingerprint != running_fingerprint


RUNNING_FINGERPRINT = code_fingerprint()
