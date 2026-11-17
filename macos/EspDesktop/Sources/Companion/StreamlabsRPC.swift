import Foundation

enum StreamlabsRPCError: Error {
    case disconnected, timedOut, invalidResponse, rejected, invalidToken
}

@MainActor
protocol StreamlabsRPC: AnyObject {
    func call(_ method: String, resource: String, args: [String]) async throws -> Any?
    func close()
}

@MainActor
final class StreamlabsWebSocket: StreamlabsRPC {
    private struct Request {
        let reply: CheckedContinuation<Data, any Error>
        let timeout: Task<Void, Never>
    }

    private let session: URLSession
    private let socket: URLSessionWebSocketTask
    private var listener: Task<Void, Never>?
    private var nextID = 0
    private var pending: [Int: Request] = [:]
    private var closed = false

    init(port: Int) {
        let url = URL(string: "ws://127.0.0.1:\(port)/api/websocket")!
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        session = URLSession(configuration: configuration, delegate: RejectRedirects(), delegateQueue: nil)
        socket = session.webSocketTask(with: url)
        socket.maximumMessageSize = 2 * 1024 * 1024
        socket.resume()
        listener = Task { [weak self, socket] in
            do {
                while !Task.isCancelled {
                    let message = try await socket.receive()
                    guard let self else { return }
                    self.receive(message)
                }
            } catch {
                self?.close()
            }
        }
    }

    func call(_ method: String, resource: String, args: [String] = []) async throws -> Any? {
        guard !closed else { throw StreamlabsRPCError.disconnected }
        try Task.checkCancellation()
        nextID += 1
        let id = nextID
        let data = try JSONSerialization.data(withJSONObject: [
            "jsonrpc": "2.0", "id": id, "method": method,
            "params": ["resource": resource, "args": args],
        ])
        let message = String(decoding: data, as: UTF8.self)
        let reply: Data = try await withCheckedThrowingContinuation { continuation in
            let timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                self?.finish(id, with: .failure(StreamlabsRPCError.timedOut))
            }
            pending[id] = Request(reply: continuation, timeout: timeout)
            Task { [weak self, socket] in
                do { try await socket.send(.string(message)) }
                catch { self?.finish(id, with: .failure(StreamlabsRPCError.disconnected)) }
            }
        }
        guard let response = try JSONSerialization.jsonObject(with: reply) as? [String: Any] else {
            throw StreamlabsRPCError.invalidResponse
        }
        if let error = response["error"] as? [String: Any] {
            if method == "auth", error["message"] as? String == "Invalid token" {
                throw StreamlabsRPCError.invalidToken
            }
            throw StreamlabsRPCError.rejected
        }
        return response["result"]
    }

    private func receive(_ message: URLSessionWebSocketTask.Message) {
        guard case let .string(text) = message else { return }
        let data = Data(text.utf8)
        guard let response = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              response["jsonrpc"] as? String == "2.0",
              let id = response["id"] as? Int else { return }
        // Streamlabs also emits notifications without a request ID.
        finish(id, with: .success(data))
    }

    private func finish(_ id: Int, with result: Result<Data, any Error>) {
        guard let request = pending.removeValue(forKey: id) else { return }
        request.timeout.cancel()
        request.reply.resume(with: result)
    }

    func close() {
        guard !closed else { return }
        closed = true
        listener?.cancel()
        socket.cancel(with: .goingAway, reason: nil)
        session.invalidateAndCancel()
        for id in Array(pending.keys) {
            finish(id, with: .failure(StreamlabsRPCError.disconnected))
        }
    }
}

// A token entered for the local Streamlabs socket must stay on this Mac.
private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
