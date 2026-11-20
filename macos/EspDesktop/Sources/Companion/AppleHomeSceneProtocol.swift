import Foundation
import Network

struct AppleHomeSceneBindings: Codable, Equatable {
    static let limit = 8
    private(set) var sceneIDs: [UUID] = []

    static func chooseHome(from homes: [UUID], saved: UUID?) -> UUID? {
        if let saved { return homes.contains(saved) ? saved : nil }
        return homes.count == 1 ? homes.first : nil
    }

    mutating func discover(_ ids: [UUID]) {
        for id in ids where !sceneIDs.contains(id) {
            guard sceneIDs.count < Self.limit else { return }
            sceneIDs.append(id)
        }
    }

    func scene(at slot: Int, available: Set<UUID>) -> UUID? {
        guard (1...Self.limit).contains(slot), slot <= sceneIDs.count else { return nil }
        let id = sceneIDs[slot - 1]
        return available.contains(id) ? id : nil
    }

    static func action(for slot: Int) -> String {
        "shortcut.command+control+option+shift+\(slot)"
    }

    static func slot(for action: String) -> Int? {
        (1...limit).first { Self.action(for: $0) == action }
    }
}

struct AppleHomeControl: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let name: String

    static let actionPrefix = "applehome.control."

    var action: String { Self.actionPrefix + id.uuidString.lowercased() }

    static func reference(for action: String) -> UUID? {
        guard action.hasPrefix(actionPrefix) else { return nil }
        return UUID(uuidString: String(action.dropFirst(actionPrefix.count)))
    }
}

struct AppleHomeSceneMessage: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case hello, status, catalogStart, catalogControl, catalogEnd, run, result, disconnect }
    enum Status: String, Codable, Sendable { case waiting, chooseHome, denied, empty, ready }

    let kind: Kind
    var secret: UUID? = nil
    var status: Status? = nil
    var request: UUID? = nil
    var slot: Int? = nil
    var bindingSet: UUID? = nil
    var reference: UUID? = nil
    var control: AppleHomeControl? = nil
    var succeeded: Bool? = nil
}

// Both processes use a private, loopback connection. The companion gives the
// helper a fresh secret at launch. HomeKit scene names stay on this Mac.
@MainActor
final class AppleHomeSceneChannel {
    let connection: NWConnection
    var onMessage: ((AppleHomeSceneMessage) -> Void)?
    var onClose: (() -> Void)?
    private var buffer = Data()
    private var closed = false
    private let messageLimit = 2048

    init(_ connection: NWConnection) { self.connection = connection }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            MainActor.assumeIsolated {
                switch state {
                case .failed, .cancelled: self?.close()
                default: break
                }
            }
        }
        connection.start(queue: .main)
        receive()
    }

    func send(_ message: AppleHomeSceneMessage) {
        guard !closed, var data = try? JSONEncoder().encode(message) else { return }
        data.append(10)
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            if error != nil {
                MainActor.assumeIsolated { self?.close() }
            }
        })
    }

    func close() {
        guard !closed else { return }
        closed = true
        connection.cancel()
        onClose?()
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: messageLimit) { [weak self] data, _, complete, error in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                if let data { self.buffer.append(data) }
                while let end = self.buffer.firstIndex(of: 10) {
                    guard self.buffer.distance(from: self.buffer.startIndex, to: end) < self.messageLimit,
                          let message = try? JSONDecoder().decode(AppleHomeSceneMessage.self, from: self.buffer.prefix(upTo: end)) else {
                        self.close()
                        return
                    }
                    self.buffer.removeFirst(self.buffer.distance(from: self.buffer.startIndex, to: end) + 1)
                    self.onMessage?(message)
                    if self.closed { return }
                }
                if error != nil || complete || self.buffer.count >= self.messageLimit {
                    self.close()
                } else {
                    self.receive()
                }
            }
        }
    }
}
