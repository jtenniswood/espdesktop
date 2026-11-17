import Combine
import CryptoKit
import Foundation

struct StreamlabsScene: Equatable {
    let id: String
    let name: String

    let actionID: String

    init(id: String, name: String) {
        self.id = id
        self.name = name
        let digest = SHA256.hash(data: Data(id.utf8)).prefix(16)
        actionID = StreamlabsSnapshot.scenePrefix + digest.map { String(format: "%02x", $0) }.joined()
    }
}

struct StreamlabsSnapshot: Equatable {
    static let scenePrefix = "streamlabs.scene."
    static let recordingAction = "streamlabs.recording"
    static let startRecordingAction = "streamlabs.recording.start"
    static let stopRecordingAction = "streamlabs.recording.stop"

    var scenes: [StreamlabsScene] = []
    var activeSceneID = ""
    var recording: Bool?

    var activeSceneActionID: String {
        scenes.first { $0.id == activeSceneID }?.actionID ?? ""
    }

    var actions: [StreamlabsAction] {
        var actions = scenes.map { StreamlabsAction(id: $0.actionID, label: $0.name) }
        if recording != nil {
            actions.append(StreamlabsAction(id: Self.recordingAction, label: "Recording"))
        }
        return actions
    }

    static func isAction(_ id: String) -> Bool {
        id.hasPrefix("streamlabs.")
    }
}

struct StreamlabsAction: Equatable {
    let id: String
    let label: String
}

@MainActor
final class StreamlabsConnection: ObservableObject {
    private static let portKey = "streamlabs.port"
    private static let credentialService = "io.espdesktop.app.streamlabs"
    private static let credentialAccount = "localhost"
    static let defaultPort = 59650

    @Published private(set) var status = "Disconnected"
    @Published private(set) var port: Int
    @Published private(set) var configured: Bool

    private(set) var snapshot = StreamlabsSnapshot()
    var onSnapshot: ((StreamlabsSnapshot, StreamlabsSnapshot) -> Void)?
    private let defaults: UserDefaults
    private let makeClient: (Int) -> any StreamlabsRPC
    private var client: (any StreamlabsRPC)?
    private var worker: Task<Void, Never>?
    private var recordingInFlight = false
    private var sceneInFlight = false

    init(defaults: UserDefaults, makeClient: @escaping (Int) -> any StreamlabsRPC = { StreamlabsWebSocket(port: $0) }) {
        self.defaults = defaults
        self.makeClient = makeClient
        let savedPort = defaults.integer(forKey: Self.portKey)
        let hasSavedPort = (1...65535).contains(savedPort)
        configured = hasSavedPort
        port = hasSavedPort ? savedPort : Self.defaultPort
    }

