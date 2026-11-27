"""Execute Companion actions on the KDE desktop."""
from __future__ import annotations

import os
from urllib.parse import unquote, urlsplit

from PyQt6.QtCore import QUrl
from PyQt6.QtGui import QDesktopServices

from .catalogue import Catalogue
from .config import Config
from .ha import HomeAssistantClient, HomeAssistantError, service_for
from .kwin import KWinActivator
from .session import lock_session

LOCK_ACTION_ID = "shortcut.command+control+q"


def valid_web_url(encoded: str) -> str | None:
    try:
        value = unquote(encoded, errors="strict")
    except (UnicodeDecodeError, ValueError):
        return None
    if not value or any(ord(char) < 32 or char == "\\" for char in value):
        return None
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        return None
    return value


class ActionService:
    def __init__(self, config: Config, catalogue: Catalogue, activator: KWinActivator | None = None) -> None:
        self.config = config
        self.catalogue = catalogue
        self.activator = activator if activator is not None else KWinActivator()

    def invoke(self, message: dict, locked: bool) -> tuple[str, str]:
        """Return (protocol status, human-readable detail)."""
        if locked:
            return "not_allowed", "The desktop is locked."
        kind = message.get("kind")
        if kind == "url":
            url = valid_web_url(str(message.get("encodedUrl", "")))
            if url is None:
                return "not_allowed", "Blocked an invalid website address."
            if QDesktopServices.openUrl(QUrl(url)):
                return "opened", f"Opened {url}"
            return "failed", "The desktop could not open the website."
        if kind != "action":
            return "failed", "Unsupported action."

        action_id = str(message.get("actionId", ""))
        if action_id.startswith("ha."):
            entity = self.catalogue.find_ha(action_id)
            if entity is None:
                return "not_allowed", "That Home Assistant action is not approved."
            service = service_for(entity.entity_id)
            if service is None:
                return "not_allowed", "That Home Assistant entity has no supported action."
            try:
                HomeAssistantClient(self.config.ha_url, self.config.ha_token).call_service(
                    service[0], service[1], entity.entity_id
                )
            except HomeAssistantError as error:
                return "failed", str(error)
            return "performed", f"Ran {entity.label} in Home Assistant."
        if action_id == LOCK_ACTION_ID:
            if lock_session():
                return "performed", "Locked the desktop."
            return "failed", "The desktop could not be locked."
        if action_id.startswith("shortcut."):
            return "not_allowed", "Keyboard shortcuts are not enabled on this desktop yet."
        if action_id.startswith("folder."):
            folder = next((item for item in self.config.folders if item.id == action_id), None)
            if folder is None:
                return "not_allowed", "That folder is not approved."
            if not os.path.isdir(folder.path):
                return "not_found", "The approved folder is no longer available."
            if QDesktopServices.openUrl(QUrl.fromLocalFile(folder.path)):
                return "opened", f"Opened {folder.label}"
            return "failed", "The desktop could not open the folder."

        app = self.catalogue.find(action_id)
        if app is None:
            return "not_allowed", "That application is not approved."
        if self.config.reuse_existing_apps and self.activator.activate(app):
            return "activated", f"Switched to {app.name}."
        if not self.catalogue.launch(app):
            return "failed", f"The desktop could not launch {app.name}."
        return "opened", f"Launched {app.name}"
