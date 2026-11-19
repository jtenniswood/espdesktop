import Foundation
import zlib

enum USBEditorError: LocalizedError {
    case disconnected, timedOut, invalidResponse, tooLarge

    var errorDescription: String? {
        switch self {
        case .disconnected: "Reconnect the display by USB to continue."
        case .timedOut: "The display did not respond. Check the USB cable and firmware."
        case .invalidResponse: "The display could not complete the editor request."
        case .tooLarge: "The display returned more data than the USB editor can handle."
        }
    }
}

struct USBEditorRequest {
    let method: String
    let path: String
    let headers: [String: String]
    let body: Data

    init?(method: String, path: String, headers: [String: String] = [:], body: Data = Data()) {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), path.utf8.count <= 4096,
              path.utf8.allSatisfy({ (33...126).contains($0) }), !path.contains("#"),
              !path.contains("\\"), body.count <= 512 * 1024 else { return nil }
        let route = String(path.split(separator: "?", maxSplits: 1)[0])
        switch method {
        case "GET":
            guard body.isEmpty, route != "/events", route != "/companion/pairing" || path == route else { return nil }
        case "PUT":
            guard path == "/api/v1/config" else { return nil }
        case "POST":
            let allowed = ["/companion/page-preview", "/companion/url-targets"]
            let entity = route.split(separator: "/")
            let setting = entity.count == 3 && ["text", "number", "select", "switch"].contains(entity[0]) &&
                ["set", "turn_on", "turn_off"].contains(entity[2])
            guard allowed.contains(route) || setting else { return nil }
        default:
            return nil
        }
        var filtered: [String: String] = [:]
        for (name, value) in headers {
            let key = name.lowercased()
            guard ["content-type", "if-match", "x-panel-config-version", "x-espdesktop-epoch"].contains(key),
                  value.utf8.count <= 256, value.utf8.allSatisfy({ (32...126).contains($0) }) else { continue }
            filtered[key] = value
        }
        self.method = method
        self.path = path
        self.headers = filtered
        self.body = body
    }

    var wireBytes: Data {
        var request = "\(method) \(path) HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n"
        for (name, value) in headers { request += "\(name): \(value)\r\n" }
        if method != "GET" { request += "Content-Length: \(body.count)\r\n" }
        var wire = Data((request + "\r\n").utf8)
        wire.append(body)
        return wire
    }
}

struct USBEditorResponse {
    var status: Int
    var headers: [String: String]
    var body: Data

    enum InterruptedSave { case confirmed, retry, conflict }

    func decideInterruptedSave(_ request: USBEditorRequest) -> InterruptedSave {
        guard status == 200, let generation = headers["etag"],
              request.headers["x-panel-config-version"].map({ headers["x-panel-config-version"] == $0 }) ?? true
        else { return .conflict }
        if body == request.body { return .confirmed }
        return generation == request.headers["if-match"] ? .retry : .conflict
    }

    static let maximumBytes = 8 * 1024 * 1024
    private static let blankLine = Data("\r\n\r\n".utf8)
    private static let newLine = Data("\r\n".utf8)

    static func parse(_ bytes: Data, ended: Bool) throws -> Self? {
        guard let separator = bytes.range(of: blankLine) else {
            if bytes.count > 16_384 || ended { throw USBEditorError.invalidResponse }
            return nil
        }
        guard let text = String(data: bytes.prefix(separator.lowerBound), encoding: .utf8),
              let first = text.components(separatedBy: "\r\n").first,
              first.hasPrefix("HTTP/"), let status = first.split(separator: " ").dropFirst().first.flatMap({ Int($0) }),
              (200...599).contains(status) else { throw USBEditorError.invalidResponse }
        var headers: [String: String] = [:]
        for line in text.components(separatedBy: "\r\n").dropFirst() {
            guard let split = line.firstIndex(of: ":") else { throw USBEditorError.invalidResponse }
            headers[line[..<split].lowercased()] = line[line.index(after: split)...].trimmingCharacters(in: .whitespaces)
        }
        var body = Data(bytes[separator.upperBound...])
        if status == 204 || status == 304 {
            body = Data()
        } else if headers["transfer-encoding"]?.lowercased() == "chunked" {
            if ended {
                body = try decodeChunks(body)
            } else {
                guard body.suffix(5) == Data("0\r\n\r\n".utf8),
                      let decoded = try? decodeChunks(body) else { return nil }
                body = decoded
            }
        } else if let size = headers["content-length"].flatMap(Int.init) {
            guard size >= 0 && size <= maximumBytes else { throw USBEditorError.tooLarge }
            if body.count < size {
                if ended { throw USBEditorError.invalidResponse }
                return nil
            }
            body = Data(body.prefix(size))
        } else if !ended {
            return nil
        }
        if headers.removeValue(forKey: "content-encoding")?.lowercased() == "gzip" {
            body = try inflateGzip(body)
        }
        headers.removeValue(forKey: "transfer-encoding")
        headers.removeValue(forKey: "content-length")
        return Self(status: status, headers: headers, body: body)
    }

    private static func decodeChunks(_ bytes: Data) throws -> Data {
        var offset = 0
        var output = Data()
        while let line = bytes.range(of: newLine, in: offset..<bytes.count),
              let length = String(data: bytes[offset..<line.lowerBound], encoding: .ascii)?
                .split(separator: ";").first.flatMap({ Int($0, radix: 16) }), length >= 0 {
            if length == 0 {
                guard bytes.count >= line.upperBound + 2 else { break }
                return output
            }
            let start = line.upperBound
            guard length <= bytes.count - start - 2, output.count + length <= maximumBytes,
                  bytes[start + length] == 13, bytes[start + length + 1] == 10 else {
                throw USBEditorError.invalidResponse
            }
            output.append(bytes[start..<(start + length)])
            offset = start + length + 2
        }
        throw USBEditorError.invalidResponse
    }

    private static func inflateGzip(_ bytes: Data) throws -> Data {
        var stream = z_stream()
        guard inflateInit2_(&stream, 31, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK else {
            throw USBEditorError.invalidResponse
        }
        defer { inflateEnd(&stream) }
        return try bytes.withUnsafeBytes { raw in
            stream.next_in = UnsafeMutablePointer(mutating: raw.bindMemory(to: UInt8.self).baseAddress)
            stream.avail_in = UInt32(raw.count)
            var output = Data()
            var chunk = [UInt8](repeating: 0, count: 32_768)
            while true {
                let size = chunk.count
                let result = chunk.withUnsafeMutableBufferPointer { buffer in
                    stream.next_out = buffer.baseAddress
                    stream.avail_out = UInt32(buffer.count)
                    return inflate(&stream, Z_NO_FLUSH)
                }
                guard result == Z_OK || result == Z_STREAM_END else { throw USBEditorError.invalidResponse }
                let produced = size - Int(stream.avail_out)
                guard output.count + produced <= maximumBytes else { throw USBEditorError.tooLarge }
                output.append(contentsOf: chunk.prefix(produced))
                if result == Z_STREAM_END { return output }
            }
        }
    }
}
