import AppKit
import Combine
import Foundation

enum TwitchControl: String, CaseIterable, Identifiable, Sendable {
    case status, details, marker, clip, commercial, pollStart, pollEnd
    case predictionStart, predictionLock, predictionCancel, predictionWinner
    case dashboard, inspector

    var id: String { "twitch." + rawValue }

    var title: String {
        switch self {
        case .status: "Twitch Status"
        case .details: "Apply Stream Details"
        case .marker: "Mark Moment"
        case .clip: "Clip That"
        case .commercial: "Run Ad"
        case .pollStart: "Start Poll"
        case .pollEnd: "End Poll"
        case .predictionStart: "Start Prediction"
        case .predictionLock: "Lock Prediction"
        case .predictionCancel: "Cancel Prediction"
        case .predictionWinner: "Resolve Prediction"
        case .dashboard: "Stream Manager"
        case .inspector: "Twitch Inspector"
        }
    }

    var scope: TwitchScope? {
        switch self {
        case .details, .marker: .broadcast
        case .clip: .clips
        case .commercial: .commercials
        case .pollStart, .pollEnd: .polls
        case .predictionStart, .predictionLock, .predictionCancel, .predictionWinner: .predictions
        default: nil
        }
    }
}

@MainActor
final class TwitchBroadcast: ObservableObject {
    enum ServiceState: Equatable {
        case disconnected, checking, offline, live, unavailable

        var title: String {
            switch self {
            case .disconnected: "Connect Twitch on Mac"
            case .checking: "Checking Twitch"
            case .offline: "Twitch Offline"
            case .live: "Twitch Live"
            case .unavailable: "Twitch Unavailable"
            }
        }
    }

    struct ControlState: Equatable, Identifiable {
        let control: TwitchControl
        let detail: String
        let enabled: Bool
        let active: Bool
        var id: String { control.id }
    }

    struct PanelControl: Equatable {
        let id: String
        let label: String
        let detail: String
        let active: Bool
        let enabled: Bool
        let command: String?
    }

    private struct CommandContext: Equatable {
        let account: UUID
        let configuration: TwitchBroadcastConfiguration
        let status: ServiceState
        let streamID: String?
        let poll: TwitchAPI.Poll?
        let prediction: TwitchAPI.Prediction?
    }

    private struct Credential: Codable, Sendable {
        let clientID: String
        let broadcasterID: String
        let accessToken: String
        let refreshToken: String
        let expiresAt: Date
    }

    @MainActor
    struct CredentialStore {
        let load: () -> Data?
        let save: (Data) -> Bool
        let remove: () -> Void

        static let keychain = Self(
            load: { KeychainStore.load(service: "io.espdesktop.twitch", account: "broadcaster") },
            save: { KeychainStore.save($0, service: "io.espdesktop.twitch", account: "broadcaster") },
            remove: { KeychainStore.remove(service: "io.espdesktop.twitch", account: "broadcaster") }
        )
    }

    private enum OperationError: Error { case disconnected, unavailable, clipPending, unexpectedAccount, keychain }
    private static let configurationKey = "twitch.broadcastConfiguration"
    private static let clientKey = "twitch.clientID"
    private static let inspector = URL(string: "https://inspector.twitch.tv/")!

    @Published var clientID: String {
        didSet { defaults.set(clientID, forKey: Self.clientKey) }
    }
    @Published var configuration: TwitchBroadcastConfiguration {
        didSet {
            if let data = try? JSONEncoder().encode(configuration) { defaults.set(data, forKey: Self.configurationKey) }
            publishControls()
        }
    }
    @Published private(set) var panelControls: [PanelControl] = []
    @Published private(set) var controls: [ControlState] = []
    @Published private(set) var userCode: String?
    @Published private(set) var verificationURL: URL?
    @Published private(set) var connecting = false
    @Published private(set) var status = ServiceState.disconnected
    @Published private(set) var identity: TwitchAPI.Identity?
    @Published private(set) var account: TwitchAPI.Account?
    @Published private(set) var channel: TwitchAPI.Channel?
    @Published private(set) var stream: TwitchAPI.Stream?
    @Published private(set) var poll: TwitchAPI.Poll?
    @Published private(set) var prediction: TwitchAPI.Prediction?
    @Published private(set) var lastClip: TwitchAPI.Clip?
    @Published private(set) var message = ""
    @Published private(set) var busy: TwitchControl?

