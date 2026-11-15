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

    enum ReplaySave: Equatable {
        case ready, saving, saved, unconfirmed

        var label: String {
            switch self {
            case .ready: return "Save Replay"
            case .saving: return "Saving replay…"
            case .saved: return "Replay saved"
            case .unconfirmed: return "Replay not confirmed"
            }
        }
    }

    enum Output: String, CaseIterable {
        case stream, record

        var statusRequest: String { self == .stream ? "GetStreamStatus" : "GetRecordStatus" }
        var savedID: String { "obs.output." + rawValue }
        var name: String { self == .stream ? "Stream" : "Recording" }

        static func command(_ id: String) -> (Output, UUID)? {
            for output in allCases {
                let prefix = output.savedID + "."
                guard id.hasPrefix(prefix) else { continue }
                if let token = UUID(uuidString: String(id.dropFirst(prefix.count))),
                   id == prefix + token.uuidString.lowercased() { return (output, token) }
            }
            return nil
        }
    }

    struct AdaptiveScene {
        static let prefix = "obs.target."

        static func command(_ id: String) -> (UUID, UUID)? {
            guard id.hasPrefix(prefix) else { return nil }
            let parts = id.dropFirst(prefix.count).split(separator: ".", omittingEmptySubsequences: false)
            guard parts.count == 2, let scene = UUID(uuidString: String(parts[0])),
                  let token = UUID(uuidString: String(parts[1])),
                  id == prefix + scene.uuidString.lowercased() + "." + token.uuidString.lowercased()
            else { return nil }
            return (scene, token)
        }
    }

    static let studioModeID = "obs.studio"
    static let transitionID = "obs.transition"

    static func controlToken(_ action: String, for id: String) -> UUID? {
        let prefix = id + "."
        guard action.hasPrefix(prefix), let token = UUID(uuidString: String(action.dropFirst(prefix.count))),
              action == prefix + token.uuidString.lowercased() else { return nil }
        return token
    }

    struct BreakConfiguration: Codable, Equatable {
        var sceneID: String
        var micID: String?
    }

    struct BreakCard: Equatable {
        let label: String
        let programID: String?
        let token: UUID?

        var actionID: String { token.map { "obs.brb." + $0.uuidString.lowercased() } ?? "obs.brb" }

        static func token(for id: String) -> UUID? {
            let prefix = "obs.brb."
            guard id.hasPrefix(prefix), let token = UUID(uuidString: String(id.dropFirst(prefix.count))),
                  id == prefix + token.uuidString.lowercased() else { return nil }
            return token
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
        var inputFaders: [String: Int] = [:]
        var recordingPaused = false
        var recordingStopping = false
        var replayBufferActive = false
        var replaySave = ReplaySave.ready
        var transitionInProgress = false
        var selectedTransition: String?
        var transitionToken = UUID()
        var takeToken = UUID()
        var adaptiveSceneToken = UUID()
        var breakCard: BreakCard?
        var breakSceneID: String?
        var outputTokens: [Output: UUID] = [.stream: UUID(), .record: UUID()]
        var outputsTransitioning: Set<Output> = []
        var outputsPending: Set<Output> = []

        func outputActive(_ output: Output) -> Bool { output == .stream ? streaming : recording }

        func outputControlReady(_ output: Output) -> Bool {
            !outputsTransitioning.contains(output) && !outputsPending.contains(output) &&
                (output != .stream || !streamReconnecting)
        }

        var streamStatus: String {
            if streamReconnecting { return "Stream · Reconnecting" }
            if outputsTransitioning.contains(.stream) || outputsPending.contains(.stream) {
                return "Stream · Changing"
            }
            return streaming ? "Stream · Live" : "Stream · Idle"
        }

        var recordStatus: String {
            if outputsTransitioning.contains(.record) || outputsPending.contains(.record) {
                return "Recording · Changing"
            }
            if recordingPaused { return "Recording · Paused" }
            return recording ? "Recording · Active" : "Recording · Idle"
        }

        var canTakePreview: Bool {
            studioMode && !transitionInProgress && preview != nil && preview?.id != program?.id
        }

        mutating func setSelectedTransition(_ name: String?) {
            guard selectedTransition != name else { return }
            selectedTransition = name
            transitionToken = UUID()
        }
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

    static func productionActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        var actions = [
            (id: "obs.status.program", label: "Program · " + (state.program?.name ?? "Unknown")),
            (id: "obs.status.stream", label: state.streamStatus),
            (id: "obs.status.record", label: state.recordStatus),
            (id: state.transitionInProgress ? studioModeID : studioModeID + "." + state.adaptiveSceneToken.uuidString.lowercased(),
             label: state.studioMode ? "On" : "Off"),
        ]
        if state.canTakePreview, let preview = state.preview {
            actions.append((id: "obs.take." + state.takeToken.uuidString.lowercased(),
                            label: "Take Live · " + preview.name))
        }
        if state.replayBufferActive {
            actions.append((id: "obs.replay", label: state.replaySave.label))
        }
        return actions
    }

    static func controlActions(_ state: State?) -> [(id: String, label: String)] {
        var actions = productionActions(state) + sceneActions(state) + audioActions(state) + faderActions(state) + coughActions(state) + outputActions(state) + adaptiveSceneActions(state) +
            selectedSceneActions(state) +
            unavailableTakeAction(state) +
            (state?.breakCard.map { [($0.actionID, $0.label)] } ?? []) +
            (state?.breakSceneID.map { [("obs.brb.scene." + $0, "Configured BRB scene")] } ?? [])
        if state?.recording == true || state?.recordingStopping == true {
            actions.append(("obs.record.active", "Recording"))
        }
        if state?.recordingStopping == true { actions.append((Output.record.savedID, "Stopping")) }
        if let state, let name = state.selectedTransition {
            let id = state.transitionInProgress ? transitionID : transitionID + "." + state.transitionToken.uuidString.lowercased()
            actions.append((id, name))
        }
        return actions
    }

    private static func unavailableTakeAction(_ state: State?) -> [(id: String, label: String)] {
        guard let state, !state.canTakePreview else { return [] }
        let reason: String
        if !state.studioMode { reason = "Enable Studio Mode" }
        else if state.transitionInProgress { reason = "Transitioning" }
        else if state.preview == nil { reason = "Choose a preview" }
        else { reason = "Already on Program" }
        return [("obs.take", "Take Live · " + reason)]
    }

    private static func selectedSceneActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state, let selected = state.studioMode ? state.preview : state.program,
              let sceneID = UUID(uuidString: selected.id) else { return [] }
        return [(id: "obs.selected." + sceneID.uuidString.lowercased(), label: "Selected OBS scene")]
    }

    static func outputActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        return Output.allCases.compactMap { output in
            guard state.outputControlReady(output), let token = state.outputTokens[output] else { return nil }
            let verb = state.outputActive(output) ? "Stop " : "Start "
            return (output.savedID + "." + token.uuidString.lowercased(), verb + output.name)
        }
    }

    static func sceneActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        return state.scenes.prefix(40).compactMap { scene in
            guard let target = UUID(uuidString: scene.id) else { return nil }
            let action: SceneAction = state.studioMode ? .preview(target) : .program(target)
            return (action.id, scene.name)
        }
    }

    private static func adaptiveSceneActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        let token = state.adaptiveSceneToken.uuidString.lowercased()
        return sceneActions(state).compactMap { action in
            guard let uuid = action.id.split(separator: ".").last else { return nil }
            return (AdaptiveScene.prefix + uuid + "." + token, action.label)
        }
    }

    func performAdaptiveScene(_ sceneID: UUID, token: UUID, isValid: () -> Bool) async -> Bool {
        guard isValid(), !breakInFlight, !changingStudioMode, let shown = state, shown.adaptiveSceneToken == token,
              let scene = shown.scenes.first(where: { UUID(uuidString: $0.id) == sceneID }) else { return false }
        let active = generation
        let mode = try? await snapshotRequest("GetStudioModeEnabled", generation: active)
        guard isValid(), active == generation, !breakInFlight, !changingStudioMode, state?.adaptiveSceneToken == token,
              mode?["studioModeEnabled"] as? Bool == shown.studioMode else { return false }
        return await selectScene(id: scene.id, collection: shown.collection, expectedStudioMode: shown.studioMode)
    }

    func performSceneAction(_ action: SceneAction) async -> Bool {
        guard !breakInFlight, let state else { return false }
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

    nonisolated static func faderInputUUID(for controlID: String) -> UUID? {
        audioInputUUID(for: controlID, prefix: "obs.level.")
    }

    nonisolated static func coughInputUUID(for controlID: String) -> UUID? {
        audioInputUUID(for: controlID, prefix: "obs.cough.")
    }

    private nonisolated static func audioInputUUID(for controlID: String, prefix: String) -> UUID? {
        guard controlID.hasPrefix(prefix),
              let uuid = UUID(uuidString: String(controlID.dropFirst(prefix.count))),
              controlID == prefix + uuid.uuidString.lowercased() else { return nil }
        return uuid
    }

    nonisolated static func faderDecibels(_ value: Int) -> Double {
        value <= 80 ? Double(value - 80) * 1.25 : Double(value - 80) * 1.3
    }

    static func faderPosition(_ fields: OBSWebSocket.Fields) -> Int? {
        if let gain = fields["inputVolumeMul"] as? Double, gain == 0 { return 0 }
        guard let db = fields["inputVolumeDb"] as? Double, db.isFinite else { return nil }
        let scaled = 80 + min(26, max(-100, db)) / (db <= 0 ? 1.25 : 1.3)
        return min(100, max(1, Int(scaled.rounded())))
    }

    static func faderActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        return state.inputs.compactMap { input in
            guard state.inputFaders[input.id] != nil, let uuid = UUID(uuidString: input.id) else { return nil }
            return ("obs.level." + uuid.uuidString.lowercased(), input.name)
        }
    }

    static func faderValues(_ state: State?) -> [String: Int] {
        var values: [String: Int] = [:]
        for (id, value) in state?.inputFaders ?? [:] {
            guard let uuid = UUID(uuidString: id) else { continue }
            values["obs.level." + uuid.uuidString.lowercased()] = value
        }
        return values
    }

    private static func coughActions(_ state: State?) -> [(id: String, label: String)] {
        guard let state else { return [] }
        return state.inputs.compactMap { input in
            guard state.inputMutes[input.id] != nil, let uuid = UUID(uuidString: input.id) else { return nil }
            return ("obs.cough." + uuid.uuidString.lowercased(), input.name)
        }
    }

    static func audioValues(_ state: State?) -> [String: Int] {
        var values = faderValues(state)
        for (id, muted) in state?.inputMutes ?? [:] {
            guard let uuid = UUID(uuidString: id) else { continue }
            values["obs.cough." + uuid.uuidString.lowercased()] = muted ? 100 : 0
        }
        return values
    }

    func setFader(controlID: String, value: Int) async -> Bool {
        guard (0...100).contains(value), let uuid = Self.faderInputUUID(for: controlID),
              let state, let target = state.inputs.first(where: { UUID(uuidString: $0.id) == uuid }),
              state.inputFaders[target.id] != nil,
              pendingFaderCommands.insert(uuid).inserted else { return false }
        defer { pendingFaderCommands.remove(uuid) }
        let active = generation
        var fields: OBSWebSocket.Fields = ["inputUuid": target.id]
        if value == 0 {
            fields["inputVolumeMul"] = 0.0
        } else {
            fields["inputVolumeDb"] = Self.faderDecibels(value)
        }
        // Use only OBS volume operations; a muted input stays muted at every level.
        let accepted = await command("SetInputVolume", fields: fields)
        guard active == generation else { return false }
        let confirmed = try? await socket.request("GetInputVolume", fields: ["inputUuid": target.id])
        guard active == generation, var current = self.state else { return false }
        current.inputFaders[target.id] = confirmed.flatMap(Self.faderPosition)
        self.state = current
        return accepted && current.inputFaders[target.id] != nil
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
        static let breakConfigurations = "obs.breakConfigurations"
        static let breakRecovery = "obs.breakRecovery"
        static let credentialService = "io.espdesktop.app.obs"
        static let credentialAccount = "local-websocket"
    }

    @Published private(set) var status: Status = .off
    @Published private(set) var state: State?
    @Published private(set) var port: UInt16
    @Published private(set) var enabled: Bool
    @Published private(set) var breakNeedsReview = false

    private struct BreakSession {
        let collection: String
        let original: String
        let target: String
        let mic: String?
        var returning = false
        var needsUnmute = false
        var sawMute = false
        var expectedMute: Bool?
        var expectedProgram: String?
    }

    private var breakConfigurations: [String: BreakConfiguration]
    private var breakSession: BreakSession?
    private var breakInFlight = false

    private let socket: any OBSWebSocketTransport
    private let defaults: UserDefaults
    private var reconnectTask: Task<Void, Never>?
    private var syncTask: Task<Void, Never>?
    private var generation = UUID()
    private var collectionChanging = false
    private var outputCommands: Set<Output> = []
    private var pendingMuteCommands = Set<UUID>()
    private struct CoughHold {
        let session: ObjectIdentifier
        var lastTouch: ContinuousClock.Instant
        var wasMuted = false
        var settingMute = false
        var sawMute = false
        var restore = false
    }
    private var coughHolds: [UUID: CoughHold] = [:]
    private let coughTouchTimeout: Duration
    private var takingPreview = false
    private var changingStudioMode = false
    private var cyclingTransition = false
    private var transitionProbe: Task<Void, Never>?
    private let transitionProbeInterval: Duration
    private struct PendingReplay {
        var accepted = false
        var saved = false
    }
    private var pendingReplay: PendingReplay?
    private var replayDeadline: Task<Void, Never>?
    private var bufferedMutes: [String: Bool] = [:]
    private var bufferedFaders: [String: Int] = [:]
    private var pendingFaderCommands = Set<UUID>()
    private var bufferedEvents: [(String, OBSWebSocket.Fields)] = []

    init(defaults: UserDefaults = .standard, socket: any OBSWebSocketTransport = OBSWebSocket(),
         transitionProbeInterval: Duration = .seconds(1),
         coughTouchTimeout: Duration = .seconds(1)) {
        self.defaults = defaults
        breakConfigurations = (try? JSONDecoder().decode([String: BreakConfiguration].self,
            from: defaults.data(forKey: Keys.breakConfigurations) ?? Data())) ?? [:]
        self.socket = socket
        self.transitionProbeInterval = transitionProbeInterval
        self.coughTouchTimeout = coughTouchTimeout
        breakNeedsReview = defaults.bool(forKey: Keys.breakRecovery)
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
        socket.close(nil)
        status = .off
    }

    func selectScene(id: String, collection: String, expectedStudioMode: Bool) async -> Bool {
        guard !changingStudioMode, !cyclingTransition, let state, state.collection == collection, state.studioMode == expectedStudioMode,
              state.scenes.contains(where: { $0.id == id }) else { return false }
        return await command(expectedStudioMode ? "SetCurrentPreviewScene" : "SetCurrentProgramScene",
                             fields: ["sceneUuid": id])
    }

    func takeLive(token: UUID) async -> Bool {
        guard !breakInFlight, !changingStudioMode, !cyclingTransition, let state, state.canTakePreview, state.takeToken == token,
              let expectedPreview = state.preview?.id, !takingPreview else { return false }
        takingPreview = true
        defer { takingPreview = false }
        let active = generation
        guard let cursor = try? await snapshotRequest("GetCurrentSceneTransitionCursor", generation: active),
              cursor["transitionCursor"] as? Double == 1,
              let preview = try? await snapshotRequest("GetCurrentPreviewScene", generation: active),
              preview["sceneUuid"] as? String == expectedPreview,
              active == generation, let current = self.state,
              current.canTakePreview, current.takeToken == token else { return false }
        return await command("TriggerStudioModeTransition", fields: [:])
    }

    func toggleStudioMode(token: UUID, isValid: () -> Bool) async -> Bool {
        guard isValid(), !changingStudioMode, !cyclingTransition, !takingPreview, !breakInFlight, let shown = state,
              !shown.transitionInProgress, shown.adaptiveSceneToken == token else { return false }
        changingStudioMode = true
        defer { changingStudioMode = false }
        let active = generation
        let fresh = try? await snapshotRequest("GetStudioModeEnabled", generation: active)
        guard isValid(), active == generation, state?.transitionInProgress == false,
              state?.adaptiveSceneToken == token, let enabled = fresh?["studioModeEnabled"] as? Bool else { return false }
        guard enabled == shown.studioMode else {
            sync()
            return false
        }
        do {
            _ = try await socket.request("SetStudioModeEnabled", fields: ["studioModeEnabled": !enabled])
        } catch {
            if active == generation { sync() }
            return false
        }
        // OBS may already have sent StudioModeStateChanged before its response.
        if active == generation { sync() }
        return true
    }

    func cycleTransition(token: UUID, isValid: () -> Bool) async -> Bool {
        guard isValid(), !cyclingTransition, !takingPreview, !changingStudioMode, !breakInFlight,
              let shown = state, !shown.transitionInProgress, shown.transitionToken == token,
              let selected = shown.selectedTransition else { return false }
        cyclingTransition = true
        defer { cyclingTransition = false }
        let active = generation
        guard let cursor = try? await snapshotRequest("GetCurrentSceneTransitionCursor", generation: active),
              cursor["transitionCursor"] as? Double == 1,
              let transitions = try? await snapshotRequest("GetSceneTransitionList", generation: active),
              active == generation, var current = state, current.transitionToken == token else { return false }
        let actual = transitions["currentSceneTransitionName"] as? String
        guard actual == selected else {
            current.setSelectedTransition(actual)
            state = current
            return false
        }
        guard isValid(), !current.transitionInProgress,
              let entries = transitions["transitions"] as? [OBSWebSocket.Fields] else { return false }
        let names = entries.compactMap { $0["transitionName"] as? String }.filter { !$0.isEmpty }
        // OBS changes transitions by name. Skip names that would select an ambiguous target.
        let counts = Dictionary(grouping: names, by: { $0 })
        let choices = names.filter { counts[$0]?.count == 1 }
        guard choices.count > 1, let index = choices.firstIndex(of: selected) else { return false }
        let next = choices[(index + 1) % choices.count]
        let accepted = await command("SetCurrentSceneTransition", fields: ["transitionName": next])
        guard let confirmed = try? await snapshotRequest("GetCurrentSceneTransition", generation: active),
              active == generation, var latest = state else { return false }
        let confirmedName = confirmed["transitionName"] as? String
        latest.setSelectedTransition(confirmedName)
        state = latest
        return accepted && confirmedName == next
    }

    func performOutput(_ output: Output, token: UUID, isValid: () -> Bool = { true }) async -> Bool {
        guard isValid(), let shown = state, shown.outputControlReady(output), shown.outputTokens[output] == token,
              outputCommands.insert(output).inserted else { return false }
        defer { outputCommands.remove(output) }
        let active = generation
        let previous = shown.outputActive(output)
        let fresh = try? await snapshotRequest(output.statusRequest, generation: active)
        guard isValid(), let fresh, active == generation, var current = state,
              current.outputTokens[output] == token, current.outputControlReady(output) else { return false }
        // Refresh the tile even when the event for a changed output wasn't delivered.
        refreshOutput(output, fields: fresh, state: &current)
        guard fresh["outputActive"] is Bool, current.outputActive(output) == previous,
              current.outputControlReady(output), current.outputTokens[output] == token,
              fresh[output == .stream ? "outputReconnecting" : "outputPaused"] is Bool else {
            state = current
            return false
        }
        let request = switch (output, previous) {
        case (.stream, false): "StartStream"
        case (.stream, true): "StopStream"
        case (.record, false): "StartRecord"
        case (.record, true): "StopRecord"
        }
        current.outputsPending.insert(output)
        if output == .record { current.recordingStopping = previous }
        current.outputTokens[output] = UUID()
        state = current
        let accepted = await command(request, fields: [:])
        guard active == generation else { return false }

        for _ in 0..<20 {
            guard let confirmed = try? await snapshotRequest(output.statusRequest, generation: active),
                  active == generation, var latest = state else { break }
            refreshOutput(output, fields: confirmed, state: &latest)
            if confirmed["outputActive"] as? Bool != nil, !latest.outputsTransitioning.contains(output),
               (latest.outputActive(output) != previous || !accepted),
               (output != .stream || !latest.streamReconnecting) {
                latest.outputsPending.remove(output)
                if output == .record { latest.recordingStopping = false }
                state = latest
                return accepted && latest.outputActive(output) != previous
            }
            state = latest
            do { try await Task.sleep(for: .milliseconds(250)) } catch { break }
        }

        if active == generation { sync() }
        return false
    }

    private func refreshOutput(_ output: Output, fields: OBSWebSocket.Fields, state: inout State) {
        guard let reportedActive = fields["outputActive"] as? Bool else { return }
        let before = state.outputActive(output)
        let beforeDetail = output == .stream ? state.streamReconnecting : state.recordingPaused
        let reportedDetail = (output == .stream ? fields["outputReconnecting"] : fields["outputPaused"]) as? Bool
        let detail = reportedDetail ?? (output == .stream || reportedActive ? beforeDetail : false)
        if output == .stream {
            state.streaming = reportedActive
            state.streamReconnecting = detail
        } else {
            state.recording = reportedActive || detail
            state.recordingPaused = detail
        }
        if before != state.outputActive(output) || beforeDetail != detail { state.outputTokens[output] = UUID() }
    }

    var breakConfiguration: BreakConfiguration? {
        state.flatMap { breakConfigurations[$0.collection] }
    }

    var canConfigureBreak: Bool { !breakInFlight && breakSession == nil }

    func configureBreak(sceneID: String, micID: String?) {
        guard canConfigureBreak, var snapshot = state else { return }
        breakConfigurations[snapshot.collection] = sceneID.isEmpty && micID == nil ? nil
            : BreakConfiguration(sceneID: sceneID, micID: micID)
        if let data = try? JSONEncoder().encode(breakConfigurations) {
            defaults.set(data, forKey: Keys.breakConfigurations)
        }
        snapshot.breakCard = nil
        updateBreakCard(&snapshot)
        state = snapshot
    }

    func acknowledgeBreakReview() {
        guard !breakInFlight, var snapshot = state else { return }
        breakNeedsReview = false
        defaults.removeObject(forKey: Keys.breakRecovery)
        updateBreakCard(&snapshot)
        state = snapshot
    }

    private func updateBreakCard(_ snapshot: inout State) {
        let label: String
        let configured = breakConfigurations[snapshot.collection]
        snapshot.breakSceneID = configured.flatMap { config in
            snapshot.scenes.contains(where: { $0.id == config.sceneID }) ? config.sceneID.lowercased() : nil
        }
        var enabled = false
        if breakNeedsReview {
            label = "BRB · Check OBS"
        } else if breakInFlight {
            label = breakSession?.returning == true ? "Resuming…" : "Starting BRB…"
        } else if let session = breakSession {
            enabled = !snapshot.transitionInProgress && snapshot.program?.id == session.target
            label = enabled ? "Resume" : "Resume · Transitioning"
        } else {
            guard let configured,
                  let target = snapshot.scenes.first(where: { $0.id == configured.sceneID }) else {
                snapshot.breakCard = nil
                return
            }
            enabled = !snapshot.transitionInProgress && snapshot.program != nil && snapshot.program?.id != target.id &&
                (configured.micID == nil || configured.micID.map { snapshot.inputMutes[$0] != nil } == true)
            if enabled { label = "BRB · " + target.name }
            else if snapshot.transitionInProgress { label = "BRB · Transitioning" }
            else if snapshot.program?.id == target.id { label = "BRB · Already on break" }
            else { label = "BRB · Unavailable" }
        }
        let program = snapshot.program?.id
        let previous = snapshot.breakCard
        let token = enabled ? (previous?.label == label && previous?.programID == program ? previous?.token : nil) ?? UUID() : nil
        snapshot.breakCard = BreakCard(label: label, programID: program, token: token)
    }

    private func refreshBreakCard() {
        guard var snapshot = state else { return }
        updateBreakCard(&snapshot)
        if snapshot != state { state = snapshot }
    }

    private func abandonBreak() {
        if breakSession != nil { breakNeedsReview = true }
        breakSession = nil
    }

    func performBreak(token: UUID, isValid: () -> Bool = { true }) async -> Bool {
        guard isValid(), !breakInFlight, !takingPreview, !changingStudioMode, !cyclingTransition, let shown = state, shown.breakCard?.token == token,
              !shown.transitionInProgress, let program = shown.program?.id else { return false }

        let returning = breakSession != nil
        var transaction: BreakSession
        if let current = breakSession {
            guard current.collection == shown.collection, program == current.target,
                  shown.scenes.contains(where: { $0.id == current.original }) else { return false }
            transaction = current
            transaction.returning = true
        } else {
            guard let configured = breakConfigurations[shown.collection],
                  configured.sceneID != program,
                  shown.scenes.contains(where: { $0.id == configured.sceneID }) else { return false }
            transaction = BreakSession(collection: shown.collection, original: program,
                                       target: configured.sceneID, mic: configured.micID)
        }

        let micUUID = transaction.mic.flatMap(UUID.init(uuidString:))
        if let micUUID {
            guard coughHolds[micUUID].map({ $0.lastTouch.duration(to: .now) < coughTouchTimeout }) != true,
                  pendingMuteCommands.insert(micUUID).inserted else { return false }
        }
        breakSession = transaction
        defaults.set(true, forKey: Keys.breakRecovery)
        breakInFlight = true
        refreshBreakCard()
        var succeeded = false
        defer {
            if let micUUID { pendingMuteCommands.remove(micUUID) }
            if !succeeded { abandonBreak() }
            breakInFlight = false
            refreshBreakCard()
        }

        let active = generation
        func stillValid() -> Bool {
            isValid() && generation == active && breakSession != nil && state?.collection == transaction.collection
        }
        func programMatches(_ id: String) async -> Bool {
            let reply = try? await snapshotRequest("GetCurrentProgramScene", generation: active)
            return stillValid() && reply?["sceneUuid"] as? String == id
        }

        guard await programMatches(program) else { return false }
        if let mic = transaction.mic {
            guard let muted = await micMute(id: mic, collection: transaction.collection),
                  stillValid() else { return false }
            if returning {
                guard muted else { return false }
            } else if !muted {
                breakSession?.needsUnmute = true
                breakSession?.expectedMute = true
                guard await setMicMute(id: mic, collection: transaction.collection, muted: true),
                      stillValid(),
                      await micMute(id: mic, collection: transaction.collection) == true,
                      stillValid() else { return false }
                publishConfirmedMute(true, for: mic)
            }
        }

        let destination = returning ? transaction.original : transaction.target
        if let mic = transaction.mic {
            guard await micMute(id: mic, collection: transaction.collection) == true, stillValid() else { return false }
        }
        guard await programMatches(program), state?.transitionInProgress != true else { return false }
        breakSession?.expectedProgram = destination
        guard await command("SetCurrentProgramScene", fields: ["sceneUuid": destination]),
              stillValid() else { return false }
        // OBS can acknowledge before a transition reaches Program.
        var switched = false
        for _ in 0..<24 {
            if await programMatches(destination), state?.transitionInProgress != true {
                switched = true
                break
            }
            guard stillValid() else { return false }
            do { try await Task.sleep(for: .milliseconds(150)) } catch { return false }
        }
        guard switched, stillValid() else { return false }
        if var snapshot = state, let scene = snapshot.scenes.first(where: { $0.id == destination }) {
            snapshot.program = scene
            state = snapshot
        }
        if returning {
            if transaction.needsUnmute {
                guard let mic = transaction.mic, transaction.sawMute,
                      await micMute(id: mic, collection: transaction.collection) == true,
                      await programMatches(destination), stillValid() else { return false }
                breakSession?.expectedMute = false
                guard await setMicMute(id: mic, collection: transaction.collection, muted: false),
                      stillValid(), await micMute(id: mic, collection: transaction.collection) == false,
                      stillValid() else { return false }
                publishConfirmedMute(false, for: mic)
            }
            breakSession = nil
            defaults.removeObject(forKey: Keys.breakRecovery)
        }
        succeeded = true
        return true
    }

    func saveReplay() async -> Bool {
        guard var current = state, current.replayBufferActive, pendingReplay == nil else { return false }
        let active = generation
        pendingReplay = PendingReplay()
        current.replaySave = .saving
        state = current
        let accepted = await command("SaveReplayBuffer", fields: [:])
        guard active == generation, pendingReplay != nil else { return false }
        guard accepted else {
            finishReplay(.unconfirmed)
            return false
        }
        pendingReplay?.accepted = true
        if pendingReplay?.saved == true {
            finishReplay(.saved)
        } else {
            replayDeadline = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(8)) } catch { return }
                guard let self, active == generation, pendingReplay != nil else { return }
                finishReplay(.unconfirmed)
            }
        }
        return true
    }

    private func finishReplay(_ result: ReplaySave) {
        pendingReplay = nil
        replayDeadline?.cancel()
        replayDeadline = nil
        if var current = state {
            current.replaySave = result
            state = current
        }
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

    func abandonCoughHolds(from session: ObjectIdentifier? = nil) {
        if let session { coughHolds = coughHolds.filter { $0.value.session != session } }
        else { coughHolds.removeAll() }
    }

    func setCough(_ value: Int, controlID: String, from session: ObjectIdentifier) async -> Bool {
        guard let uuid = Self.coughInputUUID(for: controlID), let state,
              let input = state.inputs.first(where: { UUID(uuidString: $0.id) == uuid }),
              state.inputMutes[input.id] != nil else { return false }
        let now = ContinuousClock.now
        coughHolds = coughHolds.filter { $0.value.lastTouch.duration(to: now) < coughTouchTimeout }
        if value == 50 {
            guard var hold = coughHolds[uuid], hold.session == session else { return false }
            hold.lastTouch = now
            coughHolds[uuid] = hold
            return true
        }
        guard value == 0 || value == 100, pendingMuteCommands.insert(uuid).inserted else { return false }
        defer { pendingMuteCommands.remove(uuid) }
        let active = generation
        let collection = state.collection
        if value == 100 {
            guard coughHolds[uuid] == nil else { return false }
            coughHolds[uuid] = CoughHold(session: session, lastTouch: now)
            guard let muted = await micMute(id: input.id, collection: collection),
                  active == generation, var hold = coughHolds[uuid], hold.session == session else {
                coughHolds.removeValue(forKey: uuid)
                return false
            }
            if muted {
                hold.wasMuted = true
                coughHolds[uuid] = hold
                publishConfirmedMute(true, for: input.id)
                return true
            }
            hold.settingMute = true
            coughHolds[uuid] = hold
            let accepted = await setMicMute(id: input.id, collection: collection, muted: true)
            let confirmed = await micMute(id: input.id, collection: collection)
            guard active == generation, var updated = coughHolds[uuid], updated.session == session else { return false }
            publishConfirmedMute(confirmed, for: input.id)
            guard confirmed == true else {
                coughHolds.removeValue(forKey: uuid)
                return false
            }
            updated.settingMute = false
            updated.restore = accepted && updated.sawMute
            coughHolds[uuid] = updated
            return true
        }

        guard let hold = coughHolds[uuid], hold.session == session else { return false }
        defer { coughHolds.removeValue(forKey: uuid) }
        if hold.wasMuted { return true }
        guard hold.restore else { return false }
        guard await micMute(id: input.id, collection: collection) == true,
              active == generation, let currentHold = coughHolds[uuid],
              currentHold.session == session, currentHold.restore,
              currentHold.lastTouch.duration(to: .now) < coughTouchTimeout else { return false }
        let accepted = await setMicMute(id: input.id, collection: collection, muted: false)
        let confirmed = await micMute(id: input.id, collection: collection)
        guard active == generation else { return false }
        publishConfirmedMute(confirmed, for: input.id)
        return accepted && confirmed == false
    }

    private func publishConfirmedMute(_ muted: Bool?, for id: String) {
        guard let muted, var current = state, current.inputMutes[id] != muted else { return }
        current.inputMutes[id] = muted
        state = current
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
        abandonBreak()
        abandonCoughHolds()
        generation = UUID()
        syncTask?.cancel()
        syncTask = nil
        transitionProbe?.cancel()
        transitionProbe = nil
        bufferedEvents.removeAll()
        bufferedMutes.removeAll()
        bufferedFaders.removeAll()
        pendingReplay = nil
        replayDeadline?.cancel()
        replayDeadline = nil
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
                let replay = try? await snapshotRequest("GetReplayBufferStatus", generation: active)
                let transition = try? await snapshotRequest("GetCurrentSceneTransition", generation: active)
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
                var inputFaders: [String: Int] = [:]
                for input in inputTargets {
                    guard active == generation, !Task.isCancelled else { return }
                    do {
                        let result = try await socket.request("GetInputMute", fields: ["inputUuid": input.id])
                        inputMutes[input.id] = result["inputMuted"] as? Bool
                        guard active == generation, !Task.isCancelled else { return }
                        if inputMutes[input.id] != nil {
                            let level = try await socket.request("GetInputVolume", fields: ["inputUuid": input.id])
                            inputFaders[input.id] = Self.faderPosition(level)
                        }
                    } catch OBSWebSocket.Failure.requestRejected {
                        // Video-only inputs do not expose the OBS mixer mute operation.
                    }
                }
                guard active == generation else { return }
                for (id, muted) in bufferedMutes where inputMutes[id] != nil { inputMutes[id] = muted }
                bufferedMutes.removeAll()
                for (id, position) in bufferedFaders where inputFaders[id] != nil { inputFaders[id] = position }
                bufferedFaders.removeAll()
                let recordingPaused = record["outputPaused"] as? Bool ?? false
                var snapshot = State(
                    collection: collectionName,
                    scenes: sceneTargets,
                    inputs: inputTargets,
                    program: sceneTargets.first { $0.id == scenes["currentProgramSceneUuid"] as? String },
                    preview: sceneTargets.first { $0.id == scenes["currentPreviewSceneUuid"] as? String },
                    studioMode: studioMode,
                    streaming: streaming,
                    streamReconnecting: stream["outputReconnecting"] as? Bool ?? false,
                    recording: recording || recordingPaused,
                    inputMutes: inputMutes,
                    inputFaders: inputFaders,
                    recordingPaused: recordingPaused,
                    replayBufferActive: replay?["outputActive"] as? Bool ?? false,
                    selectedTransition: transition?["transitionName"] as? String
                )
                for (type, fields) in bufferedEvents { Self.apply(type, fields: fields, to: &snapshot) }
                bufferedEvents.removeAll()
                updateBreakCard(&snapshot)
                state = snapshot
                updateTransitionProbe()
                status = .connected
            } catch {
                guard active == generation else { return }
                socket.close(.disconnected)
            }
        }
    }

    private func snapshotRequest(_ name: String, generation active: UUID) async throws -> OBSWebSocket.Fields {
        guard active == generation, !Task.isCancelled else { throw CancellationError() }
        return try await socket.request(name, fields: [:])
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
            if breakSession?.mic == id {
                if breakSession?.expectedMute == muted {
                    breakSession?.expectedMute = nil
                    if muted { breakSession?.sawMute = true }
                } else {
                    abandonBreak()
                }
            }
            if let uuid = UUID(uuidString: id), var hold = coughHolds[uuid] {
                // One mute event may belong to our touch-down. Any other change
                // supersedes ownership, including an unmute followed by a mute.
                if hold.settingMute, muted, !hold.sawMute {
                    hold.sawMute = true
                    coughHolds[uuid] = hold
                } else {
                    coughHolds.removeValue(forKey: uuid)
                }
            }
            if var current = state, current.inputMutes[id] != nil {
                current.inputMutes[id] = muted
                updateBreakCard(&current)
                state = current
            } else if state == nil, !collectionChanging, bufferedMutes.count < 128 {
                bufferedMutes[id] = muted
            }
        case "InputVolumeChanged":
            guard let id = fields["inputUuid"] as? String, let position = Self.faderPosition(fields) else { return }
            if var current = state, current.inputFaders[id] != nil, current.inputFaders[id] != position {
                current.inputFaders[id] = position
                state = current
            } else if state == nil, !collectionChanging, bufferedFaders.count < 128 {
                bufferedFaders[id] = position
            }
        case "ReplayBufferSaved":
            // OBS sends a global event. Require an accepted request as well as
            // a confirmed saved file, and keep the file path local to OBS.
            guard pendingReplay != nil,
                  let path = fields["savedReplayPath"] as? String, !path.isEmpty else { return }
            pendingReplay?.saved = true
            if pendingReplay?.accepted == true { finishReplay(.saved) }
        case "CurrentProgramSceneChanged", "CurrentPreviewSceneChanged", "StreamStateChanged", "RecordStateChanged",
             "SceneTransitionStarted", "SceneTransitionEnded", "ReplayBufferStateChanged", "CurrentSceneTransitionChanged":
            if var current = state {
                if type == "CurrentProgramSceneChanged", let session = breakSession,
                   let incoming = Target(fields: fields, kind: "scene"), incoming.id != current.program?.id {
                    if session.expectedProgram == incoming.id { breakSession?.expectedProgram = nil }
                    else { abandonBreak() }
                }
                Self.apply(type, fields: fields, to: &current)
                updateBreakCard(&current)
                state = current
                if type == "SceneTransitionStarted" || type == "SceneTransitionEnded" { updateTransitionProbe() }
                if type == "ReplayBufferStateChanged", !current.replayBufferActive, pendingReplay != nil {
                    finishReplay(.ready)
                }
            } else if !collectionChanging {
                // Retain the latest event per field while fetching the initial snapshot.
                bufferedEvents.removeAll { previous in
                    previous.0 == type || (type.hasPrefix("SceneTransition") && previous.0.hasPrefix("SceneTransition"))
                }
                bufferedEvents.append((type, fields))
            }
        default: break
        }
    }

    private func updateTransitionProbe() {
        guard state?.transitionInProgress == true else {
            transitionProbe?.cancel()
            transitionProbe = nil
            return
        }
        guard transitionProbe == nil else { return }
        let active = generation
        let interval = transitionProbeInterval
        transitionProbe = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: interval) } catch { return }
                guard let self, let token = state?.takeToken, state?.transitionInProgress == true else { return }
                // OBS may omit SceneTransitionEnded when a transition is interrupted.
                let response = try? await snapshotRequest("GetCurrentSceneTransitionCursor", generation: active)
                guard !Task.isCancelled, active == generation else { return }
                if response?["transitionCursor"] as? Double == 1,
                   var current = state, current.takeToken == token {
                    transitionProbe = nil
                    current.transitionInProgress = false
                    updateBreakCard(&current)
                    state = current
                    return
                }
            }
        }
    }

    private static func recordOutputEvent(_ output: Output, fields: OBSWebSocket.Fields, state: inout State) {
        state.outputTokens[output] = UUID()
        switch fields["outputState"] as? String {
        case "OBS_WEBSOCKET_OUTPUT_STARTING", "OBS_WEBSOCKET_OUTPUT_STOPPING":
            state.outputsTransitioning.insert(output)
        default:
            state.outputsTransitioning.remove(output)
        }
    }

    private static func apply(_ type: String, fields: OBSWebSocket.Fields, to state: inout State) {
        switch type {
        case "CurrentSceneTransitionChanged":
            state.setSelectedTransition(fields["transitionName"] as? String)
        case "CurrentProgramSceneChanged":
            state.program = Target(fields: fields, kind: "scene")
        case "CurrentPreviewSceneChanged":
            let preview = Target(fields: fields, kind: "scene")
            if preview?.id != state.preview?.id { state.takeToken = UUID() }
            state.preview = preview
        case "StreamStateChanged":
            state.streaming = fields["outputActive"] as? Bool ?? state.streaming
            state.streamReconnecting = fields["outputState"] as? String == "OBS_WEBSOCKET_OUTPUT_RECONNECTING"
            recordOutputEvent(.stream, fields: fields, state: &state)
        case "RecordStateChanged":
            let outputState = fields["outputState"] as? String
            state.recordingStopping = outputState == "OBS_WEBSOCKET_OUTPUT_STOPPING" ||
                (state.recordingStopping && state.outputsPending.contains(.record))
            state.recordingPaused = outputState == "OBS_WEBSOCKET_OUTPUT_PAUSED"
            // OBS may report outputActive=false while paused, but the recording can still be stopped.
            state.recording = state.recordingPaused || outputState == "OBS_WEBSOCKET_OUTPUT_RESUMED" ||
                (fields["outputActive"] as? Bool ?? state.recording)
            recordOutputEvent(.record, fields: fields, state: &state)
        case "SceneTransitionStarted":
            state.transitionInProgress = true
            state.takeToken = UUID()
        case "SceneTransitionEnded":
            state.transitionInProgress = false
        case "ReplayBufferStateChanged":
            state.replayBufferActive = fields["outputActive"] as? Bool ?? state.replayBufferActive
            if !state.replayBufferActive { state.replaySave = .ready }
        default: break
        }
    }
}
