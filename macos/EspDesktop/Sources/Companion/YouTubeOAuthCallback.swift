import Foundation
import Network

/// A single-use Google OAuth redirect. Only the local browser can reach this listener.
@MainActor
final class YouTubeOAuthCallback {
    enum Failure: Error { case listenerUnavailable, timedOut, declined }

    private let listener: NWListener
    private var ready: CheckedContinuation<URL, any Error>?
    private var response: CheckedContinuation<String, any Error>?
    private var connections: [ObjectIdentifier: NWConnection] = [:]
    private var timeout: Task<Void, Never>?
    private var expectedState: String?
    private var result: Result<String, any Error>?

    init() throws {
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
    }

    func start(state: String) async throws -> URL {
        expectedState = state
        listener.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in self?.listenerChanged(state) }
        }
        listener.newConnectionHandler = { [weak self] connection in
            Task { @MainActor in
                guard let self else { connection.cancel(); return }
                self.accept(connection)
            }
        }
        timeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(180))
            guard !Task.isCancelled else { return }
            self?.finish(.failure(Failure.timedOut))
        }
        return try await withCheckedThrowingContinuation {
            ready = $0
            listener.start(queue: .main)
        }
    }

    func code() async throws -> String {
        if let result { return try result.get() }
        return try await withCheckedThrowingContinuation { response = $0 }
    }

    func cancel() {
        finish(.failure(CancellationError()))
    }

    private func listenerChanged(_ state: NWListener.State) {
        switch state {
        case .ready:
            guard let port = listener.port,
                  let url = URL(string: "http://127.0.0.1:\(port.rawValue)/oauth") else {
                finish(.failure(Failure.listenerUnavailable))
                return
            }
            ready?.resume(returning: url)
            ready = nil
        case .failed, .waiting:
            finish(.failure(Failure.listenerUnavailable))
        default: break
        }
    }

    private func accept(_ connection: NWConnection) {
        guard result == nil, connections.count < 8 else { connection.cancel(); return }
        connections[ObjectIdentifier(connection)] = connection
        connection.start(queue: .main)
        read(connection, buffer: Data())
    }

    private func read(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, complete, error in
            Task { @MainActor in
                guard let self, self.connections[ObjectIdentifier(connection)] != nil else { return }
                var received = buffer
                if let data { received.append(data) }
                if received.count <= 8192,
                   let end = received.range(of: Data([13, 10])),
                   let line = String(data: received[..<end.lowerBound], encoding: .utf8) {
                    self.respond(to: line, on: connection)
                } else if received.count >= 8192 || complete || error != nil {
                    self.close(connection)
                } else {
                    self.read(connection, buffer: received)
                }
            }
        }
    }

    static func parse(_ line: String, state: String) -> Result<String, Failure>? {
        let request = line.split(separator: " ", omittingEmptySubsequences: false)
        guard request.count == 3, request[0] == "GET", request[1].hasPrefix("/oauth?"),
              let url = URLComponents(string: String(request[1])), url.path == "/oauth",
              let query = url.queryItems, query.filter({ $0.name == "state" }).map(\.value) == [state] else {
            return nil
        }
        if query.contains(where: { $0.name == "error" }) { return .failure(.declined) }
        let codes = query.filter { $0.name == "code" }
        guard codes.count == 1, let code = codes.first?.value, !code.isEmpty else { return nil }
        return .success(code)
    }

    private func respond(to line: String, on connection: NWConnection) {
        let parsed = expectedState.flatMap { Self.parse(line, state: $0) }
        let body: String
        switch parsed {
        case .success: body = "Return to EspDesktop to finish connecting YouTube."
        case .failure: body = "YouTube sign-in was declined. Return to EspDesktop to try again."
        case nil: body = "No matching EspDesktop sign-in request."
        }
        let status = parsed == nil ? "400 Bad Request" : "200 OK"
        let message = "HTTP/1.1 \(status)\r\nContent-Type: text/plain; charset=utf-8\r\n"
            + "Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n"
            + "Content-Length: \(body.utf8.count)\r\n\r\n" + body
        connections.removeValue(forKey: ObjectIdentifier(connection))
        connection.send(content: Data(message.utf8), completion: .contentProcessed { _ in connection.cancel() })
        if let parsed { finish(parsed.mapError { $0 as any Error }) }
    }

    private func close(_ connection: NWConnection) {
        connections.removeValue(forKey: ObjectIdentifier(connection))
        connection.cancel()
    }

    private func finish(_ result: Result<String, any Error>) {
        guard self.result == nil else { return }
        self.result = result
        expectedState = nil
        timeout?.cancel()
        listener.cancel()
        for connection in connections.values { connection.cancel() }
        connections.removeAll()
        if let ready {
            switch result {
            case .success: ready.resume(throwing: Failure.listenerUnavailable)
            case .failure(let error): ready.resume(throwing: error)
            }
        }
        ready = nil
        response?.resume(with: result)
        response = nil
    }
}