    private let api: TwitchAPI
    private let defaults: UserDefaults
    private let credentialStore: CredentialStore
    private let monitorEvents: Bool
    private var credential: Credential?
    private var validatedAt: Date?
    private var authorizationTask: Task<Void, Never>?
    private var signInAttempt = UUID()
    private var pollTask: Task<Void, Never>?
    private var eventTask: Task<Void, Never>?
    private var refreshTask: Task<Void, Error>?
    private var snapshotTask: Task<Void, Never>?
    private var pendingSnapshot = false
    private var generation = UUID()
    private var commercialAvailableAt = Date.distantPast
    private var rateLimitedUntil = Date.distantPast
    private var feedback: [TwitchControl: String] = [:]
    private var mutationRevision = 0
    private var commandContext: CommandContext?
    private var commandToken = UUID().uuidString.lowercased()

    init(defaults: UserDefaults, api: TwitchAPI = TwitchAPI(), credentialStore: CredentialStore = .keychain,
         monitorEvents: Bool = true) {
        self.defaults = defaults
        self.api = api
        self.credentialStore = credentialStore
        self.monitorEvents = monitorEvents
        clientID = defaults.string(forKey: Self.clientKey)
            ?? Bundle.main.object(forInfoDictionaryKey: "EspDesktopTwitchClientID") as? String
            ?? ""
        configuration = defaults.data(forKey: Self.configurationKey).flatMap {
            try? JSONDecoder().decode(TwitchBroadcastConfiguration.self, from: $0)
        } ?? TwitchBroadcastConfiguration()
        if !clientID.isEmpty {
            credential = credentialStore.load()
                .flatMap { try? JSONDecoder().decode(Credential.self, from: $0) }
        }
        if credential != nil {
            status = .checking
            startMonitoring()
        }
        publishControls()
    }