    @discardableResult
    func configure(port: Int, token: String) -> Bool {
        let key = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...65535).contains(port), !key.isEmpty, key.utf8.count <= 256,
              key.utf8.allSatisfy({ (33...126).contains($0) }) else {
            status = "Enter the Streamlabs port and API token."
            return false
        }
        guard KeychainStore.save(Data(key.utf8), service: Self.credentialService, account: Self.credentialAccount) else {
            status = "Couldn’t save the Streamlabs token in Keychain."
            return false
        }
        defaults.set(port, forKey: Self.portKey)
        self.port = port
        configured = true
        start(port: port, token: key)
        return true
    }

    func reconnect() {
        guard configured else { return }
        guard let data = KeychainStore.load(service: Self.credentialService, account: Self.credentialAccount),
              let token = String(data: data, encoding: .utf8) else {
            status = "Enter the Streamlabs API token again."
            return
        }
        start(port: port, token: token)
    }

    func disconnect() {
        stop()
        KeychainStore.remove(service: Self.credentialService, account: Self.credentialAccount)
        defaults.removeObject(forKey: Self.portKey)
        configured = false
        status = "Disconnected"
    }

    func stop() {
        worker?.cancel()
        worker = nil
        client?.close()
        client = nil
        recordingInFlight = false
        sceneInFlight = false
        update(StreamlabsSnapshot())
    }

    func start(port: Int, token: String) {
        stop()
        status = "Connecting…"
        worker = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let client = self.makeClient(port)
                self.client = client
                var tokenRejected = false
                do {
                    guard try await client.call("auth", resource: "TcpServerService", args: [token]) as? Bool == true else {
                        throw StreamlabsRPCError.invalidToken
                    }
                    try await self.watch(client)
                } catch StreamlabsRPCError.invalidToken {
                    tokenRejected = true
                } catch { /* Closing, restarting or temporarily busy. */ }
                client.close()
                guard !Task.isCancelled, self.client === client else { return }
                self.client = nil
                self.recordingInFlight = false
                self.sceneInFlight = false
                self.update(StreamlabsSnapshot())
                self.status = tokenRejected ? "Streamlabs rejected the API token." : "Waiting for Streamlabs Desktop…"
                if tokenRejected { return }
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
            }
        }
    }

    private func watch(_ client: any StreamlabsRPC) async throws {
        var scenes: [StreamlabsScene] = []
        var lastSceneRead: ContinuousClock.Instant?
        while !Task.isCancelled {
            let active = try await client.call("activeSceneId", resource: "ScenesService", args: []) as? String ?? ""
            let shouldReadScenes = lastSceneRead.map { $0.duration(to: .now) >= .seconds(5) } ?? true
            let activeSceneMissing = !active.isEmpty && active != snapshot.activeSceneID &&
                !scenes.contains { $0.id == active }
            if shouldReadScenes || activeSceneMissing {
                let response = try await client.call("getScenes", resource: "ScenesService", args: [])
                scenes = try Self.decodeScenes(response)
                lastSceneRead = .now
            }
            let recording = try await readRecording(client)
            guard !Task.isCancelled, self.client === client else { return }
            update(StreamlabsSnapshot(scenes: scenes, activeSceneID: active, recording: recording))
            if status != "Connected to Streamlabs Desktop" { status = "Connected to Streamlabs Desktop" }
            try await Task.sleep(for: .seconds(1))
        }
    }

    static func decodeScenes(_ response: Any?) throws -> [StreamlabsScene] {
        guard let list = response as? [[String: Any]] else { throw StreamlabsRPCError.invalidResponse }
        var seen: Set<String> = []
        var scenes: [StreamlabsScene] = []
        for item in list {
            guard let id = item["id"] as? String, !id.isEmpty, id.utf8.count <= 256,
                  let name = item["name"] as? String,
                  seen.insert(id).inserted else { continue }
            scenes.append(StreamlabsScene(id: id, name: name))
            if scenes.count == 64 { break }
        }
        return scenes
    }

    private func readRecording(_ client: any StreamlabsRPC) async throws -> Bool? {
        let result = try await client.call("getModel", resource: "StreamingService", args: []) as? [String: Any]
        switch result?["recordingStatus"] as? String {
        case "offline": return false
        case "recording": return true
        default: return nil
        }
    }

    private func update(_ next: StreamlabsSnapshot) {
        guard snapshot != next else { return }
        let previous = snapshot
        snapshot = next
        onSnapshot?(previous, next)
    }

    func perform(_ actionID: String) async -> Bool {
        guard let client, !Task.isCancelled else { return false }
        switch actionID {
        case StreamlabsSnapshot.startRecordingAction: return await setRecording(true, client: client)
        case StreamlabsSnapshot.stopRecordingAction: return await setRecording(false, client: client)
        default: break
        }
        guard !sceneInFlight, let scene = snapshot.scenes.first(where: { $0.actionID == actionID }) else { return false }
        sceneInFlight = true
        defer { if self.client === client { sceneInFlight = false } }
        do {
            let switched = try await client.call("makeSceneActive", resource: "ScenesService", args: [scene.id])
            return self.client === client && switched as? Bool == true
        } catch { return false }
    }

    private func setRecording(_ target: Bool, client: any StreamlabsRPC) async -> Bool {
        guard !recordingInFlight, snapshot.recording != nil else { return false }
        recordingInFlight = true
        defer { if self.client === client { recordingInFlight = false } }
        do {
            // The display sends the intended state. Check Streamlabs first so
            // another controller changing the recording won't reverse that intent.
            guard let current = try await readRecording(client), self.client === client else { return false }
            if current == target { return true }
            _ = try await client.call("toggleRecording", resource: "StreamingService", args: [])
            // Streamlabs acknowledges the asynchronous toggle before the output
            // changes. Confirm the new state through the regular refresh loop.
            for _ in 0..<20 {
                try await Task.sleep(for: .milliseconds(250))
                guard self.client === client else { return false }
                if snapshot.recording == target { return true }
            }
        } catch { /* A toggle is never replayed automatically. */ }
        return false
    }
}
