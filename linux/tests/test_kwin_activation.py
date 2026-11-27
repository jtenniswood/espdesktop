"""Live KWin activation probe for the Linux companion.

Run on a KDE Plasma 6 Wayland session with the target application open:

    PYTHONPATH=linux python3 linux/tests/test_kwin_activation.py --target org.kde.dolphin --target dolphin

It registers a temporary D-Bus object, asks KWin to run a small script that
activates the first matching window, and reports whether the callback arrived.
"""
from __future__ import annotations

import argparse
import json
import tempfile
import uuid
from pathlib import Path

from PyQt6.QtCore import QCoreApplication, QEventLoop, QObject, QTimer, pyqtSlot
from PyQt6.QtDBus import QDBusConnection, QDBusInterface, QDBusMessage

SERVICE = "org.espdesktop.KWinProbe"
INTERFACE = "org.espdesktop.KWinProbe"
OBJECT_PATH = "/EspDesktopProbe"
PLUGIN = "espdesktop-kwin-probe"


class Bridge(QObject):
    def __init__(self) -> None:
        super().__init__()
        self.loop = QEventLoop()
        self.result: tuple[bool, str] | None = None

    @pyqtSlot(str, bool, str)
    def WindowActivated(self, request_id: str, success: bool, caption: str) -> None:
        self.result = (success, caption)
        self.loop.quit()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", action="append", default=None)
    args = parser.parse_args()
    targets = [target.lower() for target in (args.target or ["org.kde.dolphin", "dolphin"])]

    app = QCoreApplication([])
    bus = QDBusConnection.sessionBus()
    if not bus.registerService(SERVICE):
        print("Could not register the probe D-Bus service.")
        return 2
    bridge = Bridge()
    if not bus.registerObject(OBJECT_PATH, INTERFACE, bridge, QDBusConnection.RegisterOption.ExportAllSlots):
        print("Could not register the probe D-Bus object.")
        return 3

    request_id = uuid.uuid4().hex[:8]
    script = f"""
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
    path = Path(tempfile.gettempdir()) / f"espdesktop-kwin-{request_id}.js"
    path.write_text(script, encoding="utf-8")
    scripting = QDBusInterface("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", bus)
    loaded = scripting.call("loadScript", str(path), PLUGIN)
    print("loadScript:", loaded.type(), loaded.errorMessage(), loaded.arguments())
    if loaded.type() == QDBusMessage.MessageType.ErrorMessage:
        return 5
    started = scripting.call("start")
    print("start:", started.type(), started.errorMessage())
    QTimer.singleShot(2500, bridge.loop.quit)
    bridge.loop.exec()
    scripting.call("unloadScript", PLUGIN)
    try:
        path.unlink()
    except OSError:
        pass
    if bridge.result is None:
        print("No activation callback; KWin scripting did not reach the probe.")
        return 6
    success, caption = bridge.result
    print("Activated:", success, "caption:", caption)
    return 0 if success else 7


if __name__ == "__main__":
    raise SystemExit(main())
