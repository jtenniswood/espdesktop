import Darwin
import Foundation
import IOKit

enum CompanionUSBPort {
    private static let nativePrefix = "/dev/cu.usbmodem"
    private static let calloutPrefixes = ["cu.wchusbserial", "cu.usbserial-", "cu.usbmodem"]

    static func isNative(_ path: String) -> Bool { path.hasPrefix(nativePrefix) }

    static func isSupported(_ path: String) -> Bool {
        guard path.hasPrefix("/dev/") else { return false }
        let name = path.dropFirst("/dev/".count)
        return calloutPrefixes.contains { prefix in
            name.hasPrefix(prefix) && name.count > prefix.count &&
                name.dropFirst(prefix.count).utf8.allSatisfy { byte in
                    switch byte {
                    case 45, 48...57, 65...90, 97...122: true
                    default: false
                    }
                }
        }
    }

    static func available() -> [String] {
        let bridges = ((try? FileManager.default.contentsOfDirectory(atPath: "/dev")) ?? [])
            .map { "/dev/" + $0 }.filter { isSupported($0) && !isNative($0) }
        return (bridges + nativePorts()).sorted()
    }

    private static func nativePorts() -> [String] {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOSerialBSDClient"), &iterator)
            == KERN_SUCCESS else { return [] }
        defer { IOObjectRelease(iterator) }

        var ports: [String] = []
        while case let service = IOIteratorNext(iterator), service != 0 {
            defer { IOObjectRelease(service) }
            guard let path = IORegistryEntryCreateCFProperty(service, "IOCalloutDevice" as CFString,
                                                              kCFAllocatorDefault, 0)?.takeRetainedValue() as? String,
                  isNative(path), isSupported(path) else { continue }
            let parents = IOOptionBits(kIORegistryIterateRecursively | kIORegistryIterateParents)
            let vendor = IORegistryEntrySearchCFProperty(service, kIOServicePlane, "idVendor" as CFString,
                                                         kCFAllocatorDefault, parents) as? NSNumber
            let product = IORegistryEntrySearchCFProperty(service, kIOServicePlane, "idProduct" as CFString,
                                                          kCFAllocatorDefault, parents) as? NSNumber
            // Espressif's built-in serial interface. Ignore unrelated CDC modems.
            if vendor?.intValue == 0x303a && product?.intValue == 0x1001 { ports.append(path) }
        }
        return ports
    }

    static func endpoint(for path: String) -> String { "usb:" + path }
    static func path(from endpoint: String) -> String? {
        guard endpoint.hasPrefix("usb:") else { return nil }
        let path = String(endpoint.dropFirst(4))
        return isSupported(path) ? path : nil
    }
}

/// The relay runs off the main actor. The app's regular WebSocket client
/// performs TLS, certificate pinning and pairing end-to-end with the panel.
final class CompanionUSBBridge: @unchecked Sendable {
    enum Frame: UInt8 {
        case open = 1, data = 2, close = 3

        func encode(_ payload: ArraySlice<UInt8> = []) -> [UInt8] {
            var bytes: [UInt8] = [0xc0, rawValue]
            for byte in payload {
                switch byte {
                case 0xc0: bytes += [0xdb, 0xdc]
                case 0xdb: bytes += [0xdb, 0xdd]
                default: bytes.append(byte)
                }
            }
            bytes.append(0xc0)
            return bytes
        }
    }

    struct Decoder {
        private var inFrame = false
        private var escaped = false
        private var bytes: [UInt8] = []

        mutating func append(_ byte: UInt8) -> (Frame, ArraySlice<UInt8>)? {
            if byte == 0xc0 {
                let frame = inFrame && !escaped ? bytes.first.flatMap(Frame.init(rawValue:)) : nil
                let payload = bytes.dropFirst()
                inFrame = true
                escaped = false
                bytes.removeAll(keepingCapacity: true)
                return frame.map { ($0, payload) }
            }
            guard inFrame else { return nil }
            if escaped {
                if byte == 0xdc { bytes.append(0xc0) }
                else if byte == 0xdd { bytes.append(0xdb) }
                else { inFrame = false }
                escaped = false
            } else if byte == 0xdb {
                escaped = true
            } else {
                bytes.append(byte)
            }
            if bytes.count > 1025 { inFrame = false }
            return nil
        }
    }

    private let stopped = NSLock()
    private let relayFinished = DispatchGroup()
    private var cancelled = false
    let port: UInt16

