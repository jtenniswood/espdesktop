"""EspDesktop Companion protocol 4: contract loading, validation and helpers.

The display owns the protocol schema in ``product/v2/companion_capabilities.json``.
The Linux companion reads that same contract so tests and runtime validation stay
in step with the firmware, macOS app and Windows preview.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

PROTOCOL_VERSION = 4
PROTOCOL_PATH = "/companion/v4"
DEFAULT_PORT = 8443
MAXIMUM_TEXT_FRAME_BYTES = 16384
APP_ICON_CHUNK_BYTES = 4096
APP_ICON_SIDE = 240
APP_ICON_LEGACY_SIDE = 144

_HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")
_HEX32 = re.compile(r"^[0-9a-f]{32}$")
_SAFE_HOST = re.compile(r"^[A-Za-z0-9.-]+$")
_LOCAL_SUFFIXES = (".local", ".home.arpa")

ROOT = Path(__file__).resolve().parents[2]
CONTRACT_FILENAME = "companion_capabilities.json"
DEFAULT_CONTRACT = Path(__file__).resolve().parent / CONTRACT_FILENAME


def contract_candidates() -> tuple[Path, ...]:
    """Return the contract locations used by checkouts, debs, and bundles."""
    return (
        Path(__file__).resolve().parent / CONTRACT_FILENAME,
        ROOT / "product" / "v2" / CONTRACT_FILENAME,
        Path("/usr/share/espdesktop-companion") / CONTRACT_FILENAME,
    )


def default_contract_path() -> Path:
    candidates = contract_candidates()
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


class ProtocolError(ValueError):
    """Raised for malformed protocol data or unsupported displays."""


def utf8_length(value: str) -> int:
    return len(value.encode("utf-8"))


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sign_auth_request(key: bytes, sequence: int, nonce: str) -> str:
    message = f"auth.request|{sequence}|{nonce}".encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def bound(text: str, maximum_bytes: int) -> str:
    """Trim text without splitting a UTF-8 code point."""
    result: list[str] = []
    used = 0
    for char in text:
        size = utf8_length(char)
        if used + size > maximum_bytes:
            break
        result.append(char)
        used += size
    return "".join(result)


def clean_label(value: str, maximum_bytes: int = 96) -> str:
    cleaned = "".join(" " if char in "|," or ord(char) < 32 else char for char in value)
    cleaned = bound(cleaned.strip(), maximum_bytes)
    return cleaned or "Unnamed"


def _json_equal(left: object, right: object) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    return left == right


def _input_device_control_id(value: str) -> bool:
    prefix = "input.level."
    if len(value) != len(prefix) + 64 or not value.startswith(prefix):
        return False
    return all(char in "0123456789abcdef" for char in value[len(prefix):])


def _obs_audio_uuid(value: str, prefix: str) -> bool:
    if not value.startswith(prefix) or len(value) != len(prefix) + 36:
        return False
    identifier = value[len(prefix):]
    for index, char in enumerate(identifier):
        if index in (8, 13, 18, 23):
            if char != "-":
                return False
        elif char not in "0123456789abcdef":
            return False
    return True


def _writable_audio_control_id(value: str) -> bool:
    if value in {"media.output_volume", "media.input_volume", "media.output_mute", "media.input_mute"}:
        return True
    if _obs_audio_uuid(value, "obs.level."):
        return True
    return False


def volume_control_id_valid(value: str) -> bool:
    if _input_device_control_id(value) or _writable_audio_control_id(value):
        return True
    if value == "media.cough" or _obs_audio_uuid(value, "obs.cough."):
        return True
    prefix = "app.volume."
    if not value.startswith(prefix) or len(value) <= len(prefix) or len(value) > 107:
        return False
    return all(char.isascii() and (char.isalnum() or char in ".-") for char in value[len(prefix):])


@dataclass(frozen=True)
class Protocol:
    version: int
    path: str
    maximum_text_frame_bytes: int
    maximum_binary_frame_bytes: int
    app_icon_chunk_bytes: int
    app_icon_side: int
    app_icon_legacy_side: int
    messages: dict[str, dict]

    @classmethod
    def load(cls, path: str | Path | None = None) -> "Protocol":
        if path is not None:
            contract_path = Path(path)
            searched = str(contract_path)
        else:
            contract_path = default_contract_path()
            searched = ", ".join(str(candidate) for candidate in contract_candidates())
        try:
            data = json.loads(contract_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ProtocolError(f"Could not read the Companion contract (looked in {searched})") from error
        try:
            protocol = data["protocol"]
            messages = {item["id"]: item for item in protocol["messages"]}
            return cls(
                version=int(protocol["version"]),
                path=str(protocol["path"]),
                maximum_text_frame_bytes=int(protocol["maximumTextFrameBytes"]),
                maximum_binary_frame_bytes=int(protocol["maximumArtworkBytes"]),
                app_icon_chunk_bytes=int(protocol["appIconChunkBytes"]),
                app_icon_side=int(protocol["appIconSide"]),
                app_icon_legacy_side=int(protocol.get("appIconLegacySide", 144)),
                messages=messages,
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ProtocolError(f"The Companion contract at {contract_path} is incomplete") from error

    def message(self, message_type: str, **fields: object) -> dict:
        if message_type not in self.messages:
            raise ProtocolError(f"Unknown Companion message {message_type!r}")
        message: dict = {"protocol": self.version, "type": message_type}
        message.update(fields)
        return message

    def validate(self, value: object, direction: str, state: str) -> bool:
        """Mirror the generated C++/Swift/Windows validators."""
        try:
            if not isinstance(value, dict) or len(value) != len(set(value)):
                return False
            if value.get("protocol") != self.version:
                return False
            message_type = value.get("type")
            if not isinstance(message_type, str) or message_type not in self.messages:
                return False
            rule = self.messages[message_type]
            allowed = rule.get("direction")
            if allowed not in (direction, "bidirectional"):
                return False
            if state not in rule.get("states", []):
                return False
            if not self._fields(value, rule.get("fields", {})):
                return False
            for condition in rule.get("requiresWhen", []):
                name = condition["field"]
                present = name in value
                positive = "equals" in condition
                expected = condition["equals"] if positive else condition["unlessEquals"]
                matches = present and _json_equal(value[name], expected)
                if matches == positive and any(field not in value for field in condition["required"]):
                    return False
            return True
        except (KeyError, TypeError, ValueError):
            return False

    def encoded_length_ok(self, message: dict) -> bool:
        encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return len(encoded) <= self.maximum_text_frame_bytes

    def _fields(self, value: dict, fields: dict) -> bool:
        for name, rule in fields.items():
            if name not in value:
                if rule.get("optional"):
                    continue
                return False
            if not self._field(value[name], rule):
                return False
        return True

    def _field(self, value: object, rule: dict) -> bool:
        kind = rule.get("type")
        if kind == "string":
            if not isinstance(value, str) or "\x00" in value:
                return False
            size = utf8_length(value)
            if size < rule["minLength"] or size > rule["maxLength"]:
                return False
            if "enum" in rule and value not in rule["enum"]:
                return False
            pattern = rule.get("pattern")
            if pattern == "hex64":
                return bool(_HEX64.fullmatch(value))
            if pattern in ("volume_control_id", "writable_volume_control_id"):
                return volume_control_id_valid(value)
            if pattern:
                try:
                    return re.fullmatch(pattern, value) is not None
                except re.error:
                    return False
            return True
        if kind == "boolean":
            return isinstance(value, bool)
        if kind in ("number", "integer"):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return False
            number = float(value)
            if number != number or number in (float("inf"), float("-inf")):
                return False
            if number < rule["minimum"] or number > rule["maximum"]:
                return False
            return kind != "integer" or number.is_integer()
        if kind == "object":
            return isinstance(value, dict) and len(value) == len(set(value)) and self._fields(
                value, rule.get("fields", {})
            )
        if kind == "array":
            if not isinstance(value, list) or len(value) > rule["maxItems"]:
                return False
            return all(self._field(item, rule["items"]) for item in value)
        return False


@dataclass(frozen=True)
class DisplayEndpoint:
    address: str
    host: str
    port: int
    socket_url: str
    settings_url: str
    pairing_url: str
    pairing_status_url: str
    editor_url: str


def _is_local_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return address.is_loopback or address.is_private or address.is_link_local


def resolve_display_address(value: str) -> DisplayEndpoint:
    """Accept an IP or local hostname and return the display's URLs.

    Only local addresses are allowed so a typo cannot send pairing traffic or the
    saved credential to a public host.
    """
    raw = value.strip()
    if not raw:
        raise ProtocolError("Enter the display's IP address or .local name.")
    if "://" not in raw:
        raw = "wss://" + raw
    parsed = urlsplit(raw)
    if parsed.scheme not in ("ws", "wss", "http", "https") or parsed.username or parsed.password:
        raise ProtocolError("Enter a local display IP address or .local name.")
    host = parsed.hostname or ""
    if not host or len(host) > 255:
        raise ProtocolError("Enter a local display IP address or .local name.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None:
        if not _is_local_address(address):
            raise ProtocolError("The display address must be on the local network.")
        host = str(address)
        explicit_port = parsed.port is not None
    else:
        host = host.rstrip(".").lower()
        if not _SAFE_HOST.fullmatch(host) or not (
            host == "localhost" or host.endswith(_LOCAL_SUFFIXES)
        ):
            raise ProtocolError("Enter the display's local IP address or .local name.")
        explicit_port = parsed.port is not None
    port = parsed.port if explicit_port else DEFAULT_PORT
    if not 1 <= port <= 65535:
        raise ProtocolError("Enter a valid display port.")
    settings_host = f"[{host}]" if ":" in host else host
    return DisplayEndpoint(
        address=f"{host}:{port}",
        host=host,
        port=port,
        socket_url=f"wss://{settings_host}:{port}{PROTOCOL_PATH}",
        settings_url=f"http://{settings_host}/",
        pairing_url=f"http://{settings_host}/?tab=connectors&connector=mac_companion",
        pairing_status_url=f"http://{settings_host}/companion/pairing",
        editor_url=f"http://{settings_host}/",
    )


def new_nonce() -> str:
    return f"{uuid.uuid4()}-{uuid.uuid4().hex}"


def is_hex64(value: str) -> bool:
    return bool(_HEX64.fullmatch(value))


def is_hex32(value: str) -> bool:
    return bool(_HEX32.fullmatch(value))


def is_hex16(value: str) -> bool:
    return len(value) == 16 and all(char in "0123456789abcdefABCDEF" for char in value)