    var canConnect: Bool {
        let client = clientID.trimmingCharacters(in: .whitespacesAndNewlines)
        return !connecting && client.range(of: #"^[a-zA-Z0-9]{10,64}$"#, options: .regularExpression) != nil
    }

    var needsAuthorizationUpdate: Bool {
        guard let identity else { return false }
        return configuration.scopes.contains { !identity.allows($0) }
    }

    var dashboardURL: URL {
        guard let login = identity?.login, login.range(of: #"^[a-zA-Z0-9_]+$"#, options: .regularExpression) != nil else {
            return URL(string: "https://dashboard.twitch.tv/")!
        }
        return URL(string: "https://dashboard.twitch.tv/u/\(login)/stream-manager")!
    }

    func connect() {
        guard canConnect else { return }
        let client = clientID.trimmingCharacters(in: .whitespacesAndNewlines)
        let scopes = configuration.scopes
        let attempt = UUID()
        signInAttempt = attempt
        connecting = true
        message = "Complete sign-in in your browser."
        authorizationTask = Task { [weak self] in
            guard let self else { return }
            defer {
                if self.signInAttempt == attempt {
                    self.connecting = false
                    self.userCode = nil
                    self.verificationURL = nil
                }
            }
            do {
                let code = try await api.startDeviceAuthorization(clientID: client, scopes: scopes)
                guard signInAttempt == attempt, !Task.isCancelled,
                      code.verificationUri.scheme == "https",
                      ["www.twitch.tv", "twitch.tv"].contains(code.verificationUri.host ?? "") else { return }
                userCode = code.userCode
                verificationURL = code.verificationUri
                let expires = Date().addingTimeInterval(Double(code.expiresIn))
                var interval = max(5, code.interval)
                while Date() < expires {
                    try await Task.sleep(for: .seconds(interval))
                    guard Date() < expires else { break }
                    do {
                        let tokens = try await api.exchangeDeviceCode(code.deviceCode, clientID: client, scopes: scopes)
                        let who = try await api.validate(tokens.accessToken)
                        guard signInAttempt == attempt, !Task.isCancelled else { return }
                        guard who.clientId == client, !who.userId.isEmpty else { throw OperationError.unexpectedAccount }
                        try save(tokens, identity: who)
                        restartMonitoring(identity: who)
                        message = "Connected to Twitch."
                        return
                    } catch let error as TwitchAPI.HTTPError where error.message == "authorization_pending" {
                        continue
                    } catch let error as TwitchAPI.HTTPError where error.message == "slow_down" {
                        interval += 5
                    }
                }
                message = "The sign-in code expired. Request a new code."
            } catch is CancellationError {
                return
            } catch {
                guard signInAttempt == attempt else { return }
                message = describe(error)
            }
        }
    }

    func cancelSignIn() {
        signInAttempt = UUID()
        authorizationTask?.cancel()
        authorizationTask = nil
        connecting = false
        userCode = nil
        verificationURL = nil
        message = ""
    }

    func disconnect() {
        let old = credential
        clear()
        message = "Disconnected from Twitch."
        if let old {
            let api = api
            Task { try? await api.revoke(old.accessToken, clientID: old.clientID) }
        }
    }

    func searchCategories(_ query: String) async throws -> [TwitchAPI.Category] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        let auth = try await authorization()
        return try await api.searchCategories(query, auth: auth)
    }

    func invoke(_ control: TwitchControl, winner: String? = nil,
                isValid: () -> Bool = { true }) async -> Bool {
        if control == .dashboard { return isValid() && NSWorkspace.shared.open(dashboardURL) }
        if control == .inspector { return isValid() && NSWorkspace.shared.open(Self.inspector) }
        guard busy == nil, controls.first(where: { $0.control == control })?.enabled == true else { return false }
        let active = generation
        let originalPrediction = prediction
        let originalPoll = poll
        let preset = configuration
        mutationRevision &+= 1
        busy = control
        feedback[control] = nil
        publishControls()
        defer {
            if active == generation {
                mutationRevision &+= 1
                busy = nil
                publishControls()
            }
        }
        do {
            let auth = try await authorization()
            guard active == generation, isValid(), !Task.isCancelled else { return false }
            guard configuration == preset else { throw OperationError.unavailable }
            let result = try await perform(control, winner: winner, originalPoll: originalPoll,
                                           originalPrediction: originalPrediction, preset: preset, auth: auth)
            guard active == generation else { return false }
            message = result
            feedback[control] = result
            return true
        } catch {
            guard active == generation else { return false }
            if let error = error as? TwitchAPI.HTTPError {
                if error.status == 401 { validatedAt = nil }
                if error.status == 429 {
                    rateLimitedUntil = error.retryAt.flatMap { $0 > Date() ? $0 : nil }
                        ?? Date().addingTimeInterval(60)
                }
            }
            let failure = describe(error, control: control)
            message = failure
            feedback[control] = failure
            return false
        }
    }

    func invokePanel(_ command: String, isValid: () -> Bool) async -> Bool {
        guard let entry = panelControls.first(where: { $0.command == command }), entry.enabled else { return false }
        let token = commandToken
        let control: TwitchControl
        let winner: String?
        let winnerPrefix = TwitchControl.predictionWinner.id + "."
        if entry.id.hasPrefix(winnerPrefix),
           let index = Int(entry.id.dropFirst(winnerPrefix.count)), let outcomes = prediction?.outcomes,
           outcomes.indices.contains(index - 1) {
            control = .predictionWinner
            winner = outcomes[index - 1].id
        } else if let target = TwitchControl.allCases.first(where: { $0.id == entry.id }) {
            control = target
            winner = nil
        } else {
            return false
        }
        return await invoke(control, winner: winner) { isValid() && self.commandToken == token }
    }

