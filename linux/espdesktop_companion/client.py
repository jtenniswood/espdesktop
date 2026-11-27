"""Pairing, authentication and the connected Companion session."""
from __future__ import annotations

import json
import socket
import time

from PyQt6.QtCore import QObject, QTimer, QUrl, Qt, pyqtSignal
from PyQt6.QtGui import QDesktopServices
from PyQt6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest

from .actions import ActionService
from .catalogue import Catalogue
from .config import Config, Pairing
from .ha import HAEntity, HomeAssistantError, validate_ha_url
from .icons import app_icon_rgb565a8
from .protocol import (
    APP_ICON_CHUNK_BYTES,
    PROTOCOL_VERSION,
    DisplayEndpoint,
    Protocol,
    ProtocolError,
    bound,
    clean_label,
    is_hex16,
    new_nonce,
    resolve_display_address,
    sha256_hex,
    sign_auth_request,
)
from .session import is_locked, timezone_identifier
from .websocket import WebSocketConnection, WebSocketError, WebSocketEvent

CAPABILITIES = [
    "app_icons",
    "app_icons_alpha",
    "app_icons_240",
    "url_card_focus",
    "keyboard_shortcuts_unavailable",
]

PAIRING_ERRORS = {
    "pairing_expired": "The pairing window expired. Open the pairing page again.",
    "pairing_closed": "The pairing window closed. Open the pairing page again.",
    "invalid_message": "The display could not read the pairing request.",
    "invalid_code": "That code was not accepted. Check the code shown on the display.",
    "pairing_invalid_code": "That code was not accepted. Check the code shown on the display.",
    "pairing_failed": "That code was not accepted. Check the code shown on the display.",
    "pairing_throttled": "Wait a few seconds, then try the code again.",
    "already_paired": "This display is already paired. Reset its Companion pairing first.",
    "mac_update_required": "The display needs a newer Companion protocol than this app supports.",
}


class _Bridge(QObject):
    event = pyqtSignal(object)


