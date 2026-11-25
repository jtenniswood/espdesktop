"""Small RFC 6455 WebSocket client over TLS for the display's Companion socket.

PyQt6 on this distribution does not ship QtWebSockets, so the companion uses a
dependency-free client. TLS verification is deliberately deferred: the display
uses a self-signed certificate. The caller pins the SHA-256 fingerprint observed
on first pairing and compares it before sending the saved credential.
"""
from __future__ import annotations

import base64
import hashlib
import ipaddress
import json
import os
import queue
import select
import socket
import ssl
import struct
import threading
import time
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlsplit

_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAXIMUM_TEXT = 16384
MAXIMUM_BINARY = 262144
PING_INTERVAL = 20.0


class WebSocketError(RuntimeError):
    pass


@dataclass(frozen=True)
class WebSocketEvent:
    kind: str  # open, text, binary, close, error
    data: object = None
    fingerprint: str | None = None


def _is_local(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return address.is_loopback or address.is_private or address.is_link_local


def _resolve_local(host: str, port: int) -> list[tuple]:
    try:
        results = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise WebSocketError(f"Could not resolve the display address: {error}") from error
    addresses = []
    for family, socktype, proto, _canon, address in results:
        try:
            ip = ipaddress.ip_address(address[0])
        except ValueError:
            continue
        if _is_local(ip):
            addresses.append((family, socktype, proto, address))
    if not addresses:
        raise WebSocketError("The display resolved to an address outside the local network.")
    return addresses


class WebSocketConnection:
    """A threaded client connection. Events are delivered to ``on_event``."""

    def __init__(
        self,
        url: str,
        on_event: Callable[[WebSocketEvent], None],
        fingerprint: str | None = None,
        connect_timeout: float = 8.0,
    ) -> None:
        parsed = urlsplit(url)
        if parsed.scheme != "wss" or not parsed.hostname:
            raise WebSocketError("The Companion socket must use wss://.")
        self.host = parsed.hostname
        self.port = parsed.port or 8443
        self.path = parsed.path or "/companion/v4"
        self.on_event = on_event
        self.expected_fingerprint = fingerprint
        self.connect_timeout = connect_timeout
        self._outgoing: queue.Queue[tuple[int, bytes] | None] = queue.Queue()
        self._running = threading.Event()
        self._thread: threading.Thread | None = None
        self._socket: ssl.SSLSocket | None = None
        self._buffer = bytearray()
        self._message_opcode: int | None = None
        self._message = bytearray()
        self._last_ping = 0.0
        self._last_pong = time.monotonic()
        self._partial_since = 0.0

    def start(self) -> None:
        if self._thread is not None:
            raise WebSocketError("The connection has already been started.")
        self._running.set()
        self._thread = threading.Thread(target=self._run, name="espdesktop-companion", daemon=True)
        self._thread.start()

    def send_text(self, text: str) -> None:
        if not isinstance(text, str):
            raise WebSocketError("Text frames must be strings.")
        self._outgoing.put((0x1, text.encode("utf-8")))

    def send_binary(self, data: bytes) -> None:
        self._outgoing.put((0x2, bytes(data)))

    def close(self) -> None:
        self._running.clear()
        self._outgoing.put(None)

    def join(self, timeout: float = 3.0) -> None:
        if self._thread is not None:
            self._thread.join(timeout)

    # -- worker ---------------------------------------------------------

    def _run(self) -> None:
        try:
            sock = self._connect()
            self._socket = sock
            fingerprint = hashlib.sha256(sock.getpeercert(binary_form=True) or b"").hexdigest()
            if self.expected_fingerprint is not None and fingerprint != self.expected_fingerprint:
                raise WebSocketError("The display certificate does not match the saved pairing.")
            self._handshake(sock)
            self._emit(WebSocketEvent("open", fingerprint=fingerprint))
            self._loop(sock)
        except Exception as error:  # noqa: BLE001 - delivered as a connection event
            if self._running.is_set():
                self._emit(WebSocketEvent("error", str(error)))
        finally:
            self._running.clear()
            if self._socket is not None:
                try:
                    self._socket.close()
                except OSError:
                    pass
            self._socket = None
            self._emit(WebSocketEvent("close"))

    def _connect(self) -> ssl.SSLSocket:
        last_error: Exception | None = None
        for family, socktype, proto, address in _resolve_local(self.host, self.port):
            raw = socket.socket(family, socktype, proto)
            raw.settimeout(self.connect_timeout)
            try:
                raw.connect(address)
                raw.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                context.minimum_version = ssl.TLSVersion.TLSv1_2
                return context.wrap_socket(raw, server_hostname=self.host)
            except (OSError, ssl.SSLError) as error:
                last_error = error
                try:
                    raw.close()
                except OSError:
                    pass
        raise WebSocketError(f"The display did not accept the connection: {last_error}")

    def _handshake(self, sock: ssl.SSLSocket) -> None:
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        host_header = f"[{self.host}]" if ":" in self.host else self.host
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {host_header}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "User-Agent: EspDesktopLinuxCompanion/0.1\r\n"
            "\r\n"
        )
        sock.sendall(request.encode("ascii"))
        sock.settimeout(8.0)
        response = bytearray()
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk:
                raise WebSocketError("The display closed the connection during the WebSocket handshake.")
            response.extend(chunk)
            if len(response) > 65536:
                raise WebSocketError("The display sent an oversized WebSocket handshake.")
        head_bytes, _, remainder = bytes(response).partition(b"\r\n\r\n")
        # The panel sends `hello` immediately after the 101 response and it can
        # arrive in the same TCP read. Keep those bytes for the frame parser.
        if remainder:
            self._buffer.extend(remainder)
        head = head_bytes.decode("iso-8859-1")
        lines = head.split("\r\n")
        if not lines or " 101 " not in f"{lines[0]} ":
            raise WebSocketError(f"The display refused the WebSocket upgrade: {lines[0] if lines else 'empty response'}")
        headers: dict[str, str] = {}
        for line in lines[1:]:
            if ":" in line:
                name, value = line.split(":", 1)
                headers[name.strip().lower()] = value.strip()
        expected = base64.b64encode(hashlib.sha1((key + _GUID).encode("ascii")).digest()).decode("ascii")
        if headers.get("sec-websocket-accept") != expected:
            raise WebSocketError("The display returned an invalid WebSocket handshake.")
        sock.setblocking(False)

    def _loop(self, sock: ssl.SSLSocket) -> None:
        while self._running.is_set():
            self._fill(sock)
            self._parse_frames()
            self._drain_outgoing(sock)
            now = time.monotonic()
            if self._message_opcode is not None and now - self._partial_since > 60:
                # A partial frame that never completes means the peer stalled.
                raise WebSocketError("The display stopped sending data.")
            if now - self._last_pong > 60:
                raise WebSocketError("The display stopped responding.")
            if now - self._last_ping >= PING_INTERVAL:
                self._send_frame(sock, 0x9, b"espdesktop")
                self._last_ping = now
            readable, _, _ = select.select([sock], [], [], 0.1)
            if readable:
                continue

    def _fill(self, sock: ssl.SSLSocket) -> None:
        try:
            chunk = sock.recv(65536)
        except (BlockingIOError, ssl.SSLWantReadError):
            return
        except (OSError, ssl.SSLError) as error:
            raise WebSocketError(f"The display connection failed: {error}") from error
        if not chunk:
            raise WebSocketError("The display closed the connection.")
        self._buffer.extend(chunk)

    def _parse_frames(self) -> None:
        while True:
            if len(self._buffer) < 2:
                return
            first, second = self._buffer[0], self._buffer[1]
            fin = bool(first & 0x80)
            opcode = first & 0x0F
            masked = bool(second & 0x80)
            length = second & 0x7F
            offset = 2
            if length == 126:
                if len(self._buffer) < 4:
                    return
                length = struct.unpack(">H", self._buffer[2:4])[0]
                offset = 4
            elif length == 127:
                if len(self._buffer) < 10:
                    return
                length = struct.unpack(">Q", self._buffer[2:10])[0]
                offset = 10
            mask_key = b""
            if masked:
                if len(self._buffer) < offset + 4:
                    return
                mask_key = bytes(self._buffer[offset:offset + 4])
                offset += 4
            if len(self._buffer) < offset + length:
                return
            payload = bytearray(self._buffer[offset:offset + length])
            del self._buffer[:offset + length]
            if masked:
                for index in range(len(payload)):
                    payload[index] ^= mask_key[index % 4]
            self._handle_frame(opcode, fin, bytes(payload))

    def _handle_frame(self, opcode: int, fin: bool, payload: bytes) -> None:
        if opcode == 0x8:
            self._running.clear()
            self._emit(WebSocketEvent("close"))
            return
        if opcode == 0x9:
            if self._socket is not None:
                self._send_frame(self._socket, 0xA, payload)
            return
        if opcode == 0xA:
            self._last_pong = time.monotonic()
            return
        if opcode in (0x1, 0x2):
            self._message_opcode = opcode
            self._partial_since = time.monotonic()
            self._message = bytearray(payload)
        elif opcode == 0x0:
            if self._message_opcode is None:
                raise WebSocketError("The display sent an unexpected continuation frame.")
            self._message.extend(payload)
        else:
            raise WebSocketError(f"The display sent an unsupported WebSocket frame 0x{opcode:x}.")
        limit = MAXIMUM_TEXT if self._message_opcode == 0x1 else MAXIMUM_BINARY
        if len(self._message) > limit:
            raise WebSocketError("The display sent an oversized WebSocket message.")
        if not fin:
            return
        message = bytes(self._message)
        kind = self._message_opcode
        self._message_opcode = None
        self._partial_since = 0.0
        self._message = bytearray()
        if kind == 0x1:
            try:
                self._emit(WebSocketEvent("text", message.decode("utf-8")))
            except UnicodeDecodeError as error:
                raise WebSocketError("The display sent invalid UTF-8.") from error
        else:
            self._emit(WebSocketEvent("binary", message))

    def _drain_outgoing(self, sock: ssl.SSLSocket) -> None:
        while True:
            try:
                item = self._outgoing.get_nowait()
            except queue.Empty:
                return
            if item is None:
                self._send_frame(sock, 0x8, b"")
                self._running.clear()
                return
            opcode, payload = item
            self._send_frame(sock, opcode, payload)

    def _send_frame(self, sock: ssl.SSLSocket, opcode: int, payload: bytes) -> None:
        header = bytearray([0x80 | opcode])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack(">H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack(">Q", length))
        mask = os.urandom(4)
        header.extend(mask)
        masked = bytearray(payload)
        for index in range(len(masked)):
            masked[index] ^= mask[index % 4]
        frame = bytes(header) + bytes(masked)
        view = memoryview(frame)
        while view:
            try:
                sent = sock.send(view)
                view = view[sent:]
            except (BlockingIOError, ssl.SSLWantWriteError):
                select.select([], [sock], [], 0.5)
            except (OSError, ssl.SSLError) as error:
                raise WebSocketError(f"The display connection failed: {error}") from error

    def _emit(self, event: WebSocketEvent) -> None:
        try:
            self.on_event(event)
        except Exception:  # noqa: BLE001 - a listener must not kill the socket thread
            pass