    private func perform(_ control: TwitchControl, winner: String?, originalPoll: TwitchAPI.Poll?,
                         originalPrediction: TwitchAPI.Prediction?, preset: TwitchBroadcastConfiguration,
                         auth: TwitchAPI.Authorization) async throws -> String {
        let currentGeneration = generation
        let result: String
        switch control {
        case .details:
            try await api.updateChannel(title: preset.streamTitle.trimmingCharacters(in: .whitespacesAndNewlines),
                                        gameID: preset.category?.id, tags: preset.replaceTags ? preset.tags : nil, auth: auth)
            result = "Stream details saved"
        case .marker:
            let marker = try await api.addMarker(description: preset.markerDescription, auth: auth)
            let minute = max(0, marker.positionSeconds) / 60
            result = "Marked at \(minute):\(String(format: "%02d", max(0, marker.positionSeconds) % 60))"
        case .clip:
            let accepted = try await api.createClip(auth: auth)
            for _ in 0..<7 {
                try await Task.sleep(for: .seconds(2))
                guard generation == currentGeneration else { throw CancellationError() }
                if let clip = try await api.clip(id: accepted.id, auth: auth),
                   clip.url.scheme == "https", ["www.twitch.tv", "twitch.tv", "clips.twitch.tv"].contains(clip.url.host ?? "") {
                    guard generation == currentGeneration else { throw CancellationError() }
                    lastClip = clip
                    return "Clip ready"
                }
            }
            throw OperationError.clipPending
        case .commercial:
            let ad = try await api.startCommercial(seconds: preset.commercialSeconds, auth: auth)
            guard generation == currentGeneration else { throw CancellationError() }
            commercialAvailableAt = Date().addingTimeInterval(Double(max(0, ad.retryAfter)))
            result = "Ad requested"
        case .pollStart:
            let created = try await api.createPoll(title: preset.poll.title, choices: preset.poll.options,
                                                   duration: preset.poll.seconds, auth: auth)
            guard generation == currentGeneration else { throw CancellationError() }
            poll = created
            result = "Poll started"
        case .pollEnd:
            guard let id = originalPoll?.id, poll?.id == id, poll?.status == "ACTIVE" else {
                throw OperationError.unavailable
            }
            let ended = try await api.endPoll(id: id, auth: auth)
            guard generation == currentGeneration else { throw CancellationError() }
            poll = ended
            result = "Poll ended"
        case .predictionStart:
            let created = try await api.createPrediction(title: preset.prediction.title, outcomes: preset.prediction.options,
                                                         duration: preset.prediction.seconds, auth: auth)
            guard generation == currentGeneration else { throw CancellationError() }
            prediction = created
            result = "Prediction started"
        case .predictionLock, .predictionCancel, .predictionWinner:
            guard let originalPrediction, prediction?.id == originalPrediction.id else { throw OperationError.unavailable }
            let resolution: TwitchAPI.PredictionResolution
            switch control {
            case .predictionLock: resolution = .lock
            case .predictionCancel: resolution = .cancel
            default:
                guard let winner, originalPrediction.outcomes.contains(where: { $0.id == winner }) else {
                    throw OperationError.unavailable
                }
                resolution = .winner(winner)
            }
            let updated = try await api.updatePrediction(id: originalPrediction.id, resolution: resolution, auth: auth)
            guard generation == currentGeneration else { throw CancellationError() }
            prediction = updated
            result = control == .predictionLock ? "Prediction locked" : control == .predictionCancel ? "Prediction canceled" : "Prediction resolved"
        default: throw OperationError.unavailable
        }
        requestSnapshot()
        return result
    }

