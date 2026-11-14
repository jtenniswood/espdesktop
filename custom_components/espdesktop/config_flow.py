"""Pair an EspDesktop panel."""
import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import Panel, hex_value


class EspDesktopConfigFlow(config_entries.ConfigFlow, domain="espdesktop"):
    """Configure one display per entry."""

    VERSION = 1

    async def async_step_zeroconf(self, discovery_info: ZeroconfServiceInfo):
        """Offer a discovered display and refresh a known display's address."""
        try:
            fingerprint = hex_value(discovery_info.properties.get("id", ""), 64)
        except ValueError:
            return self.async_abort(reason="unsupported")
        await self.async_set_unique_id(fingerprint)
        # The stored TLS fingerprint still authenticates all later requests.
        self._abort_if_unique_id_configured(updates={
            "host": discovery_info.host, "port": discovery_info.port,
        })
        self._discovered = {
            "host": discovery_info.host,
            "port": discovery_info.port or 8443,
            "fingerprint": fingerprint,
        }
        self.context["title_placeholders"] = {
            "name": discovery_info.properties.get("name") or discovery_info.hostname,
        }
        return await self.async_step_discovery_confirm()

    async def async_step_discovery_confirm(self, user_input=None):
        """Confirm the discovered panel using its physical display."""
        self._set_confirm_only()
        return await self._pair("discovery_confirm", user_input)

    async def async_step_user(self, user_input=None):
        """Accept the fingerprint and code from the physical display."""
        return await self._pair("user", user_input)

    async def async_step_reauth(self, entry_data):
        """Obtain a new credential after the previous one is revoked."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input=None):
        """Confirm pairing details again."""
        return await self._pair("reauth_confirm", user_input)

    async def async_step_reconfigure(self, user_input=None):
        """Refresh the address or pair again from the UI."""
        return await self._pair("reconfigure", user_input)

    async def _pair(self, step, user_input):
        errors = {}
        previous = None
        if step == "reauth_confirm":
            previous = self._get_reauth_entry()
        elif step == "reconfigure":
            previous = self._get_reconfigure_entry()
        defaults = previous.data if previous else getattr(self, "_discovered", {})
        if user_input is not None:
            try:
                fingerprint = hex_value(user_input["fingerprint"], 64)
                code = hex_value(user_input["code"], 24)
                host = user_input["host"].strip()
                port = user_input["port"]
                if previous and previous.unique_id != fingerprint:
                    return self.async_abort(reason="wrong_display")
                if self.unique_id and self.unique_id != fingerprint:
                    return self.async_abort(reason="wrong_display")
                await self.async_set_unique_id(fingerprint)
                if previous is None:
                    self._abort_if_unique_id_configured()
                panel = Panel(async_get_clientsession(self.hass), host, port, fingerprint)
                token = await panel.pair(code, fingerprint)
            except (ValueError, KeyError, TypeError):
                errors["base"] = "invalid_code"
            except (aiohttp.ClientError, TimeoutError):
                errors["base"] = "cannot_pair"
            else:
                data = {"host": host, "port": port, "fingerprint": fingerprint, "token": token}
                if previous:
                    return self.async_update_reload_and_abort(previous, data=data)
                title = self.context.get("title_placeholders", {}).get("name", f"EspDesktop ({host})")
                return self.async_create_entry(title=title, data=data)
        schema = vol.Schema({
            vol.Required("host", default=defaults.get("host", "")): str,
            vol.Required("port", default=defaults.get("port", 8443)): vol.All(vol.Coerce(int), vol.Range(min=1, max=65535)),
            vol.Required("fingerprint", default=defaults.get("fingerprint", "")): str,
            vol.Required("code"): str,
        })
        return self.async_show_form(step_id=step, data_schema=schema, errors=errors)
