import CryptoKit
import Foundation

@MainActor
protocol OBSWebSocketTransport: AnyObject {
    var onReady: (() -> Void)? { get set }
    var onEvent: ((String, OBSWebSocket.Fields) -> Void)? { get set }
    var onClose: ((OBSWebSocket.Failure) -> Void)? { get set }
    var isReady: Bool { get }
    func connect(port: UInt16, password: String?)
    func close(_ failure: OBSWebSocket.Failure?)
    func setMeterEventsEnabled(_ enabled: Bool)
    func request(_ type: String, fields: OBSWebSocket.Fields) async throws -> OBSWebSocket.Fields
}

extension OBSWebSocketTransport {
    func setMeterEventsEnabled(_ enabled: Bool) {}
}

/// OBS WebSocket v5 transport. Lives on the Companion's main actor so replies
/// and OBS events are consumed in the same order as they arrive.
@MainActor
final class OBSWebSocket: OBSWebSocketTransport {
    enum Failure: Error, Equatable {
        case disconnected
        case authenticationRequired
        case authenticationRejected
        case unsupportedProtocol
        case sessionRevoked
        case invalidMessage
        case timedOut
        case requestRejected(Int)
    }

    typealias Fields = [String: Any]

    private struct Pending {
        let continuation: CheckedContinuation<Data, Error>
        let timeout: Task<Void, Never>
    }

    var onReady: (() -> Void)?
    var onEvent: ((String, Fields) -> Void)?
    var onClose: ((Failure) -> Void)?

    private let session: URLSession
    private let requestTimeout: Duration
    private var socket: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var handshakeTimeout: Task<Void, Never>?
    private var subscriptionTask: Task<Void, Never>?
    private var meterEventsEnabled = false
    private var sentMeterEvents = false
    private var password: String?
    private var receivedHello = false
    private(set) var isReady = false
    private var pending: [String: Pending] = [:]

    init(session: URLSession = .shared, requestTimeout: Duration = .seconds(4)) {
        self.session = session
        self.requestTimeout = requestTimeout
    }