    private func save(_ tokens: TwitchAPI.TokenResponse, identity: TwitchAPI.Identity) throws {
        let expires = min(tokens.expiresIn, identity.expiresIn)
        let value = Credential(clientID: identity.clientId, broadcasterID: identity.userId,
                               accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
                               expiresAt: Date().addingTimeInterval(Double(expires)))
        let data = try JSONEncoder().encode(value)
        guard credentialStore.save(data) else {
            throw OperationError.keychain
        }
        credential = value
    }

    private func authorization() async throws -> TwitchAPI.Authorization {
        guard let current = credential else { throw OperationError.disconnected }
        let active = generation
        let expired = current.expiresAt.timeIntervalSinceNow <= 60
        if expired || validatedAt.map({ Date().timeIntervalSince($0) >= 3600 }) != false {
            if let refreshTask {
                try await refreshTask.value
            } else {
                let task = Task {
                    try await self.validateOrRefresh(current, expired: expired, generation: active)
                }
                refreshTask = task
                defer { if active == generation { refreshTask = nil } }
                try await task.value
            }
        }
        guard active == generation, let credential, identity?.userId == credential.broadcasterID else {
            throw OperationError.disconnected
        }
        return TwitchAPI.Authorization(clientID: credential.clientID, accessToken: credential.accessToken,
                                       broadcasterID: credential.broadcasterID)
    }

    private func validateOrRefresh(_ current: Credential, expired: Bool, generation active: UUID) async throws {
        var tokens: TwitchAPI.TokenResponse?
        let who: TwitchAPI.Identity
        do {
            if expired {
                let next = try await api.refresh(current.refreshToken, clientID: current.clientID)
                tokens = next
                who = try await api.validate(next.accessToken)
            } else {
                who = try await api.validate(current.accessToken)
            }
        } catch let error as TwitchAPI.HTTPError where error.invalidSession {
            if active == generation { clear() }
            throw error
        }
        guard active == generation, !Task.isCancelled else { throw CancellationError() }
        guard who.clientId == current.clientID, who.userId == current.broadcasterID else {
            clear()
            throw OperationError.unexpectedAccount
        }
        if let tokens { try save(tokens, identity: who) }
        identity = who
        validatedAt = Date()
        if tokens != nil || eventTask == nil { startEvents() }
    }

    private func restartMonitoring(identity who: TwitchAPI.Identity) {
        pollTask?.cancel()
        eventTask?.cancel()
        snapshotTask?.cancel()
        refreshTask?.cancel()
        generation = UUID()
        snapshotTask = nil
        pendingSnapshot = false
        refreshTask = nil
        connecting = false
        userCode = nil
        verificationURL = nil
        busy = nil
        identity = who
        account = nil
        stream = nil
        poll = nil
        prediction = nil
        channel = nil
        lastClip = nil
        feedback = [:]
        commercialAvailableAt = .distantPast
        rateLimitedUntil = .distantPast
        validatedAt = Date()
        status = .checking
        startMonitoring()
        startEvents()
        publishControls()
    }

