import AppKit
import Combine
import Foundation

@MainActor
final class OBSConnection: ObservableObject {
    enum Status: Equatable {
        case off, connecting, syncing, connected
        case obsClosed, websocketUnavailable, passwordRequired, passwordRejected
        case incompatible, accessRevoked, keychainUnavailable

        var title: String {
            switch self {
            case .off: return "Disconnected"
            case .connecting: return "Connecting to OBS…"
            case .syncing: return "Syncing OBS…"
            case .connected: return "Connected to OBS"
            case .obsClosed: return "Open OBS Studio"
            case .websocketUnavailable: return "Check WebSocket Server Settings and the port in OBS"
            case .passwordRequired: return "Enter the WebSocket password from OBS"
            case .passwordRejected: return "OBS rejected the WebSocket password"
            case .incompatible: return "This version of OBS WebSocket is unsupported"
            case .accessRevoked: return "OBS disconnected EspDesktop. Select Connect to try again."
            case .keychainUnavailable: return "EspDesktop couldn’t save the OBS password in Keychain"
            }
        }
    }

    struct Target: Equatable, Identifiable {
        let id: String
        let name: String

        init?(fields: OBSWebSocket.Fields, kind: String) {
            guard let name = fields[kind + "Name"] as? String, !name.isEmpty,
                  let id = fields[kind + "Uuid"] as? String, !id.isEmpty else { return nil }
            self.id = id
            self.name = name
        }
    }

    struct State: Equatable {
        let collection: String
        let scenes: [Target]
        let inputs: [Target]
        var program: Target?
        var preview: Target?
        var studioMode: Bool
        var streaming: Bool
        var streamReconnecting: Bool
        var recording: Bool
    }

    private enum Keys {
        static let enabled = "obs.enabled"
        static let port = "obs.port"
        static let credential = "obs.local-websocket"
    }

    @Published private(set) var status: Status = .off
    @Published private(set) var state: State?
    @Published private(set) var port: UInt16
    @Published private(set) var enabled: Bool

    private let socket: OBSWebSocket
    private let defaults: UserDefaults
    private var reconnectTask: Task<Void, Never>?
    private var syncTask: Task<Void, Never>?
    private var generation = UUID()
    private var collectionChanging = false
    private var bufferedEvents: [(String, OBSWebSocket.Fields)] = []

    init(defaults: UserDefaults = .standard, socket: OBSWebSocket = OBSWebSocket()) {
        self.defaults = defaults
        self.socket = socket
        enabled = defaults.bool(forKey: Keys.enabled)
        port = UInt16(exactly: defaults.integer(forKey: Keys.port)).flatMap { $0 == 0 ? nil : $0 } ?? 4455

        socket.onReady = { [weak self] in self?.sync() }
        socket.onEvent = { [weak self] type, fields in self?.receive(type, fields: fields) }
        socket.onClose = { [weak self] failure in self?.disconnected(failure) }
    }

    func start() {
        guard enabled, status == .off else { return }
        connect()
    }

    func configure(port: UInt16, password: String) {
        if !password.isEmpty,
           !KeychainStore.save(Data(password.utf8), service: KeychainStore.service, account: Keys.credential) {
            stop()
            status = .keychainUnavailable
            return
        }

        self.port = port
        defaults.set(Int(port), forKey: Keys.port)
        enabled = true
        defaults.set(true, forKey: Keys.enabled)
        connect()
    }

    func disable() {
        enabled = false
        defaults.set(false, forKey: Keys.enabled)
        KeychainStore.remove(service: KeychainStore.service, account: Keys.credential)
        stop()
    }

    func stop() {
        reconnectTask?.cancel()
        reconnectTask = nil
        invalidate()
        collectionChanging = false
        socket.close()
        status = .off
    }

    func selectScene(id: String, collection: String, expectedStudioMode: Bool) async -> Bool {
        guard let state, state.collection == collection, state.studioMode == expectedStudioMode,
              state.scenes.contains(where: { $0.id == id }) else { return false }
        return await command(expectedStudioMode ? "SetCurrentPreviewScene" : "SetCurrentProgramScene",
                             fields: ["sceneUuid": id])
    }

    func takeLive(collection: String, previewID: String) async -> Bool {
        guard let state, state.collection == collection, state.studioMode,
              state.preview?.id == previewID else { return false }
        return await command("TriggerStudioModeTransition", fields: [:])
    }

    func micMute(id: String, collection: String) async -> Bool? {
        guard let state, state.collection == collection, state.inputs.contains(where: { $0.id == id }) else {
            return nil
        }
        let active = generation
        guard let reply = try? await socket.request("GetInputMute", fields: ["inputUuid": id]),
              active == generation else { return nil }
        return reply["inputMuted"] as? Bool
    }

    func setMicMute(id: String, collection: String, muted: Bool) async -> Bool {
        guard let state, state.collection == collection, state.inputs.contains(where: { $0.id == id }) else {
            return false
        }
        return await command("SetInputMute", fields: ["inputUuid": id, "inputMuted": muted])
    }

    private func command(_ name: String, fields: OBSWebSocket.Fields) async -> Bool {
        let active = generation
        do {
            _ = try await socket.request(name, fields: fields)
            return active == generation
        } catch {
            return false
        }
    }

