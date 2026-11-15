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
        var inputMutes: [String: Bool] = [:]
    }

    enum SceneAction: Equatable {
        case program(UUID)
        case preview(UUID)

        init?(id: String) {
            let prefix = id.hasPrefix("obs.scene.") ? "obs.scene." : "obs.preview."
            guard id.hasPrefix(prefix),
                  let target = UUID(uuidString: String(id.dropFirst(prefix.count))) else { return nil }
            self = prefix == "obs.scene." ? .program(target) : .preview(target)
        }

        var id: String {
            switch self {
            case .program(let target): return "obs.scene." + target.uuidString.lowercased()
            case .preview(let target): return "obs.preview." + target.uuidString.lowercased()
            }
        }
    }

    static func sceneActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        return state.scenes.prefix(40).compactMap { scene in
            guard let target = UUID(uuidString: scene.id) else { return nil }
            let action: SceneAction = state.studioMode ? .preview(target) : .program(target)
            let selected = state.studioMode ? state.preview?.id == scene.id : state.program?.id == scene.id
            let prefix = state.studioMode ? (selected ? "Preview · " : "Queue · ")
                : (selected ? (state.streaming && !state.streamReconnecting ? "On air · " : "Program · ") : "")
            return (action.id, prefix + scene.name)
        }
    }

    func performSceneAction(_ action: SceneAction) async -> Bool {
        guard let state else { return false }
        let target: UUID
        let expectedStudioMode: Bool
        switch action {
        case .program(let id): (target, expectedStudioMode) = (id, false)
        case .preview(let id): (target, expectedStudioMode) = (id, true)
        }
        guard let scene = state.scenes.first(where: { UUID(uuidString: $0.id) == target }) else { return false }
        return await selectScene(id: scene.id, collection: state.collection, expectedStudioMode: expectedStudioMode)
    }

    static func audioActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        return state.inputs.compactMap { input in
            guard let target = UUID(uuidString: input.id), let muted = state.inputMutes[input.id] else { return nil }
            return ("obs.mute." + target.uuidString.lowercased(),
                    (muted ? "Muted · " : "Unmuted · ") + input.name)
        }
    }

    func toggleMicMute(id: UUID) async -> Bool {
        guard let state,
              let target = state.inputs.first(where: { UUID(uuidString: $0.id) == id }),
              state.inputMutes[target.id] != nil,
              pendingMuteCommands.insert(id).inserted else { return false }
        defer { pendingMuteCommands.remove(id) }

        let active = generation
        guard let muted = await micMute(id: target.id, collection: state.collection),
              active == generation else { return false }
        let accepted = await setMicMute(id: target.id, collection: state.collection, muted: !muted)
        // Publish the confirmed state even if OBS does not send an event for the change.
        if active == generation,
           let confirmed = await micMute(id: target.id, collection: state.collection),
           active == generation, var current = self.state {
            current.inputMutes[target.id] = confirmed
            self.state = current
            return accepted && confirmed != muted
        }
        return false
    }

    static let legacyCredentialAccount = "obs.local-websocket"

    private enum Keys {
        static let enabled = "obs.enabled"
        static let port = "obs.port"
        static let credentialService = "io.espdesktop.app.obs"
        static let credentialAccount = "local-websocket"
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
    private var pendingMuteCommands = Set<UUID>()
    private var bufferedMutes: [String: Bool] = [:]
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
           !KeychainStore.save(Data(password.utf8), service: Keys.credentialService, account: Keys.credentialAccount) {
            stop()
            status = .keychainUnavailable
            return
        }

        if !password.isEmpty { removeLegacyPassword() }
        self.port = port
        defaults.set(Int(port), forKey: Keys.port)
        enabled = true
        defaults.set(true, forKey: Keys.enabled)
        connect()
    }

    func disable() {
        enabled = false
        defaults.set(false, forKey: Keys.enabled)
        KeychainStore.remove(service: Keys.credentialService, account: Keys.credentialAccount)
        removeLegacyPassword()
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
        let password = loadPassword().map { String(decoding: $0, as: UTF8.self) }
        socket.connect(port: port, password: password)
    }

    private func loadPassword() -> Data? {
        if let saved = KeychainStore.load(service: Keys.credentialService, account: Keys.credentialAccount) {
            return saved
        }
        guard let legacy = KeychainStore.load(service: KeychainStore.service, account: Self.legacyCredentialAccount) else {
            return nil
        }
        if KeychainStore.save(legacy, service: Keys.credentialService, account: Keys.credentialAccount) {
            removeLegacyPassword()
        }
        return legacy
    }

    private func removeLegacyPassword() {
        KeychainStore.remove(service: KeychainStore.service, account: Self.legacyCredentialAccount)
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
        bufferedMutes.removeAll()
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
                let inputTargets = Array(inputList.compactMap { Target(fields: $0, kind: "input") }.prefix(40))
                var inputMutes: [String: Bool] = [:]
                for input in inputTargets {
                    guard active == generation, !Task.isCancelled else { return }
                    do {
                        let result = try await socket.request("GetInputMute", fields: ["inputUuid": input.id])
                        inputMutes[input.id] = result["inputMuted"] as? Bool
                    } catch OBSWebSocket.Failure.requestRejected {
                        // Video-only inputs do not expose the OBS mixer mute operation.
                    }
                }
                guard active == generation else { return }
                for (id, muted) in bufferedMutes where inputMutes[id] != nil { inputMutes[id] = muted }
                bufferedMutes.removeAll()
                var snapshot = State(
                    collection: collectionName,
                    scenes: sceneTargets,
                    inputs: inputTargets,
                    program: sceneTargets.first { $0.id == scenes["currentProgramSceneUuid"] as? String },
                    preview: sceneTargets.first { $0.id == scenes["currentPreviewSceneUuid"] as? String },
                    studioMode: studioMode,
                    streaming: streaming,
                    streamReconnecting: stream["outputReconnecting"] as? Bool ?? false,
                    recording: recording,
                    inputMutes: inputMutes
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
        case "InputMuteStateChanged":
            guard let id = fields["inputUuid"] as? String,
                  let muted = fields["inputMuted"] as? Bool else { return }
            if var current = state, current.inputMutes[id] != nil {
                current.inputMutes[id] = muted
                state = current
            } else if state == nil, !collectionChanging, bufferedMutes.count < 128 {
                bufferedMutes[id] = muted
            }
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
