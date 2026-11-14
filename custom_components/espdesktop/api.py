"""Client for the display's local card API."""
import re

import aiohttp
from yarl import URL

PATH = "/home-assistant/v1"


def hex_value(value, length):
    """Normalize a fingerprint or setup code copied from the display."""
    normalized = "".join(value.lower().split())
    if not re.fullmatch(f"[a-f0-9]{{{length}}}", normalized):
        raise ValueError("Invalid pairing information")
    return normalized


class Panel:
    """Send requests over the pinned HTTPS connection."""

    def __init__(self, session, host, port, fingerprint, token=""):
        self.session = session
        self.base = URL.build(scheme="https", host=host, port=port)
        self.pin = aiohttp.Fingerprint(bytes.fromhex(fingerprint))
        self.token = token

    async def request(self, method, path="", headers=None):
        """Return an authenticated response from the expected panel."""
        if headers is None:
            headers = {"Authorization": "Bearer " + self.token}
        async with self.session.request(
            method, self.base.with_path(PATH + path), ssl=self.pin,
            headers=headers, allow_redirects=False,
            timeout=aiohttp.ClientTimeout(total=5),
        ) as response:
            response.raise_for_status()
            if response.status not in (200, 202):
                raise ValueError("Unexpected panel status")
            return await response.json()

    async def pair(self, code, fingerprint):
        """Exchange the screen code for a dedicated credential."""
        result = await self.request("POST", "/pair", {"Authorization": "Pair " + code})
        if result["id"] != fingerprint:
            raise ValueError("Incorrect display")
        return hex_value(result["token"], 64)

    async def cards(self):
        """Read a snapshot keyed by the permanent ID of each card."""
        data = await self.request("GET")
        return {hex_value(card["id"], 32): card for card in data["cards"]}

    async def press(self, card_id):
        """Send one press request."""
        result = await self.request("POST", "/press", {
            "Authorization": "Bearer " + self.token, "X-EspDesktop-Card": card_id,
        })
        if result.get("accepted") is not True:
            raise ValueError("The display rejected the press")