    private func connect() {
        stop()
        status = .connecting
        let password = KeychainStore.load(service: KeychainStore.service, account: Keys.credential)
            .map { String(decoding: $0, as: UTF8.self) }
        socket.connect(port: port, password: password)
    }

    private func disconnected(_ failure: OBSWebSocket.Failure) {
        invalidate()
        collectionChanging = false
        switch failure {
        case .authenticationRequired:
            status = .passwordRequired
        case .authenticationRejected:
            status = .passwordRejected
        case .invalidMessage, .unsupportedProtocol:
            status = .incompatible
        case .sessionRevoked:
            status = .accessRevoked
        default:
            let running = !NSRunningApplication.runningApplications(withBundleIdentifier: "com.obsproject.obs-studio").isEmpty
            status = running ? .websocketUnavailable : .obsClosed
            reconnectTask?.cancel()
            reconnectTask = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(4)) } catch { return }
                guard let self, enabled else { return }
                reconnectTask = nil
                connect()
            }
        }
    }

    private func invalidate() {
        generation = UUID()
        syncTask?.cancel()
        syncTask = nil
        bufferedEvents.removeAll()
        state = nil
    }

    private func sync() {
        invalidate()
        guard !collectionChanging, socket.isReady else { return }
        status = .syncing
        let active = generation
        syncTask = Task { [weak self] in
            guard let self else { return }
            do {
                let collection = try await snapshotRequest("GetSceneCollectionList", generation: active)
                let scenes = try await snapshotRequest("GetSceneList", generation: active)
                let inputs = try await snapshotRequest("GetInputList", generation: active)
                let studio = try await snapshotRequest("GetStudioModeEnabled", generation: active)
                let stream = try await snapshotRequest("GetStreamStatus", generation: active)
                let record = try await snapshotRequest("GetRecordStatus", generation: active)
                guard active == generation else { return }
                guard let collectionName = collection["currentSceneCollectionName"] as? String,
                      let sceneList = scenes["scenes"] as? [OBSWebSocket.Fields],
                      let inputList = inputs["inputs"] as? [OBSWebSocket.Fields],
                      let studioMode = studio["studioModeEnabled"] as? Bool,
                      let streaming = stream["outputActive"] as? Bool,
                      let recording = record["outputActive"] as? Bool else {
                    socket.close(.invalidMessage)
                    return
                }
                let sceneTargets = sceneList.compactMap { Target(fields: $0, kind: "scene") }
                // Require stable scene IDs. A scene name alone is unsafe across collections.
                guard sceneTargets.count == sceneList.count else {
                    socket.close(.unsupportedProtocol)
                    return
                }
                var snapshot = State(
                    collection: collectionName,
                    scenes: sceneTargets,
                    inputs: inputList.compactMap { Target(fields: $0, kind: "input") },
                    program: sceneTargets.first { $0.id == scenes["currentProgramSceneUuid"] as? String },
                    preview: sceneTargets.first { $0.id == scenes["currentPreviewSceneUuid"] as? String },
                    studioMode: studioMode,
                    streaming: streaming,
                    streamReconnecting: stream["outputReconnecting"] as? Bool ?? false,
                    recording: recording
                )
                for (type, fields) in bufferedEvents { Self.apply(type, fields: fields, to: &snapshot) }
                bufferedEvents.removeAll()
                state = snapshot
                status = .connected
            } catch {
                guard active == generation else { return }
                socket.close(.disconnected)
            }
        }
    }

    private func snapshotRequest(_ name: String, generation active: UUID) async throws -> OBSWebSocket.Fields {
        guard active == generation, !Task.isCancelled else { throw CancellationError() }
        return try await socket.request(name)
    }

    private func receive(_ type: String, fields: OBSWebSocket.Fields) {
        switch type {
        case "ExitStarted":
            socket.close(.disconnected)
        case "CurrentSceneCollectionChanging":
            collectionChanging = true
            invalidate()
            status = .syncing
        case "CurrentSceneCollectionChanged":
            collectionChanging = false
            sync()
        case "SceneCreated", "SceneRemoved", "SceneNameChanged", "SceneListChanged",
             "InputCreated", "InputRemoved", "InputNameChanged", "StudioModeStateChanged":
            if !collectionChanging { sync() }
        case "CurrentProgramSceneChanged", "CurrentPreviewSceneChanged", "StreamStateChanged", "RecordStateChanged":
            if var current = state {
                Self.apply(type, fields: fields, to: &current)
                state = current
            } else if !collectionChanging {
                // Retain the latest event per field while fetching the initial snapshot.
                bufferedEvents.removeAll { $0.0 == type }
                bufferedEvents.append((type, fields))
            }
        default: break
        }
    }

    private static func apply(_ type: String, fields: OBSWebSocket.Fields, to state: inout State) {
        switch type {
        case "CurrentProgramSceneChanged":
            state.program = Target(fields: fields, kind: "scene")
        case "CurrentPreviewSceneChanged":
            state.preview = Target(fields: fields, kind: "scene")
        case "StreamStateChanged":
            state.streaming = fields["outputActive"] as? Bool ?? state.streaming
            state.streamReconnecting = fields["outputState"] as? String == "OBS_WEBSOCKET_OUTPUT_RECONNECTING"
        case "RecordStateChanged":
            state.recording = fields["outputActive"] as? Bool ?? state.recording
        default: break
        }
    }
}