    func connect(port: UInt16, password: String?) {
        close()
        guard let url = URL(string: "ws://127.0.0.1:\(port)") else { return }
        self.password = password
        let socket = session.webSocketTask(with: url)
        socket.maximumMessageSize = 1_048_576
        self.socket = socket
        socket.resume()

        handshakeTimeout = Task { [weak self] in
            guard let self else { return }
            do { try await Task.sleep(for: requestTimeout) } catch { return }
            if self.socket === socket { close(.timedOut) }
        }
        receiveTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let message = try await socket.receive()
                    guard let self, self.socket === socket else { return }
                    try await receive(message, from: socket)
                } catch {
                    guard let self, self.socket === socket else { return }
                    let reason = Self.failure(forCloseCode: socket.closeCode.rawValue)
                        ?? (error as? Failure) ?? .disconnected
                    close(reason)
                    return
                }
            }
        }
    }

    func close(_ failure: Failure? = nil) {
        let oldSocket = socket
        socket = nil
        isReady = false
        receivedHello = false
        password = nil
        receiveTask?.cancel()
        receiveTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        handshakeTimeout?.cancel()
        handshakeTimeout = nil
        subscriptionTask?.cancel()
        subscriptionTask = nil
        oldSocket?.cancel(with: .goingAway, reason: nil)
        let outstanding = pending
        pending.removeAll()
        for request in outstanding.values {
            request.timeout.cancel()
            request.continuation.resume(throwing: failure ?? Failure.disconnected)
        }
        if let failure { onClose?(failure) }
    }

    func setMeterEventsEnabled(_ enabled: Bool) {
        meterEventsEnabled = enabled
        updateSubscriptions()
    }

    private func eventSubscriptions(meters: Bool) -> Int {
        // General, Config, Scenes, Inputs, Transitions, Outputs, UI, optional InputVolumeMeters.
        let standard = 1 | 2 | 4 | 8 | 16 | 64 | 1024
        return meters ? standard | (1 << 16) : standard
    }

    private func updateSubscriptions() {
        guard isReady, let socket, subscriptionTask == nil, sentMeterEvents != meterEventsEnabled else { return }
        subscriptionTask = Task { [weak self] in
            guard let self, self.socket === socket else { return }
            while sentMeterEvents != meterEventsEnabled {
                let enabled = meterEventsEnabled
                do {
                    let update = try Self.encode(op: 3, data: ["eventSubscriptions": eventSubscriptions(meters: enabled)])
                    try await socket.send(update)
                } catch {
                    if self.socket === socket { close(.disconnected) }
                    return
                }
                guard self.socket === socket else { return }
                sentMeterEvents = enabled
            }
            subscriptionTask = nil
        }
    }

    func request(_ type: String, fields: Fields = [:]) async throws -> Fields {
        guard let socket, isReady else { throw Failure.disconnected }
        let id = UUID().uuidString
        let payload = try Self.encode(op: 6, data: [
            "requestType": type, "requestId": id, "requestData": fields,
        ])
        let data: Data = try await withCheckedThrowingContinuation { continuation in
            let timeout = Task { [weak self] in
                guard let self else { return }
                do { try await Task.sleep(for: requestTimeout) } catch { return }
                if pending[id] != nil { close(.timedOut) }
            }
            pending[id] = Pending(continuation: continuation, timeout: timeout)
            Task { [weak self] in
                do {
                    try await socket.send(payload)
                } catch {
                    guard let self, self.socket === socket else { return }
                    close(.disconnected)
                }
            }
        }
        guard let response = try JSONSerialization.jsonObject(with: data) as? Fields else {
            throw Failure.invalidMessage
        }
        return response
    }

    static func authentication(password: String, salt: String, challenge: String) -> String {
        func hash(_ text: String) -> String {
            Data(SHA256.hash(data: Data(text.utf8))).base64EncodedString()
        }
        return hash(hash(password + salt) + challenge)
    }

    static func failure(forCloseCode code: Int) -> Failure? {
        switch code {
        case 4009: return .authenticationRejected
        case 4010: return .unsupportedProtocol
        case 4011: return .sessionRevoked
        default: return nil
        }
    }

    private static func encode(op: Int, data: Fields) throws -> URLSessionWebSocketTask.Message {
        let json = try JSONSerialization.data(withJSONObject: ["op": op, "d": data])
        return .string(String(decoding: json, as: UTF8.self))
    }

    private func receive(_ message: URLSessionWebSocketTask.Message, from socket: URLSessionWebSocketTask) async throws {
        guard case let .string(text) = message,
              let envelope = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? Fields,
              let operation = envelope["op"] as? Int,
              let fields = envelope["d"] as? Fields else { throw Failure.invalidMessage }

        switch operation {
        case 0:
            guard !receivedHello, let rpcVersion = fields["rpcVersion"] as? Int else {
                throw Failure.invalidMessage
            }
            guard rpcVersion >= 1 else { throw Failure.unsupportedProtocol }
            receivedHello = true
            sentMeterEvents = meterEventsEnabled
            var identify: Fields = ["rpcVersion": 1, "eventSubscriptions": eventSubscriptions(meters: sentMeterEvents)]
            if let auth = fields["authentication"] as? Fields {
                guard let salt = auth["salt"] as? String,
                      let challenge = auth["challenge"] as? String else { throw Failure.invalidMessage }
                guard let password, !password.isEmpty else { throw Failure.authenticationRequired }
                identify["authentication"] = Self.authentication(password: password, salt: salt, challenge: challenge)
            }
            password = nil
            try await socket.send(Self.encode(op: 1, data: identify))
        case 2:
            guard receivedHello else { throw Failure.invalidMessage }
            guard fields["negotiatedRpcVersion"] as? Int == 1 else { throw Failure.unsupportedProtocol }
            // OBS also acknowledges Reidentify with Identified.
            if isReady { return }
            handshakeTimeout?.cancel()
            handshakeTimeout = nil
            isReady = true
            startHeartbeat(for: socket)
            onReady?()
            updateSubscriptions()
        case 5:
            guard isReady, let type = fields["eventType"] as? String else { throw Failure.invalidMessage }
            onEvent?(type, fields["eventData"] as? Fields ?? [:])
        case 7:
            guard isReady,
                  let id = fields["requestId"] as? String,
                  let status = fields["requestStatus"] as? Fields,
                  let success = status["result"] as? Bool,
                  let code = status["code"] as? Int else { throw Failure.invalidMessage }
            guard let request = pending.removeValue(forKey: id) else { return }
            request.timeout.cancel()
            if success {
                do {
                    let response = try JSONSerialization.data(withJSONObject: fields["responseData"] as? Fields ?? [:])
                    request.continuation.resume(returning: response)
                } catch {
                    request.continuation.resume(throwing: Failure.invalidMessage)
                }
            } else {
                request.continuation.resume(throwing: Failure.requestRejected(code))
            }
        default:
            break
        }
    }

    private func startHeartbeat(for socket: URLSessionWebSocketTask) {
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                guard let self, self.socket === socket else { return }
                // WebSocket ping also works while OBS is changing scene collections.
                let deadline = Task { [weak self] in
                    do { try await Task.sleep(for: .seconds(2)) } catch { return }
                    if self?.socket === socket { self?.close(.timedOut) }
                }
                do {
                    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                        socket.sendPing { error in
                            if let error {
                                continuation.resume(throwing: error)
                            } else {
                                continuation.resume()
                            }
                        }
                    }
                } catch {
                    if self.socket === socket { close(.disconnected) }
                }
                deadline.cancel()
            }
        }
    }
}
