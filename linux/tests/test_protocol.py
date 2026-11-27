from __future__ import annotations

import hashlib
import hmac
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from espdesktop_companion.protocol import (  # noqa: E402
    Protocol,
    ProtocolError,
    bound,
    contract_candidates,
    default_contract_path,
    resolve_display_address,
    sign_auth_request,
)


class FixtureValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.protocol = Protocol.load()
        fixture = Path(__file__).resolve().parents[2] / "compatibility" / "fixtures" / "companion_protocol_v4.json"
        cls.fixtures = json.loads(fixture.read_text(encoding="utf-8"))

    def test_fixture_cases(self) -> None:
        for entry in self.fixtures:
            direction = entry["direction"]
            if direction not in ("panel_to_mac", "mac_to_panel"):
                direction = "mac_to_panel"
            with self.subTest(entry["name"]):
                self.assertEqual(
                    self.protocol.validate(entry["message"], direction, entry["state"]),
                    entry["valid"],
                )

    def test_message_builder(self) -> None:
        message = self.protocol.message("pair.request", code="ABCD")
        self.assertEqual(message, {"protocol": 4, "type": "pair.request", "code": "ABCD"})
        self.assertTrue(self.protocol.validate(message, "mac_to_panel", "pairing"))
        with self.assertRaises(ProtocolError):
            self.protocol.message("not.a.message")

    def test_encoded_length(self) -> None:
        message = self.protocol.message("catalogue.page", generation=1, page=0, complete=True, items=[])
        self.assertTrue(self.protocol.encoded_length_ok(message))


class ContractLocationTests(unittest.TestCase):
    def test_candidates_prefer_the_packaged_contract(self) -> None:
        candidates = contract_candidates()
        self.assertEqual(candidates[0].name, "companion_capabilities.json")
        self.assertTrue(str(candidates[0]).endswith("espdesktop_companion/companion_capabilities.json"))
        self.assertEqual(
            candidates[1],
            Path(__file__).resolve().parents[2] / "product" / "v2" / "companion_capabilities.json",
        )

    def test_checkout_uses_the_repository_contract(self) -> None:
        self.assertEqual(default_contract_path(), contract_candidates()[1])


class SignatureTests(unittest.TestCase):
    def test_auth_signature(self) -> None:
        key = bytes(range(32))
        expected = hmac.new(key, b"auth.request|7|nonce-1", hashlib.sha256).hexdigest()
        self.assertEqual(sign_auth_request(key, 7, "nonce-1"), expected)

    def test_bound_does_not_split_utf8(self) -> None:
        value = bound("abcdef", 4)
        self.assertEqual(value, "abcd")
        value = bound("aé", 2)
        self.assertEqual(value, "a")


class EndpointTests(unittest.TestCase):
    def test_ip_defaults(self) -> None:
        endpoint = resolve_display_address("192.168.0.50")
        self.assertEqual(endpoint.socket_url, "wss://192.168.0.50:8443/companion/v4")
        self.assertEqual(endpoint.pairing_status_url, "http://192.168.0.50/companion/pairing")
        self.assertEqual(endpoint.pairing_url, "http://192.168.0.50/?tab=connectors&connector=mac_companion")

    def test_mdns_name(self) -> None:
        endpoint = resolve_display_address("espdesktop-panel.local")
        self.assertEqual(endpoint.host, "espdesktop-panel.local")
        self.assertEqual(endpoint.port, 8443)

    def test_explicit_port(self) -> None:
        endpoint = resolve_display_address("192.168.0.50:9443")
        self.assertEqual(endpoint.socket_url, "wss://192.168.0.50:9443/companion/v4")

    def test_rejects_public_and_invalid(self) -> None:
        for value in ("example.com", "8.8.8.8", "http://user@192.168.0.50", "", "http://192.168.0.50:0"):
            with self.subTest(value), self.assertRaises(ProtocolError):
                resolve_display_address(value)


if __name__ == "__main__":
    unittest.main()
