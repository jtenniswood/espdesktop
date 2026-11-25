"""Live end-to-end test against an EspDesktop display on the LAN.

Run from the repository root:

    python3 linux/tests/live_test.py --address 192.168.1.94

This is intentionally separate from the unit tests: it pairs with a real panel,
stores the pairing in the user's companion config, and can launch an approved
application. Only run it on a trusted local network.
"""
from __future__ import annotations

import argparse
import json
import queue
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from espdesktop_companion.actions import ActionService  # noqa: E402
from espdesktop_companion.catalogue import Catalogue  # noqa: E402
from espdesktop_companion.client import CAPABILITIES  # noqa: E402
from espdesktop_companion.config import Config, Pairing  # noqa: E402
from espdesktop_companion.protocol import (  # noqa: E402
    Protocol,
    new_nonce,
    resolve_display_address,
    sign_auth_request,
)
from espdesktop_companion.websocket import WebSocketConnection, WebSocketEvent  # noqa: E402


class SocketProbe:
    def __init__(self, url: str, protocol: Protocol, fingerprint: str | None = None) -> None:
        self.protocol = protocol
        self.events: queue.Queue[WebSocketEvent] = queue.Queue()
        self.socket = WebSocketConnection(url, self.events.put, fingerprint=fingerprint)
        self.socket.start()

    def wait(self, kinds: set[str], timeout: float = 12.0) -> WebSocketEvent:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"Timed out waiting for {sorted(kinds)}")
            try:
                event = self.events.get(timeout=remaining)
            except queue.Empty as error:
                raise TimeoutError(f"Timed out waiting for {sorted(kinds)}") from error
            if event.kind == "error":
                raise RuntimeError(str(event.data))
            if event.kind in kinds:
                return event

    def read_message(self, state: str, timeout: float = 12.0) -> dict:
        deadline = time.monotonic() + timeout
        while True:
            event = self.wait({"text", "close"}, max(0.1, deadline - time.monotonic()))
            if event.kind == "close":
                raise RuntimeError("The display closed the connection")
            message = json.loads(str(event.data))
            if not self.protocol.validate(message, "panel_to_mac", state):
                print(f"  ignored invalid panel message: {message.get('type')}")
                continue
            if message.get("type") == "hello":
                continue
            return message

    def send(self, message: dict) -> None:
        self.socket.send_text(json.dumps(message, ensure_ascii=False, separators=(",", ":")))

    def close(self) -> None:
        self.socket.close()
        self.socket.join(2.0)


def fetch_pairing_state(address: str) -> dict:
    endpoint = resolve_display_address(address)
    request = urllib.request.Request(
        endpoint.pairing_status_url,
        headers={"User-Agent": "EspDesktopLinuxCompanion/0.1"},
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))
    print(f"Display {endpoint.address}: paired={data.get('paired')} active={data.get('active')} "
          f"code={data.get('pairing_code') or '-'} mdns={data.get('mdns_name') or '-'}")
    return data


def pair(address: str, code: str, protocol: Protocol) -> tuple[Pairing, str]:
    endpoint = resolve_display_address(address)
    probe = SocketProbe(endpoint.socket_url, protocol)
    try:
        opened = probe.wait({"open"})
        fingerprint = opened.fingerprint or ""
        if not fingerprint:
            raise RuntimeError("The display did not present a TLS certificate")
        print(f"TLS fingerprint: {fingerprint}")
        probe.send(protocol.message("pair.request", code=code))
        reply = probe.read_message("pairing")
        if reply.get("type") != "pair.accepted":
            raise RuntimeError(f"Pairing failed: {reply}")
        pairing = Pairing(endpoint.address, fingerprint, str(reply["credential"]), sequence=0)
        print("Pairing accepted")
        return pairing, endpoint.socket_url
    finally:
        probe.close()