    init(path: String) throws {
        guard CompanionUSBPort.isSupported(path) else { throw POSIXError(.EINVAL) }
        if CompanionUSBPort.isNative(path) && !CompanionUSBPort.available().contains(path) {
            throw POSIXError(.ENODEV)
        }
        let listener = socket(AF_INET, SOCK_STREAM, 0)
        guard listener >= 0 else { throw Self.systemError() }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = in_addr_t(INADDR_LOOPBACK).bigEndian
        var size = socklen_t(MemoryLayout<sockaddr_in>.size)
        let result = withUnsafeMutablePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddr in
                bind(listener, sockaddr, size) == 0 && listen(listener, 1) == 0 &&
                    getsockname(listener, sockaddr, &size) == 0
            }
        }
        guard result else {
            let error = Self.systemError()
            close(listener)
            throw error
        }
        let serial = Darwin.open(path, O_RDWR | O_NOCTTY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW)
        guard serial >= 0 else {
            let error = Self.systemError()
            close(listener)
            throw error
        }
        do {
            try Self.configure(serial, nativeUSB: CompanionUSBPort.isNative(path))
        } catch {
            close(serial)
            close(listener)
            throw error
        }
        port = UInt16(bigEndian: address.sin_port)
        let nativeUSB = CompanionUSBPort.isNative(path)
        relayFinished.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            self.relay(listener: listener, serial: serial, nativeUSB: nativeUSB)
            self.relayFinished.leave()
        }
    }

    func stop() { stopped.withLock { cancelled = true } }

    func stopAndWait() async {
        stop()
        await withCheckedContinuation { continuation in
            relayFinished.notify(queue: .global()) { continuation.resume() }
        }
    }

    var webSocketURL: URL {
        URL(string: "wss://127.0.0.1:\(port)\(CompanionCapabilities.protocolPath)")!
    }

    private static func systemError() -> POSIXError { POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }

    private static func configure(_ fd: Int32, nativeUSB: Bool) throws {
        var settings = termios()
        guard ioctl(fd, UInt(TIOCEXCL)) == 0, tcgetattr(fd, &settings) == 0 else { throw systemError() }
        cfmakeraw(&settings)
        settings.c_cflag |= tcflag_t(CLOCAL | CREAD)
        settings.c_cflag &= ~tcflag_t(HUPCL | CRTSCTS)
        let baud: speed_t = nativeUSB ? 115200 : 460800
        guard cfsetspeed(&settings, baud) == 0, tcsetattr(fd, TCSANOW, &settings) == 0 else { throw systemError() }
        // These lines can reset the S3 or put it into the ROM loader.
        var resetLines = TIOCM_DTR | TIOCM_RTS
        guard ioctl(fd, UInt(TIOCMBIC), &resetLines) == 0 else { throw systemError() }
    }

    private func relay(listener: Int32, serial: Int32, nativeUSB: Bool) {
        defer { close(serial); close(listener) }
        while !stopped.withLock({ cancelled }) {
            var incoming = pollfd(fd: listener, events: Int16(POLLIN), revents: 0)
            guard poll(&incoming, 1, 200) >= 0 || errno == EINTR else { return }
            guard incoming.revents & Int16(POLLIN) != 0 else { continue }
            let client = accept(listener, nil, nil)
            guard client >= 0 else { return }
            defer { close(client) }
            var one: Int32 = 1
            guard fcntl(client, F_SETFL, O_NONBLOCK) == 0,
                  setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size)) == 0
            else { return }
            forward(client: client, serial: serial, nativeUSB: nativeUSB)
            return
        }
    }

    private func forward(client: Int32, serial: Int32, nativeUSB: Bool) {
        guard writeAll(Frame.open.encode(), to: serial) else { return }
        defer { _ = writeAll(Frame.close.encode(), to: serial) }
        var decoder = Decoder()
        var panelReady = false
        var buffer = [UInt8](repeating: 0, count: 1024)
        var watched = [
            pollfd(fd: serial, events: Int16(POLLIN), revents: 0),
            pollfd(fd: client, events: 0, revents: 0),
        ]
        while !stopped.withLock({ cancelled }) {
            let ready = poll(&watched, nfds_t(watched.count), 200)
            if ready < 0 && errno == EINTR { continue }
            guard ready >= 0 else { return }
            for descriptor in watched where descriptor.revents != 0 {
                guard descriptor.revents & Int16(POLLIN) != 0 else { return }
                let count = read(descriptor.fd, &buffer, buffer.count)
                if count < 0 && (errno == EINTR || errno == EAGAIN) { continue }
                guard count > 0 else { return }
                if descriptor.fd == client {
                    let frame = Frame.data.encode(buffer.prefix(count))
                    guard writeAll(frame, to: serial) else { return }
                    // Native USB can fill the panel's receive ring faster than
                    // its main loop drains it. Keep bursts within the serial
                    // rate that the bridge can forward while the screen is busy.
                    if nativeUSB { Thread.sleep(forTimeInterval: Double(frame.count) / 32_000) }
                } else {
                    for byte in buffer.prefix(count) {
                        guard let (kind, payload) = decoder.append(byte) else { continue }
                        if kind == .open && payload.isEmpty { panelReady = true }
                        if kind == .close && panelReady { return }
                        if kind == .data && panelReady && !writeAll(Array(payload), to: client) { return }
                    }
                }
            }
            watched[1].events = panelReady ? Int16(POLLIN) : 0
        }
    }

    private func writeAll(_ bytes: [UInt8], to fd: Int32) -> Bool {
        bytes.withUnsafeBytes { buffer in
            guard let base = buffer.baseAddress else { return true }
            var offset = 0
            while offset < buffer.count {
                let count = write(fd, base.advanced(by: offset), buffer.count - offset)
                if count > 0 {
                    offset += count
                    continue
                }
                if count < 0 && errno == EINTR { continue }
                guard count < 0 && errno == EAGAIN, !stopped.withLock({ cancelled }) else { return false }
                var output = pollfd(fd: fd, events: Int16(POLLOUT), revents: 0)
                guard poll(&output, 1, 750) > 0, output.revents & Int16(POLLOUT) != 0 else { return false }
            }
            return true
        }
    }
}