class CompanionClient(QObject):
    stateChanged = pyqtSignal(str)
    statusChanged = pyqtSignal(str)
    notification = pyqtSignal(str, str)
    pairingChanged = pyqtSignal()
    connectedChanged = pyqtSignal(bool)
    pairingCodeFetched = pyqtSignal(str)
    haEntitiesFetched = pyqtSignal(list, str)
    haSetupFinished = pyqtSignal(str, str, str)

    def __init__(self, config: Config, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.config = config
        self.catalogue = Catalogue(config)
        self.actions = ActionService(config, self.catalogue)
        self.protocol = Protocol.load()
        self.state = "idle"
        self.capability_version = 0
        self.locked = False
        self.connection: WebSocketConnection | None = None
        self._bridge = _Bridge()
        self._bridge.event.connect(self._on_event, Qt.ConnectionType.QueuedConnection)
        self._connection_generation = 0
        self._network = QNetworkAccessManager(self)
        self._endpoint: DisplayEndpoint | None = None
        self._pairing_code = ""
        self._pairing_name = ""
        self._pairing_client_id = ""
        self._pending_fingerprint = ""
        self._intentional = False
        self._failures = 0
        self._auth_retry = False
        self._pairing_timer = QTimer(self)
        self._pairing_timer.setSingleShot(True)
        self._pairing_timer.setInterval(15000)
        self._pairing_timer.timeout.connect(self._pairing_timeout)
        self._reconnect_timer = QTimer(self)
        self._reconnect_timer.setSingleShot(True)
        self._reconnect_timer.timeout.connect(self.connect_saved)
        self._lock_timer = QTimer(self)
        self._lock_timer.setInterval(1000)
        self._lock_timer.timeout.connect(self._poll_lock)
        self._timezone_timer = QTimer(self)
        self._timezone_timer.setInterval(60000)
        self._timezone_timer.timeout.connect(self._poll_timezone)
        self._catalogue_time = 0.0
        self._catalogue_generation = 0
        self._definition_generation = 0
        self._icon_generation = 0
        self._icon_queue: list[tuple[str, bytes, str]] = []
        self._icon_transfer: dict | None = None
        self._icon_timer = QTimer(self)
        self._icon_timer.setSingleShot(True)
        self._icon_timer.setInterval(12000)
        self._icon_timer.timeout.connect(self._icon_timeout)
        self._timezone = ""

    # -- public ---------------------------------------------------------

    def start(self) -> None:
        if self.config.pairing is not None:
            self.connect_saved()

    def start_pairing(self, address: str, code: str) -> None:
        code = code.strip()
        if not 1 <= len(code) <= 16 or not all(char.isascii() and (char.isalnum() or char == "-") for char in code):
            self._status("Enter the pairing code shown on the display.")
            return
        try:
            endpoint = resolve_display_address(address)
        except ProtocolError as error:
            self._status(str(error))
            return
        self._stop()
        self._endpoint = endpoint
        self._pairing_code = code
        self._pairing_name = bound((socket.gethostname() or "Linux computer") + " (Linux)", 96)
        self._pairing_client_id = self.config.ensure_client_id()
        self._intentional = False
        self._pending_fingerprint = ""
        self._set_state("pairing")
        self._status("Connecting to the display…")
        self._connect(endpoint.socket_url, fingerprint=None)
        self._pairing_timer.start()

    def connect_saved(self) -> None:
        pairing = self.config.pairing
        if pairing is None:
            self._set_state("idle")
            return
        try:
            endpoint = resolve_display_address(pairing.address)
        except ProtocolError as error:
            self._status(str(error))
            self._schedule_reconnect()
            return
        self._stop()
        self._endpoint = endpoint
        self._intentional = False
        self._auth_retry = False
        self._set_state("connecting")
        self._status("Connecting to the display…")
        self._connect(endpoint.socket_url, fingerprint=pairing.fingerprint)

    def forget_display(self) -> None:
        # Ask the display to drop this computer's credential as well. The
        # short delay lets the frame flush before the socket closes.
        if self.state == "connected" and self.connection is not None and \
                self._send({}, "pair.reset", "connected"):
            self._intentional = True
            QTimer.singleShot(150, self._finish_forget)
            return
        self._finish_forget()

    def _finish_forget(self) -> None:
        self._stop()
        self.config.clear_pairing()
        self._set_state("idle")
        self._status("Display pairing removed.")
        self.pairingChanged.emit()
        self.connectedChanged.emit(False)

    def open_pairing_page(self, address: str | None = None) -> None:
        target = address or (self.config.pairing.address if self.config.pairing else "")
        if not target:
            self._status("Enter the display address first.")
            return
        try:
            endpoint = resolve_display_address(target)
        except ProtocolError as error:
            self._status(str(error))
            return
        QDesktopServices.openUrl(QUrl(endpoint.pairing_url))

    def fetch_pairing_code(self, address: str) -> None:
        """Ask the display's web page for the current pairing code.

        Reading ``/companion/pairing`` starts a pairing window when the display
        is unpaired, exactly like opening the Companion settings page.
        """
        try:
            endpoint = resolve_display_address(address)
        except ProtocolError as error:
            self._status(str(error))
            return
        request = QNetworkRequest(QUrl(endpoint.pairing_status_url))
        request.setHeader(QNetworkRequest.KnownHeaders.UserAgentHeader, "EspDesktopLinuxCompanion/0.1")
        reply = self._network.get(request)
        timeout = QTimer(reply)
        timeout.setSingleShot(True)
        timeout.timeout.connect(reply.abort)
        timeout.start(6000)
        reply.finished.connect(lambda: self._pairing_code_reply(reply))

    def _pairing_code_reply(self, reply: QNetworkReply) -> None:
        try:
            if reply.error() != QNetworkReply.NetworkError.NoError:
                self._status("Could not read the pairing code from the display.")
                return
            try:
                state = json.loads(bytes(reply.readAll()).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._status("The display returned an invalid pairing response.")
                return
            if state.get("paired") is True:
                self._status("The display is already paired. Reset its Companion pairing first.")
                return
            code = state.get("pairing_code")
            if isinstance(code, str) and code:
                self._status(f"Pairing code: {code}")
                self.pairingCodeFetched.emit(code)
            else:
                self._status("The display did not offer a pairing code.")
        finally:
            reply.deleteLater()

    def fetch_ha_entities(self, url: str, token: str) -> None:
        """Load action-capable Home Assistant entities with the saved token."""
        try:
            base = validate_ha_url(url)
            if not token.strip():
                raise HomeAssistantError("Enter a Home Assistant long-lived access token.")
        except HomeAssistantError as error:
            self.haEntitiesFetched.emit([], str(error))
            return
        request = QNetworkRequest(QUrl(base + "/api/states"))
        request.setRawHeader(b"Authorization", f"Bearer {token.strip()}".encode("utf-8"))
        request.setHeader(QNetworkRequest.KnownHeaders.UserAgentHeader, "EspDesktopLinuxCompanion/0.1")
        reply = self._network.get(request)
        timeout = QTimer(reply)
        timeout.setSingleShot(True)
        timeout.timeout.connect(reply.abort)
        timeout.start(8000)
        reply.finished.connect(lambda: self._ha_entities_reply(reply))

    def _ha_entities_reply(self, reply: QNetworkReply) -> None:
        try:
            if reply.error() != QNetworkReply.NetworkError.NoError:
                message = "Could not reach Home Assistant. Check the address and token."
                if reply.error() in (
                    QNetworkReply.NetworkError.AuthenticationRequiredError,
                    QNetworkReply.NetworkError.ContentAccessDenied,
                ):
                    message = "Home Assistant rejected the access token."
                self.haEntitiesFetched.emit([], message)
                return
            try:
                states = json.loads(bytes(reply.readAll()).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.haEntitiesFetched.emit([], "Home Assistant returned an invalid response.")
                return
            if not isinstance(states, list):
                self.haEntitiesFetched.emit([], "Home Assistant returned an invalid entity list.")
                return
            entities = [
                entity
                for state in states
                if isinstance(state, dict) and (entity := HAEntity.from_state(state)) is not None
            ]
            entities.sort(key=lambda entity: (entity.label.casefold(), entity.entity_id))
            self.haEntitiesFetched.emit([entity.as_dict() for entity in entities], "")
        finally:
            reply.deleteLater()

    def setup_home_assistant(self) -> None:
        """Enable the display's native ESPHome button API, or start legacy pairing."""
        pairing = self.config.pairing
        if pairing is None:
            self.haSetupFinished.emit("", "", "Pair the display first.")
            return
        try:
            endpoint = resolve_display_address(pairing.address)
        except ProtocolError as error:
            self.haSetupFinished.emit("", "", str(error))
            return
        origin = f"http://{endpoint.host}"
        request = QNetworkRequest(QUrl(origin + "/api/v1/reset"))
        request.setRawHeader(b"Origin", origin.encode("utf-8"))
        request.setRawHeader(b"Sec-Fetch-Site", b"same-origin")
        request.setHeader(QNetworkRequest.KnownHeaders.UserAgentHeader, "EspDesktopLinuxCompanion/0.1")
        reply = self._network.get(request)
        timeout = QTimer(reply)
        timeout.setSingleShot(True)
        timeout.timeout.connect(reply.abort)
        timeout.start(8000)
        reply.finished.connect(lambda: self._ha_epoch_reply(reply, origin))

    def _ha_epoch_reply(self, reply: QNetworkReply, origin: str) -> None:
        epoch: int | None = None
        try:
            if reply.error() == QNetworkReply.NetworkError.NoError:
                try:
                    state = json.loads(bytes(reply.readAll()).decode("utf-8"))
                    value = state.get("epoch")
                    if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 0xFFFFFFFF:
                        epoch = value
                except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                    epoch = None
        finally:
            reply.deleteLater()
        self._request_ha_setup_status(origin, epoch)

    def _request_ha_setup_status(self, origin: str, epoch: int | None) -> None:
        request = QNetworkRequest(QUrl(origin + "/api/v1/home-assistant"))
        request.setRawHeader(b"Origin", origin.encode("utf-8"))
        request.setRawHeader(b"Sec-Fetch-Site", b"same-origin")
        request.setHeader(QNetworkRequest.KnownHeaders.UserAgentHeader, "EspDesktopLinuxCompanion/0.1")
        reply = self._network.get(request)
        timeout = QTimer(reply)
        timeout.setSingleShot(True)
        timeout.timeout.connect(reply.abort)
        timeout.start(8000)
        reply.finished.connect(lambda: self._ha_setup_status_reply(reply, origin, epoch))

    def _ha_setup_status_reply(self, reply: QNetworkReply, origin: str, epoch: int | None) -> None:
        try:
            if reply.error() != QNetworkReply.NetworkError.NoError:
                self.haSetupFinished.emit(
                    "",
                    "",
                    f"Could not read the display's HA setup. Open {origin} in a browser and use "
                    "System → Connectors → Home Assistant.",
                )
                return
            try:
                state = json.loads(bytes(reply.readAll()).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.haSetupFinished.emit("", "", "The display returned an invalid HA setup response.")
                return
            fingerprint = state.get("id")
            if not isinstance(fingerprint, str) or not fingerprint:
                self.haSetupFinished.emit("", "", "The display did not return its HA fingerprint.")
                return
            if "enabled" in state:
                if state.get("enabled") is True:
                    self.haSetupFinished.emit(fingerprint, "esphome-enabled", "")
                    return
                self._ha_setup_post(origin, fingerprint, "enable-esphome", "esphome", epoch)
            elif "paired" in state:
                if state.get("paired") is True:
                    self.haSetupFinished.emit(fingerprint, "legacy-paired", "")
                    return
                self._ha_setup_post(origin, fingerprint, "pair", "legacy", epoch)
            else:
                self.haSetupFinished.emit("", "", "The display did not report a supported HA connector.")
        finally:
            reply.deleteLater()

    def _ha_setup_post(
        self, origin: str, fingerprint: str, operation: str, mode: str, epoch: int | None
    ) -> None:
        request = QNetworkRequest(QUrl(origin + "/api/v1/home-assistant"))
        request.setRawHeader(b"X-EspDesktop-Request", operation.encode("ascii"))
        request.setRawHeader(b"Origin", origin.encode("utf-8"))
        request.setRawHeader(b"Sec-Fetch-Site", b"same-origin")
        if epoch is not None:
            request.setRawHeader(b"X-EspDesktop-Epoch", str(epoch).encode("ascii"))
        request.setHeader(QNetworkRequest.KnownHeaders.UserAgentHeader, "EspDesktopLinuxCompanion/0.1")
        reply = self._network.post(request, b"")
        timeout = QTimer(reply)
        timeout.setSingleShot(True)
        timeout.timeout.connect(reply.abort)
        timeout.start(8000)
        reply.finished.connect(lambda: self._ha_setup_post_reply(reply, fingerprint, mode))

    def _ha_setup_post_reply(self, reply: QNetworkReply, fingerprint: str, mode: str) -> None:
        try:
            if reply.error() != QNetworkReply.NetworkError.NoError:
                self.haSetupFinished.emit(
                    "",
                    "",
                    "The display rejected the Home Assistant setup request. Open its web editor "
                    "and use System → Connectors → Home Assistant.",
                )
                return
            self.haSetupFinished.emit(fingerprint, mode, "")
        finally:
            reply.deleteLater()

    def open_display_editor(self) -> None:
        target = self.config.pairing.address if self.config.pairing else ""
        if not target:
            self._status("Pair a display first.")
            return
        try:
            endpoint = resolve_display_address(target)
        except ProtocolError as error:
            self._status(str(error))
            return
        QDesktopServices.openUrl(QUrl(endpoint.editor_url))

    def refresh_catalogue(self) -> None:
        self.catalogue.refresh()
        self._catalogue_time = time.monotonic()
        if self.state == "connected":
            self._send_catalogue()
            self._send_definitions()

    def shutdown(self) -> None:
        self._stop()

    # -- transport ------------------------------------------------------

    def _connect(self, url: str, fingerprint: str | None) -> None:
        self._connection_generation += 1
        generation = self._connection_generation
        try:
            connection = WebSocketConnection(
                url,
                lambda event: self._bridge.event.emit((generation, event)),
                fingerprint=fingerprint,
            )
        except WebSocketError as error:
            self._status(str(error))
            self._schedule_reconnect()
            return
        self.connection = connection
        connection.start()

    def _stop(self) -> None:
        self._intentional = True
        # Ignore queued events from the socket we are closing.
        self._connection_generation += 1
        self._pairing_timer.stop()
        self._reconnect_timer.stop()
        self._lock_timer.stop()
        self._timezone_timer.stop()
        self._icon_timer.stop()
        self._icon_transfer = None
        self._icon_queue.clear()
        if self.connection is not None:
            self.connection.close()
            self.connection.join(1.0)
            self.connection = None

    def _on_event(self, payload: object) -> None:
        if not isinstance(payload, tuple) or len(payload) != 2:
            return
        generation, event = payload
        if generation != self._connection_generation or not isinstance(event, WebSocketEvent):
            return
        if event.kind == "open":
            self._pending_fingerprint = event.fingerprint or ""
            if self.state == "pairing":
                self._send(
                    {
                        "code": self._pairing_code,
                        "name": self._pairing_name,
                        "clientId": self._pairing_client_id,
                    },
                    "pair.request",
                    "pairing",
                )
            elif self.state == "connecting":
                self._begin_auth()
        elif event.kind == "text":
            self._on_text(str(event.data))
        elif event.kind == "error":
            self._on_error(str(event.data))
        elif event.kind == "close":
            self._on_close()

    def _begin_auth(self) -> None:
        pairing = self.config.pairing
        if pairing is None:
            self._set_state("idle")
            return
        if pairing.sequence >= 0xFFFFFFFF:
            self._status("Forget the display and pair it again.")
            self._set_state("idle")
            return
        if not self._pending_fingerprint:
            self._status("The display did not present a certificate.")
            self._schedule_reconnect()
            return
        if self._pending_fingerprint != pairing.fingerprint:
            self._status("The display certificate changed. Forget it and pair again.")
            self._set_state("idle")
            return
        sequence = pairing.sequence + 1
        nonce = new_nonce()
        signature = sign_auth_request(pairing.key, sequence, nonce)
        updated = Pairing(
            address=pairing.address,
            fingerprint=pairing.fingerprint,
            key_hex=pairing.key_hex,
            sequence=sequence,
            display_name=pairing.display_name,
            computer_id=pairing.computer_id,
        )
        self.config.set_pairing(updated)
        self._set_state("authenticating")
        fields = {"sequence": sequence, "nonce": nonce, "signature": signature}
        if pairing.computer_id:
            fields["computerId"] = pairing.computer_id
        self._send(fields, "auth.request", "authenticating")
        self._pairing_timer.start()

    def _on_close(self) -> None:
        if self._intentional:
            return
        if self.state == "pairing":
            self._pairing_timer.stop()
            self._set_state("idle")
            self._status("The display closed the pairing connection.")
            return
        if self.config.pairing is not None:
            self._lock_timer.stop()
            self._timezone_timer.stop()
            self._set_state("reconnecting")
            self._schedule_reconnect()
        else:
            self._set_state("idle")

    def _on_error(self, message: str) -> None:
        if self.state == "pairing":
            self._pairing_timer.stop()
            self._set_state("idle")
            self._status(message)
            return
        self._status(message)
        if self.config.pairing is not None:
            self._set_state("reconnecting")
            self._schedule_reconnect()

    def _schedule_reconnect(self) -> None:
        if self.config.pairing is None:
            self._set_state("idle")
            return
        if self._reconnect_timer.isActive():
            return
        self._failures += 1
        delay = min(30, 2 ** min(self._failures, 5))
        self._status(f"Display unavailable. Reconnecting in {delay}s…")
        self._reconnect_timer.start(delay * 1000)

    def _pairing_timeout(self) -> None:
        if self.state == "pairing":
            self._stop()
            self._set_state("idle")
            self._status("The display did not answer the pairing request.")
        elif self.state == "authenticating":
            self._stop()
            self._set_state("reconnecting")
            self._schedule_reconnect()

    # -- messages -------------------------------------------------------

    def _send(self, fields: dict, message_type: str, state: str) -> bool:
        message = self.protocol.message(message_type, **fields)
        if not self.protocol.validate(message, "mac_to_panel", state):
            self._status(f"Companion refused to send an invalid {message_type} message.")
            return False
        if not self.protocol.encoded_length_ok(message):
            self._status(f"Companion refused to send an oversized {message_type} message.")
            return False
        if self.connection is None:
            return False
        try:
            self.connection.send_text(json.dumps(message, ensure_ascii=False, separators=(",", ":")))
            return True
        except WebSocketError as error:
            self._status(str(error))
            return False

    def _on_text(self, text: str) -> None:
        try:
            message = json.loads(text)
        except json.JSONDecodeError:
            return
        if not self.protocol.validate(message, "panel_to_mac", self.state):
            return
        message_type = message.get("type")
        if message_type == "hello":
            return
        if message_type == "error":
            self._handle_error(message)
            return
        if self.state == "pairing":
            if message_type == "pair.accepted":
                self._pairing_accepted(message)
            return
        if self.state == "authenticating":
            if message_type == "auth.accepted":
                self._authenticated(message)
            return
        if self.state != "connected":
            return
        if message_type == "catalogue.request":
            if time.monotonic() - self._catalogue_time > 60:
                self.catalogue.refresh()
                self._catalogue_time = time.monotonic()
            self._send_catalogue()
            self._send_definitions()
        elif message_type == "action.invoke":
            self._handle_action(message)
        elif message_type == "value.set":
            request_id = str(message.get("requestId", ""))
            if request_id:
                self._send({"requestId": request_id, "status": "not_allowed"}, "action.result", "connected")
        elif message_type == "app_icon.request":
            self._request_icon(str(message.get("appId", "")), message.get("sha256"))
        elif message_type == "app_icon.ack":
            self._icon_ack(message)
        elif message_type == "app_icon.abort":
            self._icon_abort(message)
        elif message_type == "shortcut.catalogue.request":
            self._send(
                {
                    "requestId": message.get("requestId"),
                    "appId": message.get("appId"),
                    "page": message.get("page"),
                    "catalogueVersion": 1,
                    "complete": True,
                },
                "shortcut.catalogue.page",
                "connected",
            )
        elif message_type == "pair.reset":
            self._stop()
            self.config.clear_pairing()
            self._set_state("idle")
            self._status("The display reset its Companion pairing.")
            self.pairingChanged.emit()
            self.connectedChanged.emit(False)

    def _handle_error(self, message: dict) -> None:
        code = str(message.get("code", ""))
        if self.state == "authenticating" and code == "authentication_sequence" and not self._auth_retry:
            last_sequence = message.get("lastSequence")
            pairing = self.config.pairing
            if pairing is not None and isinstance(last_sequence, int):
                self._auth_retry = True
                self.config.set_pairing(
                    Pairing(
                        address=pairing.address,
                        fingerprint=pairing.fingerprint,
                        key_hex=pairing.key_hex,
                        sequence=last_sequence,
                        display_name=pairing.display_name,
                        computer_id=pairing.computer_id,
                    )
                )
                self._stop()
                self._set_state("reconnecting")
                self.connect_saved()
                return
        if code in PAIRING_ERRORS:
            self._status(PAIRING_ERRORS[code])
        else:
            self._status(f"The display reported {code or 'an error'}.")

    def _pairing_accepted(self, message: dict) -> None:
        self._pairing_timer.stop()
        endpoint = self._endpoint
        fingerprint = self._pending_fingerprint
        if endpoint is None or not fingerprint:
            self._status("The display did not complete pairing.")
            self._set_state("idle")
            return
        credential = str(message.get("credential", ""))
        computer_id = message.get("computerId")
        if not isinstance(computer_id, str) or not is_hex16(computer_id):
            computer_id = None
        try:
            pairing = Pairing(
                address=endpoint.address,
                fingerprint=fingerprint,
                key_hex=credential,
                sequence=0,
                display_name=None,
                computer_id=computer_id.lower() if computer_id else None,
            )
            if not pairing.key_hex or len(pairing.key_hex) != 64:
                raise ValueError("invalid credential")
            bytes.fromhex(pairing.key_hex)
        except ValueError:
            self._status("The display returned an invalid pairing credential.")
            self._set_state("idle")
            return
        self._intentional = True
        if self.connection is not None:
            self.connection.close()
            self.connection.join(1.0)
            self.connection = None
        self.config.set_pairing(pairing)
        self.pairingChanged.emit()
        self._status("Paired. Connecting…")
        self.notification.emit("EspDesktop", "The display is paired. Connecting now.")
        QTimer.singleShot(250, self.connect_saved)

    def _authenticated(self, message: dict) -> None:
        self._pairing_timer.stop()
        self.capability_version = int(message.get("capabilityVersion", 0))
        pairing = self.config.pairing
        assigned = message.get("computerId")
        if (
            pairing is not None
            and isinstance(assigned, str)
            and is_hex16(assigned)
            and pairing.computer_id != assigned.lower()
        ):
            self.config.set_pairing(
                Pairing(
                    address=pairing.address,
                    fingerprint=pairing.fingerprint,
                    key_hex=pairing.key_hex,
                    sequence=pairing.sequence,
                    display_name=pairing.display_name,
                    computer_id=assigned.lower(),
                )
            )
        self._failures = 0
        self._auth_retry = False
        self._set_state("connected")
        self._status("Connected to the display.")
        self.connectedChanged.emit(True)
        self.notification.emit("EspDesktop", "Connected to the display.")
        self._timezone = timezone_identifier()
        self._poll_lock(force=True)
        self._send({"values": CAPABILITIES}, "capabilities", "connected")
        self._send({"actionId": "", "actionIds": []}, "focus.changed", "connected")
        self._send({"identifier": self._timezone}, "timezone.changed", "connected")
        self._catalogue_time = time.monotonic()
        self._send_catalogue()
        self._send_definitions()
        self._lock_timer.start()
        self._timezone_timer.start()

    def _send_catalogue(self) -> None:
        try:
            items = self.catalogue.items()
        except Exception:  # noqa: BLE001 - catalogue failures must not drop the session
            items = []
        pages = [items[index:index + 48] for index in range(0, len(items), 48)] or [[]]
        self._catalogue_generation = (self._catalogue_generation % 0xFFFFFFFF) + 1
        generation = self._catalogue_generation
        for index, page in enumerate(pages):
            self._send(
                {
                    "generation": generation,
                    "page": index,
                    "complete": index == len(pages) - 1,
                    "items": page,
                },
                "catalogue.page",
                "connected",
            )

    def _send_definitions(self) -> None:
        if self.capability_version < 5:
            return
        self._definition_generation = (self._definition_generation % 0xFFFFFFFF) + 1
        self._send(
            {
                "generation": self._definition_generation,
                "page": 0,
                "complete": True,
                "items": [],
            },
            "catalogue.definitions.page",
            "connected",
        )

    def _handle_action(self, message: dict) -> None:
        request_id = str(message.get("requestId", ""))
        status, detail = self.actions.invoke(message, self.locked)
        if detail:
            self._status(detail)
        if request_id:
            self._send({"requestId": request_id, "status": status}, "action.result", "connected")

    # -- timers ---------------------------------------------------------

    def _poll_lock(self, force: bool = False) -> None:
        locked = is_locked()
        if force or locked != self.locked:
            self.locked = locked
            self._send({"locked": locked}, "session.lock", "connected")
            if locked:
                self._icon_queue.clear()
                self._icon_transfer = None
                self._icon_timer.stop()

    def _poll_timezone(self) -> None:
        value = timezone_identifier()
        if value != self._timezone:
            self._timezone = value
            self._send({"identifier": value}, "timezone.changed", "connected")

    # -- app icons ------------------------------------------------------

    def _request_icon(self, app_id: str, requested_sha: object) -> None:
        app = self.catalogue.find(app_id)
        if app is None:
            self._send({"appId": app_id}, "app_icon.unavailable", "connected")
            return
        side = self.protocol.app_icon_side if self.capability_version >= 5 else self.protocol.app_icon_legacy_side
        try:
            pixels = app_icon_rgb565a8(app, side)
        except Exception:  # noqa: BLE001 - a bad icon must not break the session
            pixels = None
        if not pixels:
            self._send({"appId": app_id}, "app_icon.unavailable", "connected")
            return
        digest = sha256_hex(pixels)
        if isinstance(requested_sha, str) and requested_sha.lower() == digest:
            self._send({"appId": app_id, "sha256": digest}, "app_icon.unchanged", "connected")
            return
        if self._icon_transfer is not None and self._icon_transfer["app_id"] == app_id:
            return
        if any(item[0] == app_id for item in self._icon_queue):
            return
        self._icon_queue.append((app_id, pixels, digest))
        self._next_icon()

    def _next_icon(self) -> None:
        if self._icon_transfer is not None:
            return
        while self._icon_queue:
            app_id, pixels, digest = self._icon_queue.pop(0)
            self._icon_generation = (self._icon_generation % 0xFFFFFFFF) + 1
            generation = self._icon_generation
            self._icon_transfer = {
                "app_id": app_id,
                "pixels": pixels,
                "sha256": digest,
                "generation": generation,
                "offset": 0,
            }
            sent = self._send(
                {
                    "appId": app_id,
                    "generation": generation,
                    "byteLength": len(pixels),
                    "sha256": digest,
                    "format": "rgb565a8",
                },
                "app_icon.begin",
                "connected",
            )
            if not sent:
                self._icon_transfer = None
                continue
            self._icon_timer.start()
            return

    def _icon_ack(self, message: dict) -> None:
        transfer = self._icon_transfer
        if transfer is None:
            return
        if message.get("generation") != transfer["generation"]:
            return
        if message.get("nextOffset") != transfer["offset"]:
            return
        if self.connection is None:
            return
        pixels = transfer["pixels"]
        offset = transfer["offset"]
        if offset >= len(pixels):
            return
        chunk = pixels[offset:offset + APP_ICON_CHUNK_BYTES]
        frame = (
            b"ICON"
            + transfer["generation"].to_bytes(4, "big")
            + offset.to_bytes(4, "big")
            + chunk
        )
        self.connection.send_binary(frame)
        transfer["offset"] = offset + len(chunk)
        self._icon_timer.start()
        if transfer["offset"] >= len(pixels):
            self._send(
                {"appId": transfer["app_id"], "generation": transfer["generation"]},
                "app_icon.end",
                "connected",
            )
            self._icon_transfer = None
            self._icon_timer.stop()
            self._next_icon()

    def _icon_abort(self, message: dict) -> None:
        transfer = self._icon_transfer
        if transfer is None:
            return
        if (
            message.get("appId") == transfer["app_id"]
            and message.get("generation") == transfer["generation"]
        ):
            self._icon_transfer = None
            self._icon_timer.stop()
            self._next_icon()

    def _icon_timeout(self) -> None:
        transfer = self._icon_transfer
        if transfer is None:
            return
        self._send(
            {"appId": transfer["app_id"], "generation": transfer["generation"]},
            "app_icon.abort",
            "connected",
        )
        self._icon_transfer = None
        self._next_icon()

    # -- state ----------------------------------------------------------

    def _set_state(self, state: str) -> None:
        if state != self.state:
            self.state = state
            self.stateChanged.emit(state)

    def _status(self, message: str) -> None:
        self.statusChanged.emit(message)