def authenticate(pairing: Pairing, socket_url: str, protocol: Protocol) -> tuple[SocketProbe, int]:
    probe = SocketProbe(socket_url, protocol, fingerprint=pairing.fingerprint)
    opened = probe.wait({"open"})
    if opened.fingerprint != pairing.fingerprint:
        raise RuntimeError("The display certificate changed between pairing and authentication")
    sequence = pairing.sequence + 1
    nonce = new_nonce()
    probe.send(
        protocol.message(
            "auth.request",
            sequence=sequence,
            nonce=nonce,
            signature=sign_auth_request(pairing.key, sequence, nonce),
        )
    )
    reply = probe.read_message("authenticating")
    if reply.get("type") != "auth.accepted":
        raise RuntimeError(f"Authentication failed: {reply}")
    pairing.sequence = sequence
    print(f"Authenticated (capability version {reply.get('capabilityVersion')})")
    return probe, int(reply.get("capabilityVersion", 0))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--address", default="192.168.1.94")
    parser.add_argument("--config", default=None, help="Companion config path override")
    parser.add_argument("--use-saved", action="store_true", help="Authenticate with the saved pairing")
    parser.add_argument("--launch-app", default=None, help="Approve and launch an application by name")
    parser.add_argument("--keep-open", type=float, default=3.0, help="Seconds to listen after connecting")
    args = parser.parse_args(argv)

    protocol = Protocol.load()
    config = Config.load(args.config)
    if args.use_saved or config.pairing is not None:
        if config.pairing is None:
            print("No saved pairing; run without --use-saved first.")
            return 2
        pairing = config.pairing
        endpoint = resolve_display_address(pairing.address)
        socket_url = endpoint.socket_url
        print(f"Using saved pairing for {pairing.address}")
    else:
        state = fetch_pairing_state(args.address)
        code = state.get("pairing_code")
        if not isinstance(code, str) or not code:
            print("The display did not offer a pairing code. Reset its Companion pairing and retry.")
            return 2
        pairing, socket_url = pair(args.address, code, protocol)
        config.set_pairing(pairing)

    probe, capability_version = authenticate(pairing, socket_url, protocol)
    config.set_pairing(pairing)
    try:
        catalogue = Catalogue(config)
        if args.launch_app:
            matches = [app for app in catalogue.apps if args.launch_app.casefold() in app.name.casefold()]
            if not matches:
                print(f"No installed application matched {args.launch_app!r}")
                return 3
            app = matches[0]
            config.approved_apps.add(app.id)
            config.save()
            catalogue = Catalogue(config)
        probe.send(protocol.message("capabilities", values=CAPABILITIES))
        items = catalogue.items()
        probe.send(
            protocol.message(
                "catalogue.page",
                generation=1,
                page=0,
                complete=True,
                items=items[:48],
            )
        )
        if capability_version >= 5:
            probe.send(
                protocol.message(
                    "catalogue.definitions.page",
                    generation=1,
                    page=0,
                    complete=True,
                    items=[],
                )
            )
        print(f"Sent catalogue with {len(items)} item(s)")

        if args.launch_app:
            service = ActionService(config, catalogue)
            status, detail = service.invoke(
                {"kind": "action", "requestId": "live-test", "actionId": app.id},
                locked=False,
            )
            print(f"Action {app.name!r}: {status} ({detail})")
            if status not in ("opened", "activated", "performed"):
                return 4

        deadline = time.monotonic() + max(0.0, args.keep_open)
        while time.monotonic() < deadline:
            try:
                event = probe.wait({"text", "close"}, max(0.1, deadline - time.monotonic()))
            except TimeoutError:
                break
            if event.kind == "close":
                print("The display closed the session")
                break
            message = json.loads(str(event.data))
            if message.get("type") == "catalogue.request":
                probe.send(
                    protocol.message(
                        "catalogue.page", generation=2, page=0, complete=True, items=items[:48]
                    )
                )
            elif message.get("type") == "app_icon.request":
                probe.send(protocol.message("app_icon.unavailable", appId=message.get("appId")))
            else:
                print(f"Panel message: {message.get('type')}")

        state = fetch_pairing_state(args.address)
        if not state.get("paired") or not state.get("connected"):
            print("The display did not report the session as connected while the test was open.")
            return 5
        print("Live protocol test passed.")
        return 0
    finally:
        probe.close()


if __name__ == "__main__":
    raise SystemExit(main())
