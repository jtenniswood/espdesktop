"""KDE session state helpers used by the display protocol."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def _run(argv: list[str], timeout: float = 2.0) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError):
        return None


def session_identifier() -> str | None:
    value = os.environ.get("XDG_SESSION_ID", "").strip()
    return value or None


def is_locked() -> bool:
    session = session_identifier()
    if session:
        result = _run(["loginctl", "show-session", session, "-p", "LockedHint", "--value"])
        if result is not None and result.returncode == 0:
            return result.stdout.strip().lower() == "yes"
    result = _run(
        [
            "gdbus",
            "call",
            "--session",
            "--dest",
            "org.freedesktop.login1",
            "--object-path",
            "/org/freedesktop/login1/session/self",
            "--method",
            "org.freedesktop.DBus.Properties.Get",
            "org.freedesktop.login1.Session",
            "LockedHint",
        ]
    )
    return result is not None and result.returncode == 0 and "true" in result.stdout


def lock_session() -> bool:
    session = session_identifier()
    argv = ["loginctl", "lock-session"] + ([session] if session else [])
    result = _run(argv)
    return result is not None and result.returncode == 0


def timezone_identifier() -> str:
    result = _run(["timedatectl", "show", "-p", "Timezone", "--value"])
    if result is not None and result.returncode == 0:
        value = result.stdout.strip()
        if value:
            return value
    try:
        link = os.readlink("/etc/localtime")
        marker = "zoneinfo/"
        if marker in link:
            value = link.split(marker, 1)[1].strip("/")
            if value:
                return value
    except OSError:
        pass
    return "Etc/UTC"


def config_home() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME")
    return Path(base) if base else Path.home() / ".config"
