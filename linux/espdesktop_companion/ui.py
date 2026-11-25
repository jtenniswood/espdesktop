"""KDE settings window and tray indicator for the Linux companion."""
from __future__ import annotations

import shlex
import sys
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction, QCloseEvent, QIcon
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QCheckBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMenu,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QStyle,
    QSystemTrayIcon,
    QVBoxLayout,
    QWidget,
)

from .client import CompanionClient
from .config import Config
from .ha import HAEntity, HomeAssistantError, validate_ha_url
from .session import config_home

STATE_TEXT = {
    "idle": "Not connected",
    "connecting": "Connecting…",
    "pairing": "Pairing…",
    "authenticating": "Signing in…",
    "connected": "Connected",
    "reconnecting": "Reconnecting…",
}


def companion_icon() -> QIcon:
    for name in ("input-tablet", "computer", "preferences-system"):
        icon = QIcon.fromTheme(name)
        if not icon.isNull():
            return icon
    return QApplication.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)


def autostart_path() -> Path:
    return config_home() / "autostart" / "espdesktop-companion.desktop"


def set_autostart(enabled: bool) -> None:
    path = autostart_path()
    if not enabled:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return
    launcher = Path(__file__).resolve().parents[1] / "run.py"
    if getattr(sys, "frozen", False):
        # PyInstaller one-file builds are their own launcher; the extraction
        # directory disappears after exit.
        command = f"{shlex.quote(sys.executable)} --background"
    else:
        command = f"{shlex.quote(sys.executable)} {shlex.quote(str(launcher))} --background"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=EspDesktop Companion\n"
        "Comment=Control this Linux desktop from an EspDesktop display\n"
        f"Exec={command}\n"
        "Terminal=false\n"
        "X-KDE-autostart-after=panel\n"
        "OnlyShowIn=KDE;\n",
        encoding="utf-8",
    )
    path.chmod(0o644)


