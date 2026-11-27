"""Application entry point for the EspDesktop Linux companion."""
from __future__ import annotations

import argparse
import os
import signal
import sys
import time
from pathlib import Path

from PyQt6.QtCore import QLockFile, QProcess, QStandardPaths, QTimer
from PyQt6.QtNetwork import QLocalServer, QLocalSocket
from PyQt6.QtWidgets import QApplication, QMessageBox

from . import __version__, updates
from .client import CompanionClient
from .config import Config
from .ui import CompanionTray, SettingsWindow

SERVER_NAME = f"espdesktop-companion-{os.getuid()}"
LOCK_NAME = "espdesktop-companion.lock"


def _parse_args(argv: list[str]) -> tuple[argparse.Namespace, list[str]]:
    parser = argparse.ArgumentParser(description="EspDesktop companion for KDE Plasma")
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    parser.add_argument("--address", help="Display IP address or .local name")
    parser.add_argument(
        "--auto-pair",
        action="store_true",
        help="Fetch the display's pairing code and pair without opening the settings page",
    )
    parser.add_argument("--background", action="store_true", help="Start hidden when already paired")
    parser.add_argument("--log", action="store_true", help="Print connection status to stdout")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Stop the running companion and start this build instead",
    )
    parser.add_argument("--allow-instances", action="store_true", help="Skip the single-instance lock")
    return parser.parse_known_args(argv)


def _send_command(command: str, timeout_ms: int = 400) -> bool:
    socket = QLocalSocket()
    socket.connectToServer(SERVER_NAME)
    if not socket.waitForConnected(timeout_ms):
        return False
    socket.write(command.encode("utf-8"))
    socket.flush()
    socket.waitForBytesWritten(timeout_ms)
    socket.disconnectFromServer()
    return True


def _server_available() -> bool:
    socket = QLocalSocket()
    socket.connectToServer(SERVER_NAME)
    connected = socket.waitForConnected(100)
    if connected:
        socket.disconnectFromServer()
    return connected


def _wait_for_server_exit(timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not _server_available():
            return True
        time.sleep(0.1)
    return not _server_available()


def _terminate_previous_instance(cache_path: Path) -> bool:
    """Fallback for a running build that predates the local-socket IPC."""
    lock = QLockFile(str(cache_path / LOCK_NAME))
    lock.setStaleLockTime(0)
    if lock.tryLock(0):
        lock.unlock()
        return True
    info = lock.getLockInfo()
    try:
        if not info[0]:
            return False
        pid = int(info[1])
        host = str(info[2])
    except (TypeError, ValueError, IndexError):
        return False
    if pid <= 0 or (host and host != os.uname().nodename):
        return False
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    except PermissionError:
        return False
    for _ in range(50):
        if lock.tryLock(0):
            lock.unlock()
            return True
        time.sleep(0.1)
    return False


def main(argv: list[str] | None = None) -> int:
    args, qt_args = _parse_args(list(argv if argv is not None else sys.argv[1:]))
    app = QApplication([sys.argv[0], *qt_args])
    app.setApplicationName("EspDesktop Companion")
    app.setApplicationDisplayName("EspDesktop Companion")
    app.setOrganizationName("EspDesktop")

    cache = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.CacheLocation)
    cache_path = Path(cache)
    cache_path.mkdir(parents=True, exist_ok=True)

    if not args.allow_instances:
        if args.replace:
            if not _send_command("quit"):
                if not _terminate_previous_instance(cache_path):
                    print("Could not stop the running companion.", flush=True)
                    return 3
            if not _wait_for_server_exit():
                print("The running companion did not exit.", flush=True)
                return 3
        elif _send_command("show"):
            print("EspDesktop Companion is already running; asked it to show settings.", flush=True)
            return 0

    lock: QLockFile | None = None
    if not args.allow_instances:
        lock = QLockFile(str(cache_path / LOCK_NAME))
        lock.setStaleLockTime(0)
        if not lock.tryLock(100):
            QMessageBox.information(
                None,
                "EspDesktop Companion",
                "EspDesktop Companion is already running. Use its tray icon to open settings, "
                "or run again with --replace to update it.",
            )
            return 0

    config = Config.load()
    client = CompanionClient(config)
    window = SettingsWindow(config, client)
    tray = CompanionTray(window, client)
    if args.log:
        client.stateChanged.connect(lambda state: print(f"state: {state}", flush=True))
        client.statusChanged.connect(lambda text: print(f"status: {text}", flush=True))
        client.pairingChanged.connect(lambda: print("paired", flush=True))
    if args.address:
        window.address.setText(args.address)

    server: QLocalServer | None = None
    connections: set[QLocalSocket] = set()
    if not args.allow_instances:
        QLocalServer.removeServer(SERVER_NAME)
        server = QLocalServer()
        if server.listen(SERVER_NAME):
            def new_connection() -> None:
                connection = server.nextPendingConnection()
                if connection is None:
                    return
                connections.add(connection)

                def handle() -> None:
                    command = bytes(connection.readAll()).decode("utf-8", "replace").strip()
                    if command == "show":
                        window.show()
                        window.raise_()
                        window.activateWindow()
                    elif command == "quit":
                        app.quit()

                def closed() -> None:
                    connections.discard(connection)
                    connection.deleteLater()

                connection.readyRead.connect(handle)
                connection.disconnected.connect(closed)

            server.newConnection.connect(new_connection)

    if args.auto_pair:
        address = args.address or (config.pairing.address if config.pairing else "")
        if not address:
            print("error: --auto-pair needs --address", flush=True)
            return 2

        def auto_pair(code: str) -> None:
            print(f"pairing code: {code}", flush=True)
            client.start_pairing(address, code)

        client.pairingCodeFetched.connect(auto_pair)
        client.fetch_pairing_code(address)

    client.start()
    if args.background and config.pairing is not None:
        window.hide()
    else:
        window.show()

    update_in_progress = False

    def restart_for_update(current_fingerprint: str) -> None:
        nonlocal update_in_progress
        if updates.code_fingerprint() != current_fingerprint:
            update_in_progress = False
            return
        print("Installed companion updated; restarting.", flush=True)
        if updates.INSTALLED_BIN.is_file():
            QProcess.startDetached(str(updates.INSTALLED_BIN), ["--background", "--replace"])
        else:
            QProcess.startDetached(
                sys.executable,
                [str(updates.INSTALLED_LAUNCHER), "--background", "--replace"],
            )
        app.quit()

    def check_for_update() -> None:
        nonlocal update_in_progress
        if update_in_progress or not updates.running_from_install():
            return
        current = updates.code_fingerprint()
        if not updates.should_restart(updates.RUNNING_FINGERPRINT, current, True):
            return
        update_in_progress = True
        # Let a package manager finish replacing files before relaunching.
        QTimer.singleShot(2000, lambda: restart_for_update(current))

    update_timer = QTimer(app)
    update_timer.setInterval(60_000)
    update_timer.timeout.connect(check_for_update)
    update_timer.start()

    app.aboutToQuit.connect(client.shutdown)
    return app.exec()
