import Foundation

/// One EventSub socket for the connected account. Helix restores the current
/// stream snapshot after a disconnect because EventSub cannot replay missed events.
struct TwitchEventStream: Sendable {
    private struct Message: Decodable {
        struct Metadata: Decodable {
            let messageType: String
            let messageId: String
        }
        struct Payload: Decodable {
            struct Session: Decodable {
                let id: String
                let keepaliveTimeoutSeconds: Int?
                let reconnectUrl: URL?
            }
            let session: Session?
        }
        let metadata: Metadata
        let payload: Payload
    }

    private enum Failure: Error { case invalidMessage, timedOut, revoked }
    private static let endpoint = URL(string: "wss://eventsub.wss.twitch.tv/ws")!

    let api: TwitchAPI

    func run(authorization: TwitchAPI.Authorization, onChange: @Sendable () async -> Void) async {
        var retryDelay = 2
        while !Task.isCancelled {
            do {
                try await receive(authorization: authorization, onChange: onChange)
                retryDelay = 2
            } catch is CancellationError {
                return
            } catch Failure.revoked {
                await onChange()
                return
            } catch {
                guard !Task.isCancelled else { return }
                await onChange()
                try? await Task.sleep(for: .seconds(retryDelay))
                retryDelay = min(retryDelay * 2, 60)
            }
        }
    }

    private func receive(authorization: TwitchAPI.Authorization,
                         onChange: @Sendable () async -> Void) async throws {
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }

        func open(_ url: URL) -> URLSessionWebSocketTask {
            let socket = session.webSocketTask(with: url)
            socket.resume()
            return socket
        }

        var socket = open(Self.endpoint)
        defer { socket.cancel(with: .goingAway, reason: nil) }
        var welcome = try await message(from: socket, timeout: 10)
        guard welcome.metadata.messageType == "session_welcome", let initial = welcome.payload.session else {
            throw Failure.invalidMessage
        }
        for event in ["stream.online", "stream.offline"] {
            try await api.subscribe(event: event, sessionID: initial.id, auth: authorization)
        }
        await onChange()
        var timeout = initial.keepaliveTimeoutSeconds ?? 10
        var recent = [String]()

        while !Task.isCancelled {
            let event = try await message(from: socket, timeout: timeout)
            switch event.metadata.messageType {
            case "notification":
                guard !recent.contains(event.metadata.messageId) else { continue }
                recent.append(event.metadata.messageId)
                if recent.count > 64 { recent.removeFirst() }
                await onChange()
            case "session_reconnect":
                guard let url = event.payload.session?.reconnectUrl,
                      url.scheme == "wss", url.host == Self.endpoint.host,
                      url.user == nil, url.password == nil, url.port == nil || url.port == 443 else {
                    throw Failure.invalidMessage
                }
                let replacement = open(url)
                do {
                    welcome = try await message(from: replacement, timeout: 10)
                    guard welcome.metadata.messageType == "session_welcome", let current = welcome.payload.session else {
                        throw Failure.invalidMessage
                    }
                    socket.cancel(with: .normalClosure, reason: nil)
                    socket = replacement
                    timeout = current.keepaliveTimeoutSeconds ?? 10
                    await onChange()
                } catch {
                    replacement.cancel(with: .goingAway, reason: nil)
                    throw error
                }
            case "revocation": throw Failure.revoked
            default: break
            }
        }
        throw CancellationError()
    }

    private func message(from socket: URLSessionWebSocketTask, timeout: Int) async throws -> Message {
        try await withTaskCancellationHandler {
            try await withThrowingTaskGroup(of: Message.self) { group in
                group.addTask {
                    let data: Data
                    switch try await socket.receive() {
                    case let .data(bytes): data = bytes
                    case let .string(text): data = Data(text.utf8)
                    @unknown default: throw Failure.invalidMessage
                    }
                    let decoder = JSONDecoder()
                    decoder.keyDecodingStrategy = .convertFromSnakeCase
                    return try decoder.decode(Message.self, from: data)
                }
                group.addTask {
                    try await Task.sleep(for: .seconds(max(5, min(timeout, 120)) + 2))
                    socket.cancel(with: .goingAway, reason: nil)
                    throw Failure.timedOut
                }
                defer { group.cancelAll() }
                guard let first = try await group.next() else { throw Failure.invalidMessage }
                return first
            }
        } onCancel: {
            socket.cancel(with: .goingAway, reason: nil)
        }
    }
}