class SettingsWindow(QMainWindow):
    def __init__(self, config: Config, client: CompanionClient) -> None:
        super().__init__()
        self.config = config
        self.client = client
        self._updating = False
        self._app_items: dict[str, QListWidgetItem] = {}
        self._ha_items: dict[str, QListWidgetItem] = {}
        self._tray_notice_shown = False
        self.setWindowTitle("EspDesktop Companion")
        self.resize(760, 900)
        self.setWindowIcon(companion_icon())

        central = QWidget()
        layout = QVBoxLayout(central)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(14)

        heading = QLabel("Control this KDE desktop from your EspDesktop display")
        heading.setStyleSheet("font-size: 20px; font-weight: 600;")
        layout.addWidget(heading)

        self.state_label = QLabel("Not connected")
        self.state_label.setStyleSheet("font-weight: 600;")
        layout.addWidget(self.state_label)
        self.status_label = QLabel("Enter the display address, fetch the code, then pair.")
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)

        layout.addWidget(self._build_pairing_group())
        layout.addWidget(self._build_apps_group(), 1)
        layout.addWidget(self._build_ha_group(), 1)
        layout.addWidget(self._build_folders_group())
        layout.addWidget(self._build_options_group())

        self.close_button = QPushButton("Close to tray")
        self.close_button.clicked.connect(self.hide)
        buttons = QHBoxLayout()
        buttons.addStretch(1)
        buttons.addWidget(self.close_button)
        layout.addLayout(buttons)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(central)
        self.setCentralWidget(scroll)

        self.client.stateChanged.connect(self._state_changed)
        self.client.statusChanged.connect(self.status_label.setText)
        self.client.pairingCodeFetched.connect(self._code_fetched)
        self.client.pairingChanged.connect(self._pairing_changed)
        self.client.connectedChanged.connect(self._connected_changed)
        self.client.notification.connect(self._notify)
        self.client.haEntitiesFetched.connect(self._ha_entities_fetched)
        self.client.haSetupFinished.connect(self._ha_setup_finished)
        self._refresh_pairing_fields()
        self._refresh_ha_fields()
        self._populate_apps()
        self._populate_folders()

    # -- construction ---------------------------------------------------

    def _build_pairing_group(self) -> QGroupBox:
        group = QGroupBox("Display")
        form = QFormLayout(group)
        self.address = QLineEdit()
        self.address.setPlaceholderText("192.168.1.50 or espdesktop-....local")
        self.code = QLineEdit()
        self.code.setMaxLength(16)
        self.code.setPlaceholderText("Four-character code shown on the display")
        form.addRow("Address", self.address)
        form.addRow("Pairing code", self.code)

        row = QHBoxLayout()
        self.get_code_button = QPushButton("Get code from display")
        self.get_code_button.clicked.connect(self._get_code)
        self.pair_button = QPushButton("Pair")
        self.pair_button.setDefault(True)
        self.pair_button.clicked.connect(self._pair)
        self.pairing_page_button = QPushButton("Open pairing page")
        self.pairing_page_button.clicked.connect(lambda: self.client.open_pairing_page(self._address()))
        row.addWidget(self.get_code_button)
        row.addWidget(self.pair_button)
        row.addWidget(self.pairing_page_button)
        form.addRow(row)

        row = QHBoxLayout()
        self.editor_button = QPushButton("Open display editor")
        self.editor_button.clicked.connect(self.client.open_display_editor)
        self.reconnect_button = QPushButton("Reconnect")
        self.reconnect_button.clicked.connect(self.client.connect_saved)
        self.forget_button = QPushButton("Forget display")
        self.forget_button.clicked.connect(self._forget)
        row.addWidget(self.editor_button)
        row.addWidget(self.reconnect_button)
        row.addWidget(self.forget_button)
        form.addRow(row)
        return group

    def _build_apps_group(self) -> QGroupBox:
        group = QGroupBox("Applications available to the display")
        layout = QVBoxLayout(group)
        note = QLabel(
            "Only ticked applications can be launched from the display. "
            "The display's editor lists them when you add an Applications card."
        )
        note.setWordWrap(True)
        layout.addWidget(note)

        self.search = QLineEdit()
        self.search.setPlaceholderText("Search applications…")
        self.search.textChanged.connect(self._filter_apps)
        layout.addWidget(self.search)

        self.apps = QListWidget()
        self.apps.setSelectionMode(QAbstractItemView.SelectionMode.NoSelection)
        self.apps.itemChanged.connect(self._app_changed)
        layout.addWidget(self.apps, 1)

        row = QHBoxLayout()
        self.select_all_button = QPushButton("Select all visible")
        self.select_all_button.clicked.connect(lambda: self._set_all_visible(True))
        self.clear_all_button = QPushButton("Clear all")
        self.clear_all_button.clicked.connect(lambda: self._set_all_visible(False))
        self.refresh_apps_button = QPushButton("Refresh applications")
        self.refresh_apps_button.clicked.connect(self._refresh_apps)
        row.addWidget(self.select_all_button)
        row.addWidget(self.clear_all_button)
        row.addStretch(1)
        row.addWidget(self.refresh_apps_button)
        layout.addLayout(row)
        return group

    def _build_ha_group(self) -> QGroupBox:
        group = QGroupBox("Home Assistant actions")
        layout = QVBoxLayout(group)
        note = QLabel(
            "Create a long-lived access token in Home Assistant: Profile → Security → "
            "Long-lived access tokens. Tick scripts, scenes, lights, switches and other "
            "actions to show them as cards on the display. To let HA press the display's "
            "cards, use Set up Home Assistant and then add the display through HA's "
            "ESPHome integration. EspDesktop firmware does not render full HA dashboards."
        )
        note.setWordWrap(True)
        layout.addWidget(note)
        form = QFormLayout()
        self.ha_url = QLineEdit()
        self.ha_url.setPlaceholderText("http://192.168.1.7:8123")
        self.ha_token = QLineEdit()
        self.ha_token.setEchoMode(QLineEdit.EchoMode.Password)
        self.ha_token.setPlaceholderText("Long-lived access token")
        form.addRow("Address", self.ha_url)
        form.addRow("Access token", self.ha_token)
        layout.addLayout(form)
        row = QHBoxLayout()
        self.ha_load_button = QPushButton("Save and load entities")
        self.ha_load_button.clicked.connect(self._load_ha)
        self.ha_pair_button = QPushButton("Set up Home Assistant")
        self.ha_pair_button.clicked.connect(self.client.setup_home_assistant)
        row.addWidget(self.ha_load_button)
        row.addWidget(self.ha_pair_button)
        layout.addLayout(row)
        self.ha_status = QLabel("No Home Assistant entities selected.")
        self.ha_status.setWordWrap(True)
        layout.addWidget(self.ha_status)
        self.ha_search = QLineEdit()
        self.ha_search.setPlaceholderText("Search Home Assistant actions…")
        self.ha_search.textChanged.connect(self._filter_ha)
        layout.addWidget(self.ha_search)
        self.ha_entities = QListWidget()
        self.ha_entities.setSelectionMode(QAbstractItemView.SelectionMode.NoSelection)
        self.ha_entities.itemChanged.connect(self._ha_entity_changed)
        layout.addWidget(self.ha_entities, 1)
        return group

    def _build_folders_group(self) -> QGroupBox:
        group = QGroupBox("Folders available to the display")
        layout = QVBoxLayout(group)
        self.folders = QListWidget()
        self.folders.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        layout.addWidget(self.folders)
        row = QHBoxLayout()
        add_button = QPushButton("Add folder…")
        add_button.clicked.connect(self._add_folder)
        remove_button = QPushButton("Remove selected")
        remove_button.clicked.connect(self._remove_folder)
        row.addWidget(add_button)
        row.addWidget(remove_button)
        row.addStretch(1)
        layout.addLayout(row)
        return group

    def _build_options_group(self) -> QGroupBox:
        group = QGroupBox("Options")
        layout = QVBoxLayout(group)
        self.start_at_login = QCheckBox("Start EspDesktop Companion when I sign in")
        self.start_at_login.toggled.connect(self._start_at_login_changed)
        layout.addWidget(self.start_at_login)
        self.reuse_existing = QCheckBox(
            "Switch to an open app instead of launching a new copy"
        )
        self.reuse_existing.setChecked(self.config.reuse_existing_apps)
        self.reuse_existing.toggled.connect(self._reuse_existing_changed)
        layout.addWidget(self.reuse_existing)
        shortcuts = QLabel(
            "Keyboard shortcut cards are not enabled in this first Linux version. "
            "Applications, folders, websites and the lock card work now."
        )
        shortcuts.setWordWrap(True)
        layout.addWidget(shortcuts)
        return group

    # -- populate -------------------------------------------------------

    def _refresh_pairing_fields(self) -> None:
        pairing = self.config.pairing
        if pairing is not None:
            self.address.setText(pairing.address)
        self.start_at_login.setChecked(self.config.start_at_login)
        self.forget_button.setEnabled(pairing is not None)
        self.editor_button.setEnabled(pairing is not None)

    def _populate_apps(self) -> None:
        self._updating = True
        try:
            self.apps.clear()
            self._app_items.clear()
            for app in self.client.catalogue.apps:
                item = QListWidgetItem(app.name)
                item.setData(Qt.ItemDataRole.UserRole, app.id)
                item.setToolTip(f"{app.desktop_id}\n{app.path}")
                item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
                item.setCheckState(
                    Qt.CheckState.Checked
                    if app.id in self.config.approved_apps
                    else Qt.CheckState.Unchecked
                )
                self.apps.addItem(item)
                self._app_items[app.id] = item
        finally:
            self._updating = False
        self._filter_apps(self.search.text())

    def _refresh_ha_fields(self) -> None:
        self.ha_url.setText(self.config.ha_url)
        self.ha_token.setText(self.config.ha_token)
        self._populate_ha([entity.as_dict() for entity in self.config.ha_entities])
        if self.config.ha_entities:
            self.ha_status.setText(
                f"{len(self.config.ha_entities)} Home Assistant action(s) selected."
            )

    def _load_ha(self) -> None:
        url = self.ha_url.text().strip()
        token = self.ha_token.text().strip()
        try:
            base = validate_ha_url(url)
        except HomeAssistantError as error:
            self.ha_status.setText(str(error))
            return
        if not token:
            self.ha_status.setText("Enter a Home Assistant long-lived access token.")
            return
        self.config.set_home_assistant(base, token)
        self.ha_url.setText(base)
        self.ha_status.setText("Loading Home Assistant entities…")
        self.client.fetch_ha_entities(base, token)

    def _ha_entities_fetched(self, entities: list, error: str) -> None:
        if error:
            self.ha_status.setText(error)
            return
        self._populate_ha(entities)
        self.ha_status.setText(
            f"Loaded {len(entities)} action-capable entities. Tick the ones the display may run."
        )

    def _populate_ha(self, entities: list) -> None:
        self._updating = True
        try:
            self.ha_entities.clear()
            self._ha_items.clear()
            selected = {entity.entity_id for entity in self.config.ha_entities}
            for raw in entities:
                entity = HAEntity.from_dict(raw)
                if entity is None:
                    continue
                item = QListWidgetItem(entity.label)
                item.setData(Qt.ItemDataRole.UserRole, entity.as_dict())
                item.setToolTip(f"{entity.entity_id}\n{entity.domain}")
                item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
                item.setCheckState(
                    Qt.CheckState.Checked
                    if entity.entity_id in selected
                    else Qt.CheckState.Unchecked
                )
                self.ha_entities.addItem(item)
                self._ha_items[entity.entity_id] = item
        finally:
            self._updating = False
        self._filter_ha(self.ha_search.text())

    def _filter_ha(self, text: str) -> None:
        needle = text.strip().casefold()
        for item in self._ha_items.values():
            item.setHidden(bool(needle) and needle not in item.text().casefold())

    def _ha_entity_changed(self, _item: QListWidgetItem) -> None:
        if self._updating:
            return
        selected: list[HAEntity] = []
        for index in range(self.ha_entities.count()):
            item = self.ha_entities.item(index)
            if item.checkState() != Qt.CheckState.Checked:
                continue
            entity = HAEntity.from_dict(item.data(Qt.ItemDataRole.UserRole))
            if entity is not None:
                selected.append(entity)
        self.config.set_ha_entities(selected)
        self.client.refresh_catalogue()
        self.ha_status.setText(f"{len(selected)} Home Assistant action(s) selected.")

    def _ha_setup_finished(self, fingerprint: str, mode: str, error: str) -> None:
        if error:
            self.ha_status.setText(error)
            return
        address = self.config.pairing.address if self.config.pairing else self._address()
        host = address.split(":", 1)[0] if address else "the display address"
        if mode == "esphome":
            self.ha_status.setText(
                "ESPHome API enabled on the display. It is restarting. In Home Assistant: "
                f"Settings → Devices & services → Add integration → ESPHome, then choose the "
                f"discovered display or enter {host}. The display's cards appear as button entities."
            )
        elif mode == "esphome-enabled":
            self.ha_status.setText(
                "The display's ESPHome API is already enabled. In Home Assistant: Settings → "
                f"Devices & services → Add integration → ESPHome, then choose the discovered "
                f"display or enter {host}. Use Resync buttons in the display editor if a card is missing."
            )
        elif mode == "legacy":
            self.ha_status.setText(
                "Home Assistant pairing started. On the display, open System → Home Assistant → "
                f"Pair Home Assistant and read the code. In HA add the EspDesktop integration with "
                f"host {host}, port 8443, fingerprint {fingerprint}, and that code."
            )
        else:
            self.ha_status.setText(
                f"The display is already paired with Home Assistant (fingerprint {fingerprint})."
            )

    def _populate_folders(self) -> None:
        self.folders.clear()
        for folder in self.config.folders:
            item = QListWidgetItem(f"{folder.label} — {folder.path}")
            item.setData(Qt.ItemDataRole.UserRole, folder.id)
            self.folders.addItem(item)

    # -- actions --------------------------------------------------------

    def _address(self) -> str:
        return self.address.text().strip()

    def _get_code(self) -> None:
        address = self._address()
        if not address:
            self.status_label.setText("Enter the display address first.")
            return
        self.client.fetch_pairing_code(address)

    def _code_fetched(self, code: str) -> None:
        self.code.setText(code)
        self.status_label.setText(f"Pairing code {code} loaded. Select Pair to connect.")

    def _pair(self) -> None:
        address = self._address()
        if not address:
            self.status_label.setText("Enter the display address first.")
            return
        code = self.code.text().strip()
        if not code:
            self.client.fetch_pairing_code(address)
            self.status_label.setText("Fetching the pairing code from the display…")
            return
        self.client.start_pairing(address, code)

    def _forget(self) -> None:
        answer = QMessageBox.question(
            self,
            "Forget display",
            "Remove the saved pairing? The display will need to be paired again.",
        )
        if answer == QMessageBox.StandardButton.Yes:
            self.client.forget_display()
            self.code.clear()

    def _filter_apps(self, text: str) -> None:
        needle = text.strip().casefold()
        for item in self._app_items.values():
            item.setHidden(bool(needle) and needle not in item.text().casefold())

    def _app_changed(self, item: QListWidgetItem) -> None:
        if self._updating:
            return
        app_id = item.data(Qt.ItemDataRole.UserRole)
        if not isinstance(app_id, str) or not app_id:
            return
        approved = item.checkState() == Qt.CheckState.Checked
        self.config.set_approved_app(app_id, approved)
        self.client.refresh_catalogue()
        self.status_label.setText(
            f"{'Approved' if approved else 'Removed'} {item.text()} for the display."
        )

    def _set_all_visible(self, checked: bool) -> None:
        self._updating = True
        try:
            for item in self._app_items.values():
                if not item.isHidden():
                    item.setCheckState(Qt.CheckState.Checked if checked else Qt.CheckState.Unchecked)
        finally:
            self._updating = False
        visible_ids = {
            item.data(Qt.ItemDataRole.UserRole)
            for item in self._app_items.values()
            if not item.isHidden()
        }
        for app_id in visible_ids:
            if not isinstance(app_id, str):
                continue
            if checked:
                self.config.approved_apps.add(app_id)
            else:
                self.config.approved_apps.discard(app_id)
        self.config.save()
        self.client.refresh_catalogue()
        self.status_label.setText("Updated the applications available to the display.")

    def _refresh_apps(self) -> None:
        self.client.catalogue.refresh()
        self._populate_apps()
        self.client.refresh_catalogue()
        self.status_label.setText(f"Found {len(self.client.catalogue.apps)} applications.")

    def _add_folder(self) -> None:
        path = QFileDialog.getExistingDirectory(self, "Add a folder for the display", str(Path.home()))
        if not path:
            return
        self.config.add_folder(path)
        self._populate_folders()
        self.client.refresh_catalogue()
        self.status_label.setText(f"Added {Path(path).name}.")

    def _remove_folder(self) -> None:
        item = self.folders.currentItem()
        if item is None:
            return
        folder_id = item.data(Qt.ItemDataRole.UserRole)
        if isinstance(folder_id, str):
            self.config.remove_folder(folder_id)
            self._populate_folders()
            self.client.refresh_catalogue()
            self.status_label.setText("Removed the folder from the display.")

    def _start_at_login_changed(self, checked: bool) -> None:
        self.config.start_at_login = checked
        self.config.save()
        try:
            set_autostart(checked)
        except OSError as error:
            self.status_label.setText(f"Could not update autostart: {error}")

    def _reuse_existing_changed(self, checked: bool) -> None:
        self.config.reuse_existing_apps = checked
        self.config.save()
        self.status_label.setText(
            "Application cards will switch to an open window."
            if checked
            else "Application cards will always launch a new copy."
        )

    # -- client signals -------------------------------------------------

    def _state_changed(self, state: str) -> None:
        self.state_label.setText(STATE_TEXT.get(state, state))
        self.pair_button.setEnabled(state in ("idle", "reconnecting"))
        self.get_code_button.setEnabled(state in ("idle", "reconnecting"))
        if state == "connected":
            self.code.clear()

    def _pairing_changed(self) -> None:
        self._refresh_pairing_fields()
        self.code.clear()

    def _connected_changed(self, connected: bool) -> None:
        self.state_label.setText("Connected" if connected else self.state_label.text())
        self.editor_button.setEnabled(self.config.pairing is not None)

    def _notify(self, title: str, message: str) -> None:
        if not self.isVisible():
            self._tray_notice_shown = True

    def closeEvent(self, event: QCloseEvent) -> None:
        event.ignore()
        self.hide()


