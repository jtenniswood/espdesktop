"""Expose the cards on an EspDesktop display."""
from datetime import timedelta
import logging

import aiohttp

from homeassistant.const import Platform
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import Panel


async def async_setup_entry(hass, entry):
    """Connect one display and load the button platform."""
    panel = Panel(async_get_clientsession(hass), **entry.data)

    async def fetch_cards():
        try:
            return await panel.cards()
        except aiohttp.ClientResponseError as error:
            if error.status == 401:
                raise ConfigEntryAuthFailed from error
            raise UpdateFailed("Could not read EspDesktop cards") from error
        except (aiohttp.ClientError, TimeoutError, ValueError, KeyError, TypeError) as error:
            raise UpdateFailed("Could not read EspDesktop cards") from error

    coordinator = DataUpdateCoordinator(
        hass, logging.getLogger(__name__), config_entry=entry, name=entry.title,
        update_method=fetch_cards, update_interval=timedelta(seconds=15),
    )
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = (panel, coordinator)
    await hass.config_entries.async_forward_entry_setups(entry, [Platform.BUTTON])
    return True


async def async_unload_entry(hass, entry):
    """Unload the display's buttons."""
    return await hass.config_entries.async_unload_platforms(entry, [Platform.BUTTON])
