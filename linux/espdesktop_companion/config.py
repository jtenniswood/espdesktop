"""Persistent Linux companion settings and pairing material."""
from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .ha import HAEntity
from .protocol import is_hex16, is_hex32, is_hex64


def config_directory() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME")
    root = Path(base) if base else Path.home() / ".config"
    return root / "espdesktop-companion"


def config_path() -> Path:
    return config_directory() / "config.json"


def _secure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    try:
        path.chmod(0o700)
    except OSError:
        pass


@dataclass
class Pairing:
    address: str
    fingerprint: str
    key_hex: str
    sequence: int = 0
    display_name: str | None = None
    computer_id: str | None = None

    @property
    def key(self) -> bytes:
        return bytes.fromhex(self.key_hex)

    def as_dict(self) -> dict:
        return {
            "address": self.address,
            "fingerprint": self.fingerprint,
            "key": self.key_hex,
            "sequence": self.sequence,
            "display_name": self.display_name,
            "computer_id": self.computer_id,
        }

    @classmethod
    def from_dict(cls, value: object) -> "Pairing | None":
        if not isinstance(value, dict):
            return None
        address = value.get("address")
        fingerprint = value.get("fingerprint")
        key = value.get("key")
        sequence = value.get("sequence", 0)
        if not isinstance(address, str) or not address:
            return None
        if not isinstance(fingerprint, str) or not is_hex64(fingerprint):
            return None
        if not isinstance(key, str) or not is_hex64(key):
            return None
        if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
            return None
        display_name = value.get("display_name")
        computer_id = value.get("computer_id")
        if not isinstance(computer_id, str) or not is_hex16(computer_id):
            computer_id = None
        return cls(
            address=address,
            fingerprint=fingerprint.lower(),
            key_hex=key.lower(),
            sequence=sequence,
            display_name=display_name if isinstance(display_name, str) and display_name else None,
            computer_id=computer_id.lower() if computer_id else None,
        )


@dataclass
class Folder:
    id: str
    label: str
    path: str

    def as_dict(self) -> dict:
        return {"id": self.id, "label": self.label, "path": self.path}

    @classmethod
    def from_dict(cls, value: object) -> "Folder | None":
        if not isinstance(value, dict):
            return None
        identifier = value.get("id")
        label = value.get("label")
        path = value.get("path")
        if not isinstance(identifier, str) or not identifier.startswith("folder."):
            return None
        if not isinstance(label, str) or not label:
            return None
        if not isinstance(path, str) or not os.path.isabs(path):
            return None
        return cls(identifier, label, path)

    @classmethod
    def new(cls, path: str, label: str | None = None) -> "Folder":
        resolved = os.path.abspath(os.path.expanduser(path))
        name = label or os.path.basename(resolved.rstrip(os.sep)) or resolved
        return cls("folder." + uuid.uuid4().hex, name[:64], resolved)


@dataclass
class Config:
    path: Path = field(default_factory=config_path)
    pairing: Pairing | None = None
    client_id: str = ""
    approved_apps: set[str] = field(default_factory=set)
    folders: list[Folder] = field(default_factory=list)
    shortcuts_enabled: bool = False
    start_at_login: bool = False
    reuse_existing_apps: bool = True
    ha_url: str = ""
    ha_token: str = ""
    ha_entities: list[HAEntity] = field(default_factory=list)

    @classmethod
    def load(cls, path: str | os.PathLike[str] | None = None) -> "Config":
        target = Path(path) if path is not None else config_path()
        config = cls(path=target)
        try:
            raw = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return config
        if not isinstance(raw, dict):
            return config
        config.pairing = Pairing.from_dict(raw.get("pairing"))
        if isinstance(raw.get("client_id"), str) and is_hex32(raw["client_id"]):
            config.client_id = raw["client_id"].lower()
        approved = raw.get("approved_apps")
        if isinstance(approved, list):
            config.approved_apps = {item for item in approved if isinstance(item, str) and item}
        folders = raw.get("folders")
        if isinstance(folders, list):
            config.folders = [folder for item in folders if (folder := Folder.from_dict(item)) is not None]
        config.shortcuts_enabled = raw.get("shortcuts_enabled") is True
        config.start_at_login = raw.get("start_at_login") is True
        config.reuse_existing_apps = raw.get("reuse_existing_apps") is not False
        if isinstance(raw.get("ha_url"), str):
            config.ha_url = raw["ha_url"]
        if isinstance(raw.get("ha_token"), str):
            config.ha_token = raw["ha_token"]
        if isinstance(raw.get("ha_entities"), list):
            config.ha_entities = [
                entity for item in raw["ha_entities"] if (entity := HAEntity.from_dict(item)) is not None
            ]
        return config

    def as_dict(self) -> dict:
        return {
            "version": 1,
            "pairing": self.pairing.as_dict() if self.pairing else None,
            "client_id": self.client_id,
            "approved_apps": sorted(self.approved_apps),
            "folders": [folder.as_dict() for folder in self.folders],
            "shortcuts_enabled": self.shortcuts_enabled,
            "start_at_login": self.start_at_login,
            "reuse_existing_apps": self.reuse_existing_apps,
            "ha_url": self.ha_url,
            "ha_token": self.ha_token,
            "ha_entities": [entity.as_dict() for entity in self.ha_entities],
        }

    def save(self) -> None:
        _secure_directory(self.path.parent)
        data = json.dumps(self.as_dict(), indent=2, ensure_ascii=False) + "\n"
        descriptor, temporary = tempfile.mkstemp(prefix=".config-", dir=self.path.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary, 0o600)
            os.replace(temporary, self.path)
        except Exception:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise

    def set_pairing(self, pairing: Pairing) -> None:
        self.pairing = pairing
        self.save()

    def ensure_client_id(self) -> str:
        if not is_hex32(self.client_id):
            self.client_id = uuid.uuid4().hex
            self.save()
        return self.client_id

    def clear_pairing(self) -> None:
        self.pairing = None
        self.save()

    def set_approved_app(self, app_id: str, approved: bool) -> None:
        if approved:
            self.approved_apps.add(app_id)
        else:
            self.approved_apps.discard(app_id)
        self.save()

    def add_folder(self, path: str, label: str | None = None) -> Folder:
        folder = Folder.new(path, label)
        self.folders.append(folder)
        self.save()
        return folder

    def remove_folder(self, folder_id: str) -> None:
        self.folders = [folder for folder in self.folders if folder.id != folder_id]
        self.save()

    def set_home_assistant(self, url: str, token: str) -> None:
        self.ha_url = url
        self.ha_token = token
        self.save()

    def set_ha_entities(self, entities: list[HAEntity]) -> None:
        self.ha_entities = list(entities)
        self.save()