class CompanionTray(QSystemTrayIcon):
    def __init__(self, window: SettingsWindow, client: CompanionClient) -> None:
        super().__init__(companion_icon(), window)
        self.window_ref = window
        self.client = client
        self.setToolTip("EspDesktop Companion")
        menu = QMenu()
        self.status_action = QAction("Not connected", menu)
        self.status_action.setEnabled(False)
        menu.addAction(self.status_action)
        menu.addSeparator()
        settings_action = QAction("Open settings", menu)
        settings_action.triggered.connect(self._show)
        menu.addAction(settings_action)
        editor_action = QAction("Open display editor", menu)
        editor_action.triggered.connect(client.open_display_editor)
        menu.addAction(editor_action)
        reconnect_action = QAction("Reconnect", menu)
        reconnect_action.triggered.connect(client.connect_saved)
        menu.addAction(reconnect_action)
        menu.addSeparator()
        quit_action = QAction("Quit", menu)
        quit_action.triggered.connect(QApplication.instance().quit)
        menu.addAction(quit_action)
        self.setContextMenu(menu)
        self.activated.connect(self._activated)
        client.stateChanged.connect(self._state_changed)
        client.notification.connect(self._message)
        self.show()

    def _show(self) -> None:
        self.window_ref.show()
        self.window_ref.raise_()
        self.window_ref.activateWindow()

    def _activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason in (
            QSystemTrayIcon.ActivationReason.Trigger,
            QSystemTrayIcon.ActivationReason.DoubleClick,
        ):
            self._show()

    def _state_changed(self, state: str) -> None:
        text = STATE_TEXT.get(state, state)
        self.status_action.setText(text)
        self.setToolTip(f"EspDesktop Companion — {text}")

    def _message(self, title: str, message: str) -> None:
        self.showMessage(title, message, QSystemTrayIcon.MessageIcon.Information, 4000)
