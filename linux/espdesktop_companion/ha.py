"""Home Assistant entity actions for the Linux companion."""
from __future__ import annotations

import ipaddress
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlsplit

ACTION_DOMAINS: dict[str, str] = {
    "script": "turn_on",
    "scene": "turn_on",
    "light": "toggle",
    "switch": "toggle",
    "fan": "toggle",
    "cover": "toggle",
    "input_boolean": "toggle",
    "automation": "trigger",
    "button": "press",
    "media_player": "media_play_pause",
    "vacuum": "toggle",
}


class HomeAssistantError(RuntimeError):
    pass


def _local_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return address.is_loopback or address.is_private or address.is_link_local


def validate_ha_url(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise HomeAssistantError("Enter the Home Assistant address.")
    if "://" not in raw:
        raw = "http://" + raw
    try:
        parsed = urlsplit(raw)
        port = parsed.port or 8123
    except ValueError as error:
        raise HomeAssistantError("Enter a valid Home Assistant address.") from error
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise HomeAssistantError("Enter a local Home Assistant address without credentials.")
    if not 1 <= port <= 65535:
        raise HomeAssistantError("Enter a valid Home Assistant port.")
    host = parsed.hostname
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        name = host.rstrip(".").lower()
        if not (name == "localhost" or name.endswith((".local", ".home.arpa"))):
            raise HomeAssistantError("Enter the local HA IP address or .local name.") from None
        host = name
    else:
        if not _local_address(address):
            raise HomeAssistantError("The Home Assistant address must be on the local network.")
        host = str(address)
    display_host = f"[{host}]" if ":" in host else host
    return f"{parsed.scheme}://{display_host}:{port}"


def service_for(entity_id: str) -> tuple[str, str] | None:
    domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
    service = ACTION_DOMAINS.get(domain)
    return (domain, service) if service else None


@dataclass(frozen=True)
class HAEntity:
    entity_id: str
    label: str
    domain: str

    @property
    def action_id(self) -> str:
        return "ha." + self.entity_id

    def as_dict(self) -> dict:
        return {"entity_id": self.entity_id, "label": self.label, "domain": self.domain}

    @classmethod
    def from_dict(cls, value: object) -> "HAEntity | None":
        if not isinstance(value, dict):
            return None
        entity_id = value.get("entity_id")
        label = value.get("label")
        domain = value.get("domain")
        if not isinstance(entity_id, str) or "." not in entity_id:
            return None
        if not isinstance(label, str) or not label:
            return None
        if not isinstance(domain, str) or not domain:
            domain = entity_id.split(".", 1)[0]
        return cls(entity_id=entity_id, label=label, domain=domain)

    @classmethod
    def from_state(cls, state: dict) -> "HAEntity | None":
        entity_id = state.get("entity_id")
        if not isinstance(entity_id, str) or "." not in entity_id:
            return None
        domain = entity_id.split(".", 1)[0]
        if domain not in ACTION_DOMAINS:
            return None
        attributes = state.get("attributes")
        name = attributes.get("friendly_name") if isinstance(attributes, dict) else None
        if not isinstance(name, str) or not name.strip():
            name = entity_id
        return cls(entity_id=entity_id, label=name.strip(), domain=domain)


class HomeAssistantClient:
    def __init__(self, url: str, token: str) -> None:
        self.url = validate_ha_url(url)
        self.token = token.strip()
        if not self.token:
            raise HomeAssistantError("Enter a Home Assistant long-lived access token.")

    def _request(self, method: str, path: str, data: dict | None = None) -> object:
        payload = None
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "User-Agent": "EspDesktopLinuxCompanion/0.1",
        }
        if data is not None:
            payload = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.url + path, data=payload, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=6) as response:
                body = response.read()
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise HomeAssistantError("Home Assistant rejected the access token.") from error
            raise HomeAssistantError(f"Home Assistant returned HTTP {error.code}.") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise HomeAssistantError("Could not reach Home Assistant.") from error
        if not body:
            return None
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HomeAssistantError("Home Assistant returned an invalid response.") from error

    def states(self) -> list[dict]:
        data = self._request("GET", "/api/states")
        if not isinstance(data, list):
            raise HomeAssistantError("Home Assistant returned an invalid state list.")
        return [item for item in data if isinstance(item, dict)]

    def entities(self) -> list[HAEntity]:
        entities = [entity for state in self.states() if (entity := HAEntity.from_state(state))]
        entities.sort(key=lambda entity: (entity.label.casefold(), entity.entity_id))
        return entities

    def call_service(self, domain: str, service: str, entity_id: str) -> None:
        self._request("POST", f"/api/services/{domain}/{service}", {"entity_id": entity_id})