    private func startMonitoring() {
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.requestSnapshot()
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    private func startEvents() {
        eventTask?.cancel()
        guard monitorEvents, let value = credential else { return }
        let active = generation
        let auth = TwitchAPI.Authorization(clientID: value.clientID, accessToken: value.accessToken,
                                           broadcasterID: value.broadcasterID)
        let events = TwitchEventStream(api: api)
        eventTask = Task { [weak self] in
            await events.run(authorization: auth) { [weak self] in
                await self?.updateFromEvent(generation: active)
            }
        }
    }

    private func updateFromEvent(generation active: UUID) {
        if active == generation { requestSnapshot() }
    }

    private func requestSnapshot() {
        guard Date() >= rateLimitedUntil else { return }
        if snapshotTask != nil {
            pendingSnapshot = true
            return
        }
        let active = generation
        snapshotTask = Task { [weak self] in
            guard let self else { return }
            defer {
                if generation == active {
                    snapshotTask = nil
                    if pendingSnapshot {
                        pendingSnapshot = false
                        requestSnapshot()
                    }
                }
            }
            do {
                let auth = try await authorization()
                async let currentStream = api.stream(auth)
                async let currentChannel = api.channel(auth)
                let result = try await (currentStream, currentChannel)
                let loadedAccount = if let account { account } else { try await api.account(auth) }
                guard generation == active, !Task.isCancelled else { return }
                stream = result.0
                channel = result.1
                account = loadedAccount
                status = stream == nil ? .offline : .live
                if busy == nil, loadedAccount.eligibleForCommercialsAndPolls {
                    let revision = mutationRevision
                    let nextPoll = configuration.pollsEnabled && identity?.allows(.polls) == true
                        ? try? await api.latestPoll(auth: auth) : nil
                    let nextPrediction = configuration.predictionsEnabled && identity?.allows(.predictions) == true
                        ? try? await api.latestPrediction(auth: auth) : nil
                    guard generation == active, !Task.isCancelled else { return }
                    if busy == nil, revision == mutationRevision {
                        poll = nextPoll
                        prediction = nextPrediction
                    }
                }
            } catch {
                guard generation == active, !Task.isCancelled else { return }
                if let http = error as? TwitchAPI.HTTPError {
                    if http.status == 401 { validatedAt = nil }
                    if http.status == 429 {
                        rateLimitedUntil = http.retryAt.flatMap { $0 > Date() ? $0 : nil }
                            ?? Date().addingTimeInterval(60)
                    }
                }
                status = credential == nil ? .disconnected : .unavailable
            }
            publishControls()
        }
    }

    private func clear() {
        generation = UUID()
        signInAttempt = UUID()
        authorizationTask?.cancel()
        pollTask?.cancel()
        eventTask?.cancel()
        refreshTask?.cancel()
        snapshotTask?.cancel()
        refreshTask = nil
        snapshotTask = nil
        pendingSnapshot = false
        credential = nil
        validatedAt = nil
        identity = nil
        account = nil
        stream = nil
        channel = nil
        poll = nil
        prediction = nil
        lastClip = nil
        connecting = false
        userCode = nil
        verificationURL = nil
        busy = nil
        status = .disconnected
        feedback = [:]
        credentialStore.remove()
        publishControls()
    }

    private func publishControls() {
        let ready = status == .offline || status == .live
        let live = status == .live
        let eligible = account?.eligibleForCommercialsAndPolls == true
        let editablePrediction = prediction?.status == "ACTIVE" || prediction?.status == "LOCKED"
        let values = TwitchControl.allCases.map { control -> ControlState in
            var detail = ""
            let enabled: Bool
            let active: Bool
            switch control {
            case .status:
                detail = live ? "\(stream?.viewerCount ?? 0) watching" : status.title
                enabled = false
                active = live
            case .details:
                detail = configuration.validStreamDetails ? configuration.streamTitle : "Set a title on Mac"
                enabled = ready && configuration.validStreamDetails
                active = false
            case .marker:
                detail = live ? "Save a timestamp" : "Requires live stream"
                enabled = live && configuration.markerDescription.count <= 140
                active = false
            case .clip:
                detail = live ? "Create a Twitch clip" : "Requires live stream"
                enabled = live
                active = false
            case .commercial:
                let coolingDown = commercialAvailableAt > Date()
                detail = coolingDown ? "Cooling down" : live ? "\(configuration.commercialSeconds) seconds" : "Requires live stream"
                enabled = live && eligible && !coolingDown && configuration.adsEnabled
                    && [30, 60, 90, 120, 150, 180].contains(configuration.commercialSeconds)
                active = false
            case .pollStart:
                detail = poll?.status == "ACTIVE" ? "Poll running" : configuration.validPoll ? configuration.poll.title : "Set up poll on Mac"
                enabled = ready && eligible && configuration.pollsEnabled && configuration.validPoll && poll?.status != "ACTIVE"
                active = poll?.status == "ACTIVE"
            case .pollEnd:
                detail = poll?.status == "ACTIVE" ? poll?.title ?? "" : "No active poll"
                enabled = ready && eligible && configuration.pollsEnabled && poll?.status == "ACTIVE"
                active = false
            case .predictionStart:
                detail = editablePrediction ? "Prediction in progress" : configuration.validPrediction ? configuration.prediction.title : "Set up prediction on Mac"
                enabled = ready && eligible && configuration.predictionsEnabled && configuration.validPrediction && !editablePrediction
                active = editablePrediction
            case .predictionLock, .predictionCancel, .predictionWinner:
                detail = editablePrediction ? prediction?.title ?? "" : "No open prediction"
                enabled = ready && eligible && configuration.predictionsEnabled
                    && (control == .predictionLock ? prediction?.status == "ACTIVE" : editablePrediction)
                active = false
            case .dashboard, .inspector:
                enabled = true
                active = false
            }
            let authorized = control.scope.map { identity?.allows($0) == true } ?? true
            if busy == control { detail = "Working…" }
            else if !authorized { detail = "Authorize on Mac" }
            else if control == .commercial && commercialAvailableAt > Date() { detail = "Cooling down" }
            else if let result = feedback[control] { detail = result }
            else if control.scope != nil && Date() < rateLimitedUntil { detail = "Try again shortly" }
            return ControlState(control: control, detail: detail,
                                enabled: enabled && authorized && (control.scope == nil || (busy == nil && Date() >= rateLimitedUntil)),
                                active: active)
        }
        if values != controls { controls = values }

        let context = CommandContext(account: generation, configuration: configuration, status: status,
                                     streamID: stream?.id, poll: poll, prediction: prediction)
        if context != commandContext {
            commandContext = context
            commandToken = UUID().uuidString.lowercased()
        }
        let statusEntry = values.first { $0.control == .status }
        let stateful = values.filter { $0.control != .predictionWinner && $0.control != .status }.map { value in
            panelEntry(id: value.id, label: value.control.title, detail: value.detail,
                       enabled: value.enabled, active: value.active)
        }
        var next = [PanelControl(id: TwitchControl.status.id, label: status.title, detail: statusEntry?.active == true
                                ? statusEntry?.detail ?? "" : "", active: statusEntry?.active ?? false,
                                enabled: false, command: nil)] + stateful
        if let winner = values.first(where: { $0.control == .predictionWinner }),
           let prediction, ["ACTIVE", "LOCKED"].contains(prediction.status) {
            next += prediction.outcomes.prefix(10).enumerated().map { index, outcome in
                panelEntry(id: TwitchControl.predictionWinner.id + "." + String(index + 1), label: outcome.title,
                           detail: "Resolve prediction", enabled: winner.enabled, active: false)
            }
        }
        if next != panelControls { panelControls = next }
    }

    private func panelEntry(id: String, label: String, detail: String, enabled: Bool, active: Bool) -> PanelControl {
        PanelControl(id: id, label: label, detail: detail, active: active, enabled: enabled,
                     command: enabled ? id + "." + commandToken : nil)
    }

    private func describe(_ error: Error, control: TwitchControl? = nil) -> String {
        switch error {
        case OperationError.clipPending: return "Clip still processing"
        case OperationError.keychain: return "Could not save Twitch sign-in"
        case OperationError.unexpectedAccount: return "Twitch account changed"
        case OperationError.disconnected: return "Connect Twitch on Mac"
        case OperationError.unavailable: return "Control unavailable"
        case let http as TwitchAPI.HTTPError:
            if http.invalidSession { return "Sign in to Twitch again" }
            switch http.status {
            case 400: return "Twitch rejected the settings"
            case 403: return "Twitch permission required"
            case 404 where control == .marker: return "Live stream and VOD required"
            case 404: return "Unavailable on Twitch"
            case 429: return "Twitch cooldown or rate limit"
            default: return "Twitch request failed"
            }
        default: return "Could not reach Twitch"
        }
    }
}
