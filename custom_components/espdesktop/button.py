"""Buttons for shared cards on an EspDesktop display."""
import aiohttp

from homeassistant.components.button import ButtonEntity
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity


async def async_setup_entry(hass, entry, async_add_entities):
    """Track newly exposed cards as the display configuration changes."""
    panel, coordinator = entry.runtime_data
    known = set()

    def add_cards():
        added = coordinator.data.keys() - known
        known.update(added)
        async_add_entities(CardButton(coordinator, panel, entry, card_id) for card_id in sorted(added))

    add_cards()
    entry.async_on_unload(coordinator.async_add_listener(add_cards))


class CardButton(CoordinatorEntity, ButtonEntity):
    """Trigger one saved EspDesktop card."""

    _attr_has_entity_name = True

    def __init__(self, coordinator, panel, entry, card_id):
        super().__init__(coordinator, context=card_id)
        self.card_id = card_id
        self.panel = panel
        self._attr_unique_id = f"{entry.unique_id}_{card_id}"
        self._attr_device_info = DeviceInfo(
            identifiers={("espdesktop", entry.unique_id)}, name=entry.title,
            manufacturer="EspDesktop",
        )
        self._attr_name = coordinator.data[card_id]["name"]

    @property
    def available(self):
        return super().available and self.coordinator.data.get(self.card_id, {}).get("available", False)

    def _handle_coordinator_update(self):
        if card := self.coordinator.data.get(self.card_id):
            self._attr_name = card["name"]
        super()._handle_coordinator_update()

    async def async_press(self):
        try:
            await self.panel.press(self.card_id)
        except (aiohttp.ClientError, TimeoutError, ValueError) as error:
            raise HomeAssistantError("EspDesktop could not confirm the card press.") from error
