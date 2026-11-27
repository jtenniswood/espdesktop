"""Discover native Linux applications from freedesktop .desktop files."""
from __future__ import annotations

import configparser
import hashlib
import os
import re
import shlex
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import Config
from .protocol import bound, clean_label, utf8_length

_FIELD_CODE = re.compile(r"%[fFuUdDnNickvm]")
_DESKTOP_ID_LIMIT = 96


@dataclass(frozen=True)
class DesktopApp:
    id: str
    desktop_id: str
    path: Path
    name: str
    exec_argv: tuple[str, ...]
    terminal: bool
    icon: str
    wm_class: str | None
    categories: tuple[str, ...]

    def launch_argv(self) -> list[str] | None:
        argv = list(self.exec_argv)
        if self.terminal:
            terminal = shutil.which("konsole") or shutil.which("xterm")
            if terminal is None:
                return None
            argv = [terminal, "-e", *argv]
        return argv


def application_directories() -> list[Path]:
    directories: list[Path] = []
    data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    data_dirs = os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share")
    directories.append(data_home / "applications")
    for entry in data_dirs.split(":"):
        if entry:
            directories.append(Path(entry) / "applications")
    directories.extend(
        [
            Path("/var/lib/flatpak/exports/share/applications"),
            data_home / "flatpak" / "exports" / "share" / "applications",
            Path("/var/lib/snapd/desktop/applications"),
        ]
    )
    snap_home = Path.home() / "snap"
    if snap_home.is_dir():
        for entry in snap_home.glob("*/current/meta/gui"):
            directories.append(entry)
    seen: set[Path] = set()
    result: list[Path] = []
    for directory in directories:
        resolved = directory.expanduser()
        if resolved not in seen and resolved.is_dir():
            seen.add(resolved)
            result.append(resolved)
    return result


def _application_id(desktop_id: str) -> str:
    stem = desktop_id[:-8] if desktop_id.endswith(".desktop") else desktop_id
    candidate = f"linux.{stem}"
    if utf8_length(candidate) > _DESKTOP_ID_LIMIT:
        candidate = "linux." + hashlib.sha256(desktop_id.encode("utf-8")).hexdigest()[:32]
    return candidate


def _exec_arguments(command: str, name: str, path: Path) -> tuple[str, ...] | None:
    command = command.replace("%%", "\x00")
    try:
        tokens = shlex.split(command, posix=True)
    except ValueError:
        return None
    arguments: list[str] = []
    for token in tokens:
        token = token.replace("%c", name).replace("%k", str(path))
        token = _FIELD_CODE.sub("", token)
        token = token.replace("\x00", "%")
        if token:
            arguments.append(token)
    if not arguments:
        return None
    return tuple(arguments)


def _parse_desktop_file(path: Path, desktop_id: str, used_ids: set[str]) -> DesktopApp | None:
    parser = configparser.RawConfigParser(
        interpolation=None,
        strict=False,
        delimiters=("=",),
        comment_prefixes=("#",),
    )
    parser.optionxform = str
    try:
        with path.open(encoding="utf-8", errors="replace") as handle:
            parser.read_file(handle)
    except (OSError, configparser.Error):
        return None
    if not parser.has_section("Desktop Entry"):
        return None
    entry = parser["Desktop Entry"]

    def value(key: str) -> str:
        return entry.get(key, "").strip()

    if value("Type") not in ("Application", ""):
        return None
    if value("Hidden").lower() == "true" or value("NoDisplay").lower() == "true":
        return None
    name = value("Name")
    command = value("Exec")
    if not name or not command:
        return None
    only_show_in = [item for item in value("OnlyShowIn").split(";") if item]
    if only_show_in and "KDE" not in only_show_in:
        return None
    if "KDE" in value("NotShowIn").split(";"):
        return None
    try_exec = value("TryExec")
    if try_exec and shutil.which(try_exec) is None and not Path(try_exec).is_file():
        return None
    arguments = _exec_arguments(command, name, path)
    if arguments is None:
        return None
    app_id = _application_id(desktop_id)
    if app_id in used_ids:
        return None
    used_ids.add(app_id)
    wm_class = value("StartupWMClass") or value("WMClass") or None
    return DesktopApp(
        id=app_id,
        desktop_id=desktop_id,
        path=path,
        name=name,
        exec_argv=arguments,
        terminal=value("Terminal").lower() == "true",
        icon=value("Icon"),
        wm_class=wm_class,
        categories=tuple(item for item in value("Categories").split(";") if item),
    )


def scan_apps() -> list[DesktopApp]:
    apps: list[DesktopApp] = []
    used_ids: set[str] = set()
    for directory in application_directories():
        try:
            entries = sorted(directory.iterdir(), key=lambda entry: entry.name.casefold())
        except OSError:
            continue
        for path in entries:
            if path.suffix != ".desktop" or not path.is_file():
                continue
            app = _parse_desktop_file(path, path.name, used_ids)
            if app is not None:
                apps.append(app)
    apps.sort(key=lambda app: (app.name.casefold(), app.id))
    return apps


class Catalogue:
    """Approved applications and folders exposed to the display."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.apps: list[DesktopApp] = []
        self.refresh()

    def refresh(self) -> None:
        self.apps = scan_apps()

    def approved_apps(self) -> list[DesktopApp]:
        return [app for app in self.apps if app.id in self.config.approved_apps]

    def find(self, app_id: str) -> DesktopApp | None:
        for app in self.apps:
            if app.id == app_id and app.id in self.config.approved_apps:
                return app
        return None

    def items(self) -> list[dict]:
        items: list[dict] = []
        for folder in self.config.folders:
            if os.path.isdir(folder.path):
                items.append({"id": folder.id, "label": clean_label(folder.label)})
        for app in self.approved_apps():
            label = clean_label(app.name)
            if label:
                items.append({"id": app.id, "label": bound(label, 96)})
        for entity in self.config.ha_entities:
            action_id = entity.action_id
            if utf8_length(action_id) > 96:
                continue
            items.append(
                {
                    "id": action_id,
                    "label": bound(clean_label("HA · " + entity.label), 96),
                }
            )
        return items

    def find_ha(self, action_id: str):
        return next((entity for entity in self.config.ha_entities if entity.action_id == action_id), None)

    def launch(self, app: DesktopApp) -> bool:
        argv = app.launch_argv()
        if argv is None:
            return False
        try:
            subprocess.Popen(
                argv,
                cwd=str(Path.home()),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
                close_fds=True,
            )
            return True
        except (OSError, ValueError):
            return False
