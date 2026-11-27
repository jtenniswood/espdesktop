"""Activate an existing KDE window through KWin scripting."""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from PyQt6.QtCore import QEventLoop, QObject, QTimer, pyqtSlot
from PyQt6.QtDBus import QDBusConnection, QDBusInterface, QDBusMessage

from .catalogue import DesktopApp

SERVICE = "org.espdesktop.Companion"
INTERFACE = "org.espdesktop.Companion"
OBJECT_PATH = "/EspDesktop"


class _Bridge(QObject):
    def __init__(self) -> None:
        super().__init__()
        self.loop: QEventLoop | None = None
        self.result: tuple[str, bool, str] | None = None

    @pyqtSlot(str, bool, str)
    def WindowActivated(self, request_id: str, success: bool, caption: str) -> None:
        self.result = (request_id, success, caption)
        if self.loop is not None:
            self.loop.quit()


class KWinActivator:
    """Find and focus an existing window; returns False when no window matches."""

    def __init__(self) -> None:
        self._bridge = _Bridge()
        self._bus = QDBusConnection.sessionBus()
        self._registered = self._bus.registerService(SERVICE) and self._bus.registerObject(
            OBJECT_PATH, INTERFACE, self._bridge, QDBusConnection.RegisterOption.ExportAllSlots
        )
        self._scripting = QDBusInterface(
            "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", self._bus
        )
        self._available = self._registered and self._scripting.isValid()
        self._busy = False

    def available(self) -> bool:
        return self._available

    def activate(self, app: DesktopApp, timeout_ms: int = 1500) -> bool:
        if not self._available or self._busy:
            return False
        targets = self._targets(app)
        if not targets:
            return False
        self._busy = True
        request_id = uuid.uuid4().hex[:8]
        plugin = f"espdesktop-activate-{request_id}"
        path = self._script_path(request_id)
        try:
            path.write_text(self._script(targets, request_id), encoding="utf-8")
            loaded = self._scripting.call("loadScript", str(path), plugin)
            if loaded.type() == QDBusMessage.MessageType.ErrorMessage:
                return False
            self._bridge.result = None
            self._bridge.loop = QEventLoop()
            started = self._scripting.call("start")
            if started.type() == QDBusMessage.MessageType.ErrorMessage:
                return False
            QTimer.singleShot(timeout_ms, self._bridge.loop.quit)
            self._bridge.loop.exec()
            result = self._bridge.result
            return bool(result is not None and result[1])
        finally:
            self._scripting.call("unloadScript", plugin)
            self._bridge.loop = None
            try:
                path.unlink()
            except OSError:
                pass
            self._busy = False

    @staticmethod
    def _targets(app: DesktopApp) -> list[str]:
        targets: list[str] = []

        def add(value: str | None) -> None:
            if not value:
                return
            candidate = value.strip().lower()
            if candidate and candidate not in targets:
                targets.append(candidate)

        add(app.wm_class)
        stem = app.desktop_id[:-8] if app.desktop_id.endswith(".desktop") else app.desktop_id
        add(stem)
        add(app.desktop_id)
        add(app.name)
        add(Path(app.exec_argv[0]).name)
        return targets[:8]

    @staticmethod
    def _script_path(request_id: str) -> Path:
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "espdesktop-companion"
        base.mkdir(parents=True, exist_ok=True)
        try:
            base.chmod(0o700)
        except OSError:
            pass
        return base / f"kwin-{request_id}.js"

    @staticmethod
    def _script(targets: list[str], request_id: str) -> str:
        return f"""
(function() {{
  var targets = {json.dumps(targets)};
  var requestId = {json.dumps(request_id)};
  var windows = workspace.windowList ? workspace.windowList() : workspace.clientList();
  var match = null;
  for (var i = 0; i < windows.length; i++) {{
    var w = windows[i];
    if (!w || w.deleted) continue;
    var ids = [String(w.resourceClass || "").toLowerCase(),
               String(w.resourceName || "").toLowerCase(),
               String(w.desktopFileName || "").toLowerCase()];
    for (var t = 0; t < targets.length; t++) {{
      if (ids.indexOf(targets[t]) >= 0) {{ match = w; break; }}
    }}
    if (match) break;
  }}
  if (!match) {{
    callDBus({json.dumps(SERVICE)}, {json.dumps(OBJECT_PATH)}, {json.dumps(INTERFACE)},
      "WindowActivated", requestId, false, "");
    return;
  }}
  try {{ match.minimized = false; }} catch (e) {{}}
  workspace.activeWindow = match;
  callDBus({json.dumps(SERVICE)}, {json.dumps(OBJECT_PATH)}, {json.dumps(INTERFACE)},
    "WindowActivated", requestId, true, String(match.caption || ""));
}})();
"""
