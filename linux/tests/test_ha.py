from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from espdesktop_companion.actions import ActionService  # noqa: E402
from espdesktop_companion.catalogue import Catalogue  # noqa: E402
from espdesktop_companion.config import Config  # noqa: E402
from espdesktop_companion.ha import (  # noqa: E402
    HAEntity,
    HomeAssistantClient,
    HomeAssistantError,
    service_for,
    validate_ha_url,
)

STATES = [
    {"entity_id": "light.kitchen", "state": "on", "attributes": {"friendly_name": "Kitchen Lights"}},
    {"entity_id": "script.movie_night", "state": "off", "attributes": {"friendly_name": "Movie Night"}},
    {"entity_id": "sensor.temperature", "state": "21", "attributes": {"friendly_name": "Temperature"}},
]


class Handler(BaseHTTPRequestHandler):
    calls: list[tuple[str, dict, str | None]] = []

    def _json(self, value: object, status: int = 200) -> None:
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/states":
            self._json(STATES)
        else:
            self._json({}, 404)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        Handler.calls.append((self.path, body, self.headers.get("Authorization")))
        self._json([])

    def log_message(self, *_args: object) -> None:
        pass


class HomeAssistantTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self) -> None:
        Handler.calls.clear()

    def test_validate_url(self) -> None:
        self.assertEqual(validate_ha_url(self.url), self.url)
        self.assertEqual(validate_ha_url("homeassistant.local"), "http://homeassistant.local:8123")
        for value in ("", "http://example.com", "http://user:pass@192.168.0.10:8123", "http://8.8.8.8"):
            with self.subTest(value), self.assertRaises(HomeAssistantError):
                validate_ha_url(value)

    def test_entities_and_service(self) -> None:
        client = HomeAssistantClient(self.url, "token")
        entities = client.entities()
        self.assertEqual(
            [entity.entity_id for entity in entities],
            ["light.kitchen", "script.movie_night"],
        )
        self.assertEqual(service_for("light.kitchen"), ("light", "toggle"))
        self.assertIsNone(service_for("sensor.temperature"))
        client.call_service("light", "toggle", "light.kitchen")
        self.assertEqual(
            Handler.calls,
            [
                (
                    "/api/services/light/toggle",
                    {"entity_id": "light.kitchen"},
                    "Bearer token",
                )
            ],
        )

    def test_action_service_runs_selected_entity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            config = Config.load(Path(temporary) / "config.json")
            config.set_home_assistant(self.url, "token")
            config.set_ha_entities([HAEntity("light.kitchen", "Kitchen Lights", "light")])
            catalogue = Catalogue(config)
            catalogue.apps = []
            status, _detail = ActionService(config, catalogue).invoke(
                {"kind": "action", "requestId": "r1", "actionId": "ha.light.kitchen"},
                locked=False,
            )
            self.assertEqual(status, "performed")
            self.assertEqual(len(Handler.calls), 1)

            status, _detail = ActionService(config, catalogue).invoke(
                {"kind": "action", "requestId": "r2", "actionId": "ha.light.other"},
                locked=False,
            )
            self.assertEqual(status, "not_allowed")

    def test_missing_token_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            config = Config.load(Path(temporary) / "config.json")
            config.ha_url = self.url
            config.ha_entities = [HAEntity("light.kitchen", "Kitchen Lights", "light")]
            catalogue = Catalogue(config)
            catalogue.apps = []
            status, detail = ActionService(config, catalogue).invoke(
                {"kind": "action", "requestId": "r1", "actionId": "ha.light.kitchen"},
                locked=False,
            )
            self.assertEqual(status, "failed")
            self.assertIn("token", detail.lower())


if __name__ == "__main__":
    unittest.main()
