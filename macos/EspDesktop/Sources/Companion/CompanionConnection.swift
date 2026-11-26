import CryptoKit
@preconcurrency import Foundation
import Security

private final class AuthenticationChallengeCompletion: @unchecked Sendable {
    private let handler: (URLSession.AuthChallengeDisposition, URLCredential?) -> Void

    init(_ handler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        self.handler = handler
    }

    func callAsFunction(_ disposition: URLSession.AuthChallengeDisposition, _ credential: URLCredential?) {
        handler(disposition, credential)
    }
}

private final class CompanionSessionDelegate: NSObject, URLSessionDelegate, URLSessionWebSocketDelegate, @unchecked Sendable {
    var onOpen: ((URLSessionWebSocketTask) -> Void)?
    var onClose: ((URLSessionWebSocketTask, String) -> Void)?
    var onChallenge: ((URLAuthenticationChallenge, AuthenticationChallengeCompletion) -> Void)?

    func urlSession(_: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol _: String?) {
        onOpen?(webSocketTask)
    }

    func urlSession(_: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        let detail = reason.flatMap { String(data: $0, encoding: .utf8) }
        let suffix = detail.map { $0.isEmpty ? "" : ", reason: \($0)" } ?? ""
        onClose?(webSocketTask, "WebSocket closed with code \(closeCode.rawValue)\(suffix)")
    }

    func urlSession(_: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard let onChallenge else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        onChallenge(challenge, AuthenticationChallengeCompletion(completionHandler))
    }
}

@MainActor
final class CompanionConnection: NSObject {
    enum Mode { case authenticate, pair(code: String) }

    private unowned let preferences: any CompanionSessionPreferences
    private unowned let resources: any CompanionSessionResources
    private let credentials: any CompanionSessionCredentials
    var onEvent: ((CompanionSessionEvent) -> Void)?
    private let discovery: CompanionDiscovery
    private var endpointRecovery = CompanionEndpointRecovery()
    private(set) var pendingEndpoint: String?
    private var editorRequestID: UInt32 = 0
    private var editorPending: [UInt32: (callback: CheckedContinuation<Data, Error>, timeout: Task<Void, Never>)] = [:]
    private var wifiCommandBusy = false
    private var editorBusy = false
    var usbEditorConnected: Bool { usbBridge != nil && sessionAuthenticated }
    private(set) var usbEditorSupported = false
    private var usbWifiAddressSupported = false
    private var usbBridge: CompanionUSBBridge?
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var mode: Mode = .authenticate
    var isPairing: Bool {
        if case .pair = mode { return true }
        return false
    }
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var reconnectAttempt = 0
    private var connectionTimeoutTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var pendingCertificateFingerprint: String?
    private var shouldReconnect = false
    private var hasTerminalConnectionError = false
    private var sessionAuthenticated = false
    private var supportsAlphaAppIcons = false
    private var supportsHighResolutionAppIcons = false
    private var supportsImmediateApplicationFocus = false
    private var supportsSessionLock = false
    private var supportsPairingReset = false
    private var supportsCoughButton = false
    private var supportsInputDevices = false
    private var pairingResetCompletion: CheckedContinuation<Void, Never>?
    private var pairingResetTimeout: Task<Void, Never>?
    private var remoteCatalogueDefinitionsSupported = false
    private var expandedShortcutsSupported = false
    private var onDemandShortcutsSupported = false
    private var appVolumeSupported = false
    private(set) var appleShortcutsSupported = false
    private var authenticationRequestOutstanding = false
    private var appIconData: Data?
    private var appIconIdentifier = ""
    private var activeAppIconRequest: CompanionWireAppIconRequest?
    private var appIconGeneration: UInt32 = 0
    private var appIconOffset = 0
    private var pendingAppIconRequests: [CompanionWireAppIconRequest] = []
    private var focusTargets: [(id: String, url: URL)] = []
    private var focusPublicationTask: Task<Void, Never>?
    private var applicationFocusPublisher = CompanionApplicationFocusPublisher()
    private var catalogueGeneration: UInt32 = 0
    private var supportsOBSCards = false
    private var supportsOBSAdaptiveScenes = false
    private var peerCapabilityVersion: UInt32 = 0
    private var supportsOBSBreak = false
    private var supportsOBSOutputs = false
    private var supportsOBSCough = false
    private var supportsOBSFaders = false
    private var lastOBSAudioValues: [String: Int] = [:]
    private var definitionGeneration: UInt32 = 0
    private var lastPublishedSystemMetrics: CompanionSystemMetricsSnapshot?
    private var lastSystemMetricsPublication = Date.distantPast
    private static let maximumTextFrameBytes = CompanionCapabilities.maximumTextFrameBytes
    private var connectionGeneration: UInt64 = 0
    private func makeSessionDelegate() -> CompanionSessionDelegate {
        let generation = connectionGeneration
        let delegate = CompanionSessionDelegate()
        delegate.onOpen = { [weak self] task in
            Task { @MainActor [weak self] in self?.connectionDidOpen(task) }
        }
        delegate.onClose = { [weak self] task, reason in
            Task { @MainActor [weak self] in self?.handleConnectionFailure(for: task, reason: reason) }
        }
        delegate.onChallenge = { [weak self] challenge, completion in
            Task { @MainActor [weak self] in
                guard let self, self.connectionGeneration == generation else {
                    completion(.cancelAuthenticationChallenge, nil)
                    return
                }
                self.handleAuthenticationChallenge(challenge, completionHandler: completion)
            }
        }
        return delegate
    }

    init(preferences: any CompanionSessionPreferences,
         resources: any CompanionSessionResources,
         credentials: any CompanionSessionCredentials = CompanionKeychainCredentials(),
         discovery: CompanionDiscovery = CompanionDiscovery()) {
        self.preferences = preferences
        self.resources = resources
        self.credentials = credentials
        self.discovery = discovery
    }

    private func updateConnectionStatus(_ message: String, state: CompanionConnectionState, recovery: String? = nil) {
        onEvent?(.connection(message: message, state: state, recovery: recovery))
    }

    func connect(mode: Mode) {
        pendingEndpoint = nil
        discovery.stop()
        endpointRecovery = CompanionEndpointRecovery()
        startConnection(mode: mode, resetBackoff: true)
    }

    func switchToDiscoveredNetwork(_ display: DiscoveredDisplay) {
        let fingerprint = preferences.stringPreference(forKey: certificateFingerprintKey)
        guard CompanionUSBPort.path(from: preferences.panelHost) != nil,
              display.id == fingerprint, ConnectionEndpointPolicy.isLocalEndpoint(display.endpoint) else { return }
        switchEndpoint(display.endpoint)
    }

    func switchEndpoint(_ endpoint: String) {
        guard endpoint != preferences.panelHost, preferences.hasSavedPairing,
              preferences.stringPreference(forKey: certificateFingerprintKey) != nil else { return }
        discovery.stop()
        endpointRecovery = CompanionEndpointRecovery()
        pendingEndpoint = endpoint
        startConnection(mode: .authenticate, resetBackoff: true)
    }

    @discardableResult
    private func restoreSavedEndpoint() -> Bool {
        guard pendingEndpoint != nil else { return false }
        connect(mode: .authenticate)
        return true
    }

    static func usbPortMatches(_ path: String, fingerprint expected: String) async -> Bool {
        guard !Task.isCancelled, let bridge = try? CompanionUSBBridge(path: path) else { return false }
        let delegate = CompanionSessionDelegate()
        var verified = false
        delegate.onChallenge = { challenge, completion in
            Task { @MainActor in
                guard let identity = serverIdentity(from: challenge), identity.fingerprint == expected else {
                    completion(.cancelAuthenticationChallenge, nil)
                    return
                }
                verified = true
                completion(.useCredential, URLCredential(trust: identity.trust))
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        let socket = session.webSocketTask(with: bridge.webSocketURL)
        socket.maximumMessageSize = 1024
        // A verified TLS handshake and Companion hello identify the port. Do not
        // authenticate a Companion session or displace the panel's IP connection.
        socket.resume()
        let timeout = Task {
            try? await Task.sleep(for: .seconds(3))
            if !Task.isCancelled { socket.cancel(with: .goingAway, reason: nil) }
        }
        let message = try? await withTaskCancellationHandler {
            try await socket.receive()
        } onCancel: {
            socket.cancel(with: .goingAway, reason: nil)
        }
        timeout.cancel()
        socket.cancel(with: .goingAway, reason: nil)
        session.invalidateAndCancel()
        await bridge.stopAndWait()

        guard !Task.isCancelled, verified, case let .string(text) = message,
              case .hello = CompanionProtocolDecoder.decode(Data(text.utf8), direction: .panelToMac,
                                                           state: .authenticating)
        else { return false }
        return true
    }

    private func startConnection(mode: Mode, resetBackoff: Bool) {
        reconnectTask?.cancel()
        reconnectTask = nil
        tearDownConnection()
        if resetBackoff { reconnectAttempt = 0 }
        hasTerminalConnectionError = false
        shouldReconnect = {
            if case .authenticate = mode { return true }
            return false
        }()
        guard !preferences.panelHost.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            shouldReconnect = false
            updateConnectionStatus("Enter the display address first", state: .failed)
            return
        }
        self.mode = mode
        let usbPort = CompanionUSBPort.path(from: pendingEndpoint ?? preferences.panelHost)
        let url: URL
        if let usbPort {
            do {
                let bridge = try CompanionUSBBridge(path: usbPort)
                usbBridge = bridge
                url = bridge.webSocketURL
            } catch {
                if restoreSavedEndpoint() { return }
                let help = "Check the USB cable and close any serial monitor for this port."
                updateConnectionStatus("Could not open the USB display", state: .failed, recovery: help)
                scheduleReconnect()
                return
            }
        } else {
            endpointRecovery.begin(savedEndpoint: preferences.panelHost)
            guard let networkURL = connectionURL() else {
                if restoreSavedEndpoint() { return }
                shouldReconnect = false
                return
            }
            url = networkURL
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = usbPort == nil
        if usbPort != nil { configuration.connectionProxyDictionary = [:] }
        session = URLSession(configuration: configuration, delegate: makeSessionDelegate(), delegateQueue: nil)
        guard let task = session?.webSocketTask(with: url) else {
            if restoreSavedEndpoint() { return }
            updateConnectionStatus("Could not create the display connection", state: .failed)
            return
        }
        self.task = task
        task.resume()
        updateConnectionStatus("Connecting…", state: resetBackoff ? .connecting : .reconnecting)
        receive(from: task)
        startConnectionTimeout(for: task)
    }

    func disconnect() {
        pendingEndpoint = nil
        shouldReconnect = false
        discovery.stop()
        endpointRecovery = CompanionEndpointRecovery()
        reconnectTask?.cancel()
        reconnectTask = nil
        tearDownConnection()
        updateConnectionStatus("Not connected", state: .disconnected)
    }

    func cancelRePairing() {
        guard isPairing else { return }
        tearDownConnection()
        updateConnectionStatus("Display needs to be paired again", state: .needsPairing,
                               recovery: Self.rePairingInstructions)
    }

    func showPairingBeforeDisconnecting() async {
        guard sessionAuthenticated, supportsPairingReset, pairingResetCompletion == nil else { return }
        shouldReconnect = false
        await withCheckedContinuation { continuation in
            pairingResetCompletion = continuation
            pairingResetTimeout = Task { [weak self] in
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled else { return }
                self?.finishPairingResetRequest()
            }
            sendJSON(["type": "pair.reset"])
        }
    }

    private func finishPairingResetRequest() {
        pairingResetTimeout?.cancel()
        pairingResetTimeout = nil
        pairingResetCompletion?.resume()
        pairingResetCompletion = nil
    }

    private func tearDownConnection() {
        releaseCoughButton()
        finishPairingResetRequest()
        if !shouldReconnect { discovery.stop() }
        connectionGeneration &+= 1
        sessionAuthenticated = false
        pendingCertificateFingerprint = nil
        focusTargets = []
        applicationFocusPublisher.reset()
        supportsAlphaAppIcons = false
        supportsHighResolutionAppIcons = false
        remoteCatalogueDefinitionsSupported = false
        expandedShortcutsSupported = false
        onDemandShortcutsSupported = false
        appVolumeSupported = false
        appleShortcutsSupported = false
        endpointRecovery.verifiedFingerprint = nil
        authenticationRequestOutstanding = false
        resetAppIconTransferState(clearPendingRequests: true)
        connectionTimeoutTask?.cancel()
        connectionTimeoutTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        focusPublicationTask?.cancel()
        focusPublicationTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
        usbEditorSupported = false
        usbWifiAddressSupported = false
        finishEditorCommand(.failure(USBEditorError.disconnected))
        usbBridge?.stop()
        usbBridge = nil
        lastPublishedSystemMetrics = nil
        lastSystemMetricsPublication = .distantPast
    }

    private func connectionDidOpen(_ webSocketTask: URLSessionWebSocketTask) {
        guard task === webSocketTask else { return }
        switch mode {
        case .pair(let code): sendJSON(["type": "pair.request", "code": code])
        case .authenticate:
            authenticate(on: webSocketTask)
        }
    }

    private func authenticate(on webSocketTask: URLSessionWebSocketTask) {
        connectionTimeoutTask?.cancel()
        connectionTimeoutTask = nil
        let account = preferences.pairingAccount
        updateConnectionStatus("Authenticating…", state: reconnectAttempt > 0 ? .reconnecting : .connecting)
        Task { [weak self, weak webSocketTask] in
            // Stay on the main actor so Security can present an interactive
            // Keychain access prompt when the saved credential requires it.
            let credential = self?.credentials.load(account: account)
            guard let self, let webSocketTask, self.task === webSocketTask else { return }
            guard let credential else {
                self.hasTerminalConnectionError = true
                self.shouldReconnect = false
                self.updateConnectionStatus(
                    "Could not read the saved display pairing", state: .failed,
                    recovery: "Unlock your Mac and allow EspDesktop to access Keychain, then try again. " +
                        "If the pairing was deleted from Keychain, remove the display in Settings and pair it again."
                )
                self.handleConnectionFailure(for: webSocketTask, reason: "Authentication credential unavailable")
                return
            }
            let sequence = self.nextAuthenticationSequence()
            let nonce = UUID().uuidString
            let signed = "auth.request|\(sequence)|\(nonce)"
            let key = SymmetricKey(data: credential)
            let signature = HMAC<SHA256>.authenticationCode(for: Data(signed.utf8), using: key)
            self.startConnectionTimeout(for: webSocketTask)
            self.authenticationRequestOutstanding = true
            self.sendJSON([
                "type": "auth.request", "sequence": sequence, "nonce": nonce,
                "signature": signature.map { String(format: "%02x", $0) }.joined(),
            ])
        }
    }

    private func connectionURL() -> URL? {
        let raw = (pendingEndpoint ?? endpointRecovery.attempted ?? preferences.panelHost)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: raw.contains("://") ? raw : "wss://\(raw)"),
              let host = parsed.host,
              ConnectionEndpointPolicy.isLocalHost(host) else {
            updateConnectionStatus("Display address must be on the local network", state: .failed)
            return nil
        }
        var components = URLComponents()
        components.scheme = "wss"
        components.host = host
        components.port = parsed.port ?? 8443
        components.path = CompanionCapabilities.protocolPath
        return components.url
    }

    private func handleAuthenticationChallenge(
        _ challenge: URLAuthenticationChallenge,
        completionHandler: AuthenticationChallengeCompletion
    ) {
        guard let (trust, fingerprint) = Self.serverIdentity(from: challenge) else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        let saved = preferences.stringPreference(forKey: certificateFingerprintKey)
        if case .pair = mode, !preferences.allowsPairing(certificateFingerprint: fingerprint) {
            shouldReconnect = false
            hasTerminalConnectionError = true
            updateConnectionStatus("Display already paired", state: .failed,
                                   recovery: "This display is already in Displays. Select it there to reconnect.")
            completionHandler(.cancelAuthenticationChallenge, nil)
        } else if let saved, saved != fingerprint {
            shouldReconnect = false
            hasTerminalConnectionError = true
            let recovery = usbBridge == nil
                ? "Check the display address. If you reset or replaced the display, forget it and pair again."
                : "Select the USB port for the paired display. If you reset or replaced the display, forget it and pair again."
            updateConnectionStatus("Blocked: display identity does not match", state: .failed, recovery: recovery)
            completionHandler(.cancelAuthenticationChallenge, nil)
        } else if saved != nil {
            endpointRecovery.verifiedFingerprint = fingerprint
            if case .pair = mode { pendingCertificateFingerprint = fingerprint }
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else if case .pair = mode {
            // The one-time pairing code authorizes this first connection. Pin
            // the certificate when the panel returns the paired credential.
            pendingCertificateFingerprint = fingerprint
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            updateConnectionStatus("Start pairing on the display and enter its code", state: .failed)
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    private static func serverIdentity(from challenge: URLAuthenticationChallenge)
        -> (trust: SecTrust, fingerprint: String)? {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust,
              let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let certificate = certificates.first else {
            return nil
        }
        let fingerprint = SHA256.hash(data: SecCertificateCopyData(certificate) as Data)
            .map { String(format: "%02x", $0) }.joined()
        return (trust, fingerprint)
    }

    func requestUSBEditor(_ request: USBEditorRequest, authorization: String? = nil) async throws -> USBEditorResponse {
        if request.path == USBEditorRequest.wifiPath {
            guard usbEditorConnected else { throw USBEditorError.disconnected }
            guard usbEditorSupported else { throw USBEditorError.firmwareUpdateRequired }
            guard !wifiCommandBusy else { throw USBEditorError.wifiSaveBusy }
            wifiCommandBusy = true
            defer { wifiCommandBusy = false }
            return try await requestUSBWifi(request, generation: connectionGeneration)
        }
        let generation = try await beginUSBEditorRequest()
        defer { editorBusy = false }
        return try await requestUSBEditorHTTP(request, authorization: authorization, generation: generation)
    }

    private func beginUSBEditorRequest() async throws -> UInt64 {
        // The panel has one editor socket per paired display. Wait for this
        // display's current HTTP request without serializing other panels.
        while editorBusy { try await Task.sleep(for: .milliseconds(15)) }
        guard usbEditorConnected else { throw USBEditorError.disconnected }
        guard usbEditorSupported else { throw USBEditorError.firmwareUpdateRequired }
        editorBusy = true
        return connectionGeneration
    }

    func prepareWifiForNetworkSwitch() async -> Bool? {
        guard let enabled = await usbWifiEnabled() else { return nil }
        if enabled { return true }
        guard !Task.isCancelled else { return false }
        return await usbWifiEnabled(setting: true) == true
    }

    func currentUSBWifiAddress() async -> String? {
        guard usbEditorConnected, usbEditorSupported else { return nil }
        return await withTaskGroup(of: String?.self) { group in
            group.addTask { await self.readUSBWifiAddress() }
            group.addTask {
                try? await Task.sleep(for: .milliseconds(1500))
                return nil
            }
            let address = await group.next() ?? nil
            group.cancelAll()
            return address
        }
    }

    private func readUSBWifiAddress() async -> String? {
        let generation = connectionGeneration
        if usbWifiAddressSupported {
            guard let result = try? await editorCommand(8, generation: generation),
                  connectionGeneration == generation else { return nil }
            return USBEditorPanelIdentity.localNetworkAddress(fromWiFiReply: result)
        }
        guard await usbWifiEnabled() == true,
              let request = USBEditorRequest(method: "GET", path: "/api/v1/identity"),
              connectionGeneration == generation,
              let response = try? await requestUSBEditor(request), response.status == 200,
              connectionGeneration == generation,
              let identity = try? JSONDecoder().decode(USBEditorPanelIdentity.self, from: response.body)
        else { return nil }
        return identity.localNetworkAddress
    }

    private func usbWifiEnabled(setting: Bool? = nil) async -> Bool? {
        let body: Data
        if let setting {
            guard let encoded = try? JSONEncoder().encode(USBEditorWifiState(enabled: setting)) else { return nil }
            body = encoded
        } else {
            body = Data()
        }
        guard usbEditorConnected, usbEditorSupported,
              let request = USBEditorRequest(method: setting == nil ? "GET" : "POST",
                                             path: USBEditorRequest.wifiPath, body: body),
              let response = try? await requestUSBEditor(request), response.status == 200,
              let state = try? JSONDecoder().decode(USBEditorWifiState.self, from: response.body)
        else { return nil }
        return state.enabled
    }

    private func requestUSBWifi(_ request: USBEditorRequest, generation: UInt64) async throws -> USBEditorResponse {
        var result: Data
        if request.method == "GET" {
            result = try await editorCommand(5, generation: generation)
        } else {
            guard let state = try? JSONDecoder().decode(USBEditorWifiState.self, from: request.body) else {
                return USBEditorResponse(status: 400, headers: [:], body: Data())
            }
            result = try await editorCommand(7, body: Data([state.enabled ? 1 : 0]), generation: generation)
            if result == Data([4]) { throw USBEditorError.wifiSaveBusy }
            guard result == Data([1]) else { throw USBEditorError.wifiSaveUnsupported }
            let clock = ContinuousClock()
            let deadline = clock.now.advanced(by: .seconds(5))
            while result == Data([1]) {
                guard clock.now < deadline else { throw USBEditorError.timedOut }
                try await Task.sleep(for: .milliseconds(100))
                result = try await editorCommand(7, generation: generation)
            }
            if result == Data([3]) { throw USBEditorError.wifiSaveFailed }
        }
        if result == Data([3]) {
            return USBEditorResponse(status: 404, headers: [:], body: Data())
        }
        guard result.count == 2, result.first == 0, let enabled = result.last, enabled <= 1 else {
            throw USBEditorError.invalidResponse
        }
        let body = try JSONEncoder().encode(USBEditorWifiState(enabled: enabled == 1))
        return USBEditorResponse(status: 200, headers: ["content-type": "application/json"], body: body)
    }

    private func requestUSBEditorHTTP(_ request: USBEditorRequest, authorization: String?,
                                      generation: UInt64) async throws -> USBEditorResponse {
        do {
            let open = try await editorCommand(1, generation: generation)
            guard open.first == 0 else { throw USBEditorError.invalidResponse }
            let requestBytes = request.wireBytes(authorization: authorization)
            let clock = ContinuousClock()
            let end = clock.now.advanced(by: .seconds(100))
            var offset = 0
            while offset < requestBytes.count {
                guard clock.now < end else { throw USBEditorError.timedOut }
                let limit = min(offset + 4096, requestBytes.count)
                let result = try await editorCommand(2, body: Data(requestBytes[offset..<limit]), generation: generation)
                if result.first == 1 {
                    try await Task.sleep(for: .milliseconds(15))
                    continue
                }
                guard result.count == 3, result.first == 0 else { throw USBEditorError.invalidResponse }
                let count = Int(result[result.startIndex + 1]) * 256 + Int(result[result.startIndex + 2])
                guard count > 0, count <= limit - offset else { throw USBEditorError.invalidResponse }
                offset += count
            }
            var bytes = Data()
            while clock.now < end {
                let result = try await editorCommand(3, generation: generation)
                switch result.first {
                case 0:
                    bytes.append(contentsOf: result.dropFirst())
                    guard bytes.count <= USBEditorResponse.maximumBytes else { throw USBEditorError.tooLarge }
                case 1:
                    try await Task.sleep(for: .milliseconds(15))
                    continue
                case 2: break
                default: throw USBEditorError.invalidResponse
                }
                if let response = try USBEditorResponse.parse(bytes, ended: result.first == 2) {
                    _ = try? await editorCommand(4, generation: generation)
                    return response
                }
            }
            throw USBEditorError.timedOut
        } catch {
            // A later OPEN replaces any incomplete upstream request if the
            // current WebSocket disappeared before CLOSE could be delivered.
            _ = try? await editorCommand(4, generation: generation)
            throw error
        }
    }

    private func editorCommand(_ command: UInt8, body: Data = Data(), generation: UInt64) async throws -> Data {
        try Task.checkCancellation()
        guard usbEditorConnected, connectionGeneration == generation, let task
        else { throw USBEditorError.disconnected }
        editorRequestID &+= 1
        let id = editorRequestID
        var frame = Data("UED1".utf8)
        frame.append(command)
        withUnsafeBytes(of: id.bigEndian) { frame.append(contentsOf: $0) }
        frame.append(body)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { callback in
                let timeout = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(7))
                    if !Task.isCancelled { self?.finishEditorCommand(.failure(USBEditorError.timedOut), id: id) }
                }
                editorPending[id] = (callback, timeout)
                task.send(.data(frame)) { [weak self] error in
                    if error != nil {
                        Task { @MainActor [weak self] in
                            self?.finishEditorCommand(.failure(USBEditorError.disconnected), id: id)
                        }
                    }
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.finishEditorCommand(.failure(CancellationError()), id: id)
            }
        }
    }

    private func receiveEditorCommand(_ bytes: Data) {
        guard bytes.count >= 9, bytes.prefix(4) == Data("UED1".utf8) else { return }
        let id = bytes.dropFirst(5).prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        var result = Data(bytes.dropFirst(4).prefix(1))
        result.append(bytes.dropFirst(9))
        finishEditorCommand(.success(result), id: id)
    }

    private func finishEditorCommand(_ result: Result<Data, Error>, id: UInt32? = nil) {
        for key in id.map({ [$0] }) ?? Array(editorPending.keys) {
            guard let pending = editorPending.removeValue(forKey: key) else { continue }
            pending.timeout.cancel()
            pending.callback.resume(with: result)
        }
    }

    private func receive(from task: URLSessionWebSocketTask) {
        receiveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled && self.task === task {
                do {
                    let message = try await task.receive()
                    guard !Task.isCancelled, self.task === task else { return }
                    switch message {
                    case .string(let value): await self.handle(value)
                    case .data(let data): self.receiveEditorCommand(data)
                    @unknown default: break
                    }
                } catch {
                    guard !Task.isCancelled else { return }
                    self.handleConnectionFailure(for: task, reason: "Receive failed: \(error.localizedDescription)")
                    return
                }
            }
        }
    }

    private func startConnectionTimeout(for task: URLSessionWebSocketTask) {
        connectionTimeoutTask?.cancel()
        connectionTimeoutTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled, let self, self.task === task, !self.sessionAuthenticated else { return }
            if case .pair = self.mode {
                self.updateConnectionStatus("Pairing failed — try again", state: .failed)
            } else {
                self.updateConnectionStatus("Display did not respond — reconnecting…", state: .reconnecting)
            }
            self.handleConnectionFailure(for: task, reason: "Authentication timed out")
        }
    }

    private func startHeartbeat(for task: URLSessionWebSocketTask) {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard !Task.isCancelled, let self, self.task === task else { return }
                task.sendPing { [weak self, weak task = task] error in
                    guard let error else { return }
                    let reason = "WebSocket heartbeat failed: \(error.localizedDescription)"
                    Task { @MainActor [weak self, weak task = task] in
                        guard let self, let task else { return }
                        self.handleConnectionFailure(for: task, reason: reason)
                    }
                }
            }
        }
    }

    private func handleConnectionFailure(for failedTask: URLSessionWebSocketTask, reason: String = "Connection closed") {
        guard task === failedTask else { return }
        releaseCoughButton()
        finishPairingResetRequest()
        print("[EspDesktop] Companion connection lost: \(reason)")
        if !hasTerminalConnectionError, case .pair = mode {
            updateConnectionStatus("Pairing failed — try again", state: .failed)
        }
        connectionGeneration &+= 1
        sessionAuthenticated = false
        pendingCertificateFingerprint = nil
        focusTargets = []
        applicationFocusPublisher.reset()
        resetAppIconTransferState(clearPendingRequests: true)
        remoteCatalogueDefinitionsSupported = false
        expandedShortcutsSupported = false
        onDemandShortcutsSupported = false
        appVolumeSupported = false
        appleShortcutsSupported = false
        connectionTimeoutTask?.cancel()
        connectionTimeoutTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        focusPublicationTask?.cancel()
        focusPublicationTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        task = nil
        failedTask.cancel(with: .goingAway, reason: nil)
        session?.invalidateAndCancel()
        session = nil
        usbEditorSupported = false
        usbWifiAddressSupported = false
        finishEditorCommand(.failure(USBEditorError.disconnected))
        usbBridge?.stop()
        usbBridge = nil
        if restoreSavedEndpoint() { return }
        scheduleReconnect()
    }

    private func releaseCoughButton() {
        if supportsOBSCough {
            supportsOBSCough = false
            resources.abandonOBSCough(from: ObjectIdentifier(self))
        }
        guard supportsCoughButton else { return }
        supportsCoughButton = false
        _ = resources.setCoughButtonValue(0, from: ObjectIdentifier(self))
    }

    private func resetAppIconTransferState(clearPendingRequests: Bool = false) {
        appIconData = nil
        appIconIdentifier = ""
        activeAppIconRequest = nil
        appIconOffset = 0
        if clearPendingRequests { pendingAppIconRequests.removeAll() }
    }

    private func scheduleReconnect() {
        guard !hasTerminalConnectionError else { discovery.stop(); return }
        // Pairing failures deliberately close their unauthenticated socket.
        // Keep the specific server error visible instead of replacing it with
        // a generic disconnect message during that expected teardown.
        guard shouldReconnect else { return }
        guard preferences.hasSavedPairing else {
            updateConnectionStatus("Display disconnected", state: .disconnected)
            return
        }
        if CompanionUSBPort.path(from: preferences.panelHost) == nil {
            let savedFingerprint = preferences.stringPreference(forKey: certificateFingerprintKey)
            // A name refresh can keep an earlier discovery session open.
            endpointRecovery.discovered(discovery.displays, expectedFingerprint: savedFingerprint)
            discovery.onChange = { [weak self] displays in
                guard let self, self.shouldReconnect, !self.hasTerminalConnectionError else { return }
                self.endpointRecovery.discovered(displays, expectedFingerprint: savedFingerprint)
            }
            discovery.start()
        }
        guard reconnectTask == nil else { return }
        updateConnectionStatus("Display unavailable — reconnecting…", state: .reconnecting)
        reconnectTask = Task { [weak self] in
            guard let self else { return }
            let delay = ReconnectBackoff.delaySeconds(
                attempt: self.reconnectAttempt,
                randomUnit: Double.random(in: 0...1)
            )
            self.reconnectAttempt += 1
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled, self.shouldReconnect else { return }
            self.reconnectTask = nil
            self.startConnection(mode: .authenticate, resetBackoff: false)
        }
    }

    private func handle(_ message: String) async {
        guard await handleJSON(message) else {
            if restoreSavedEndpoint() { return }
            hasTerminalConnectionError = true
            shouldReconnect = false
            tearDownConnection()
            updateConnectionStatus("Display sent an unsupported protocol message", state: .failed, recovery: "Update EspDesktop and your display to matching versions, then reconnect.")
            return
        }
    }

    private func handleJSON(_ message: String) async -> Bool {
        let state: CompanionProtocolState = sessionAuthenticated ? .connected : {
            if case .pair = mode { return .pairing }
            return .authenticating
        }()
        guard let data = message.data(using: .utf8),
              let decoded = CompanionProtocolDecoder.decode(data, direction: .panelToMac, state: state),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else { return false }
        print("[EspDesktop] Received \(type)")
        switch decoded {
        case .hello:
            break
        case .pairAccepted(let payload):
            guard let credential = Data(hex: payload.credential) else { updateConnectionStatus("Pairing failed", state: .failed); return true }
            guard let fingerprint = pendingCertificateFingerprint else { updateConnectionStatus("Pairing failed", state: .failed); return true }
            let pairingAccount = preferences.newPairingAccount
            guard credentials.save(credential, account: pairingAccount) else {
                updateConnectionStatus("Pairing failed: the credential could not be saved in Keychain", state: .failed, recovery: "Unlock your Mac and allow EspDesktop to access Keychain, then try again.")
                return true
            }
            preferences.setPreference(fingerprint, forKey: "companion.certificateFingerprint.\(pairingAccount)")
            preferences.removePreference(forKey: "companion.authenticationSequence.\(pairingAccount)")
            preferences.rememberPairingAccount(pairingAccount)
            pendingCertificateFingerprint = nil
            updateConnectionStatus("Paired — reconnecting", state: .connecting)
            connect(mode: .authenticate)
        case .authAccepted(let payload):
            guard case .authenticate = mode, authenticationRequestOutstanding else { return false }
            authenticationRequestOutstanding = false
            sessionAuthenticated = true
            usbEditorSupported = payload.usbEditor == true
            usbWifiAddressSupported = payload.usbWifiAddress == true
            supportsAlphaAppIcons = payload.capabilityVersion >= 4
            supportsHighResolutionAppIcons = payload.capabilityVersion >= 5
            supportsImmediateApplicationFocus = payload.capabilityVersion >= 6
            supportsSessionLock = payload.capabilityVersion >= 7
            supportsPairingReset = payload.capabilityVersion >= 8
            expandedShortcutsSupported = payload.capabilityVersion >= 9
            onDemandShortcutsSupported = payload.capabilityVersion >= 23
            supportsOBSCards = payload.capabilityVersion >= 13
            supportsOBSFaders = payload.capabilityVersion >= 14
            supportsOBSCough = payload.capabilityVersion >= 16
            supportsOBSOutputs = payload.capabilityVersion >= 17
            supportsOBSBreak = payload.capabilityVersion >= 18
            supportsOBSAdaptiveScenes = payload.capabilityVersion >= 19
            peerCapabilityVersion = payload.capabilityVersion
            lastOBSAudioValues.removeAll()
            appVolumeSupported = payload.capabilityVersion >= 10
            supportsCoughButton = payload.capabilityVersion >= 11
            supportsInputDevices = payload.capabilityVersion >= 12
            appleShortcutsSupported = payload.capabilityVersion >= 24
            // A Bonjour TXT record never authorizes a location change. Both the
            // pinned TLS certificate and the authenticated session must agree.
            let expectedFingerprint = preferences.stringPreference(forKey: certificateFingerprintKey)
            if let endpoint = pendingEndpoint ?? endpointRecovery.authenticatedEndpoint(
                expectedFingerprint: expectedFingerprint) {
                preferences.panelHost = endpoint
            }
            if let displayName = endpointRecovery.authenticatedDisplayName(
                expectedFingerprint: expectedFingerprint) {
                preferences.setPreference(displayName, forKey: displayNameKey)
            }
            pendingEndpoint = nil
            endpointRecovery = CompanionEndpointRecovery()
            if usbBridge == nil { refreshDisplayName(expectedFingerprint: expectedFingerprint) }
            connectionTimeoutTask?.cancel()
            connectionTimeoutTask = nil
            reconnectAttempt = 0
            let message = usbBridge == nil ? "Connected to \(preferences.panelHost)" : "Connected over USB"
            updateConnectionStatus(message, state: .connected)
            let capabilityVersion = payload.capabilityVersion
            onEvent?(.capabilities(systemMetrics: capabilityVersion >= 2))
            remoteCatalogueDefinitionsSupported = Self.supportsRemoteCatalogueDefinitions(
                capabilityVersion: capabilityVersion
            )
            if let task { startHeartbeat(for: task) }
            publishTimezone()
            publishCatalogue()
            onEvent?(.publishCurrentState)
        case .catalogueRequest:
            guard sessionAuthenticated else { return false }
            publishCatalogue()
        case .shortcutCatalogueRequest(let payload):
            guard sessionAuthenticated, onDemandShortcutsSupported else { return false }
            publishShortcutCataloguePage(payload)
        case .focusTargets(let payload):
            guard sessionAuthenticated else { return false }
            let targets = payload.items.compactMap { item -> (id: String, url: URL)? in
                guard item.id.hasPrefix("urlcard."),
                      item.id.range(of: #"^urlcard\.[0-9a-f]{16}$"#, options: .regularExpression) != nil,
                      item.url.utf8.count <= 128,
                      let url = URL(string: item.url),
                      (url.scheme == "http" || url.scheme == "https"), url.host != nil else { return nil }
                return (item.id, url)
            }
            focusTargets = Array(targets.prefix(64))
            publishFocusedAction(invalidatePendingQuery: true)
        case .actionInvoke(let payload):
            guard sessionAuthenticated else { return false }
            let requestIdentifier = payload.requestId
            let kind = payload.kind
            if kind == "action", let actionIdentifier = payload.actionId {
                if (actionIdentifier.hasPrefix("obs.") && !supportsOBSCards) ||
                    (actionIdentifier.hasPrefix("obs.output.") && !supportsOBSOutputs) ||
                    (actionIdentifier.hasPrefix("obs.brb.") && !supportsOBSBreak) ||
                    (actionIdentifier.hasPrefix(OBSConnection.AdaptiveScene.prefix) && !supportsOBSAdaptiveScenes) {
                    sendJSON(["type": "action.result", "requestId": requestIdentifier, "status": "not_allowed"])
                    return true
                }
                let requestingTask = task
                Task { [weak self, weak requestingTask] in
                    guard let self, let requestingTask, self.task === requestingTask, self.sessionAuthenticated else { return }
                    if actionIdentifier.hasPrefix(AppleShortcut.actionPrefix), !self.appleShortcutsSupported {
                        self.sendJSON(["type": "action.result", "requestId": requestIdentifier, "status": "not_allowed"])
                        return
                    }
                    let status: String
                    if actionIdentifier.hasPrefix("obs.output.") || actionIdentifier.hasPrefix("obs.brb.") ||
                        actionIdentifier.hasPrefix("obs.take.") ||
                        actionIdentifier.hasPrefix(OBSConnection.AdaptiveScene.prefix) ||
                        actionIdentifier.hasPrefix(OBSConnection.studioModeID + ".") ||
                        actionIdentifier.hasPrefix(OBSConnection.transitionID + ".") ||
                        actionIdentifier.hasPrefix(OBSConnection.sourcePrefix) ||
                        actionIdentifier.hasPrefix(OBSConnection.replayBufferID + ".") {
                        let performed = await self.resources.performGuardedOBSAction(actionIdentifier: actionIdentifier) {
                            self.task === requestingTask && self.sessionAuthenticated
                        }
                        status = performed ? "performed" : "not_allowed"
                    } else {
                        status = await self.resources.performResultStatus(
                            actionIdentifier: actionIdentifier,
                            folderOpenBehavior: payload.folderOpenBehavior ?? "new_window",
                            shortcutAppID: payload.appId
                        )
                    }
                    guard self.task === requestingTask, self.sessionAuthenticated else { return }
                    self.sendJSON(["type": "action.result", "requestId": requestIdentifier, "status": status])
                    if status == "activated" {
                        // Activation is confirmed now; do not wait for the next focus poll.
                        self.publishFocusedAction(invalidatePendingQuery: true)
                    }
                }
            } else if kind == "url", let encodedURL = payload.encodedUrl {
                let requestingTask = task
                Task { [weak self, weak requestingTask] in
                    guard let self, let requestingTask, self.task === requestingTask, self.sessionAuthenticated else { return }
                    let opened = await self.resources.openURL(
                        encodedURL: encodedURL, newWindow: payload.urlOpenBehavior == "new_window"
                    )
                    guard self.task === requestingTask, self.sessionAuthenticated else { return }
                    self.sendJSON(["type": "action.result", "requestId": requestIdentifier,
                                   "status": opened ? "opened" : "not_allowed"])
                }
            } else { return false }
        case .appIconRequest(let payload):
            guard sessionAuthenticated else { return false }
            if let index = pendingAppIconRequests.firstIndex(where: { $0.appId == payload.appId }) {
                pendingAppIconRequests[index] = payload
            } else {
                pendingAppIconRequests.append(payload)
            }
            processNextAppIconRequest()
        case .appIconAck(let payload):
            guard sessionAuthenticated else { return false }
            if payload.generation == appIconGeneration, Int(payload.nextOffset) == appIconOffset {
                sendNextAppIconChunk()
            }
        case .appIconAbort(let payload):
            guard sessionAuthenticated else { return false }
            guard payload.appId == appIconIdentifier,
                  payload.generation == appIconGeneration else { return true }
            appIconData = nil
            appIconIdentifier = ""
            appIconOffset = 0
            processNextAppIconRequest()
        case .valueSet(let payload):
            guard sessionAuthenticated else { return false }
            let requestIdentifier = payload.requestId
            let controlIdentifier = payload.controlId
            let value = Int(payload.value)
            if OBSConnection.coughInputUUID(for: controlIdentifier) != nil {
                guard supportsOBSCough, let requestingTask = task else { return false }
                let changed = await resources.setOBSCough(value, controlIdentifier: controlIdentifier,
                                                          from: ObjectIdentifier(self))
                guard task === requestingTask, sessionAuthenticated else { return true }
                if value != 50 {
                    publishOBSAudioValues(resources.obsAudioValues(), forceControl: controlIdentifier)
                }
                sendJSON(["type": "action.result", "requestId": requestIdentifier,
                          "status": changed ? "performed" : "not_allowed"])
                return true
            }
            if OBSConnection.faderInputUUID(for: controlIdentifier) != nil {
                guard supportsOBSFaders, let requestingTask = task else { return false }
                Task { [weak self, weak requestingTask] in
                    guard let self, let requestingTask, self.task === requestingTask,
                          self.sessionAuthenticated else { return }
                    let changed = await self.resources.setOBSFader(value, controlIdentifier: controlIdentifier)
                    guard self.task === requestingTask, self.sessionAuthenticated else { return }
                    // A rejected or unchanged drag still needs to settle the panel at the confirmed value.
                    self.publishOBSAudioValues(self.resources.obsAudioValues(), forceControl: controlIdentifier)
                    self.sendJSON(["type": "action.result", "requestId": requestIdentifier,
                                   "status": changed ? "performed" : "not_allowed"])
                }
                return true
            }
            if CompanionProtocolDecoder.appVolumeBundleIdentifier(controlIdentifier) != nil && !appVolumeSupported {
                return false
            }
            if CompanionProtocolDecoder.isInputDeviceControl(controlIdentifier) && !supportsInputDevices { return false }
            let activeTask = task
            let changed = if controlIdentifier == SystemMediaController.coughID {
                supportsCoughButton && resources.setCoughButtonValue(value, from: ObjectIdentifier(self))
            } else {
                await resources.setMediaControlValue(value, controlIdentifier: controlIdentifier)
            }
            guard task === activeTask, sessionAuthenticated else { return true }
            sendJSON(["type": "action.result", "requestId": requestIdentifier,
                      "status": changed ? "performed" : "not_allowed"])
        case .error(let payload):
            let code = payload.code
            if code == "pairing_reset_failed" { finishPairingResetRequest() }
            if Self.requiresNewPairing(errorCode: code, authenticated: sessionAuthenticated,
                                       authenticating: authenticationRequestOutstanding) {
                if restoreSavedEndpoint() { return true }
                let isForgetting = pairingResetCompletion != nil
                hasTerminalConnectionError = true
                shouldReconnect = false
                tearDownConnection()
                if !isForgetting {
                    updateConnectionStatus("Display needs to be paired again", state: .needsPairing,
                                           recovery: Self.rePairingInstructions)
                }
            } else if code == "authentication_sequence",
               let panelSequence = payload.lastSequence,
               panelSequence < UInt32.max {
                preferences.setPreference(Int(panelSequence), forKey: authenticationSequenceKey)
                updateConnectionStatus("Authentication counter repaired — reconnecting", state: .reconnecting)
                connect(mode: .authenticate)
            } else {
                let message = code.replacingOccurrences(of: "_", with: " ")
                if sessionAuthenticated {
                    onEvent?(.status(message))
                } else {
                    if restoreSavedEndpoint() { return true }
                    hasTerminalConnectionError = true
                    shouldReconnect = false
                    tearDownConnection()
                    updateConnectionStatus(message, state: .failed)
                }
            }
        case .artworkAck, .artworkAbort, .artworkRequest:
            // Older panels can still send these protocol v4 messages.
            guard sessionAuthenticated else { return false }
        default:
            return false
        }
        return true
    }

    private static let rePairingInstructions = "Select Re-pair to reconnect."

    nonisolated static func requiresNewPairing(errorCode: String, authenticated: Bool, authenticating: Bool) -> Bool {
        switch errorCode {
        case "pairing_reset": return authenticated || authenticating
        case "authentication_failed": return authenticating
        default: return false
        }
    }

    func publishSystemMetrics(_ snapshot: CompanionSystemMetricsSnapshot, force: Bool = false) {
        let now = Date()
        let elapsed = now.timeIntervalSince(lastSystemMetricsPublication)
        guard force || Self.shouldPublishSystemMetrics(
            previous: lastPublishedSystemMetrics,
            current: snapshot,
            elapsedSeconds: elapsed
        ) else { return }
        lastPublishedSystemMetrics = snapshot
        lastSystemMetricsPublication = now
        var message: [String: Any] = [
            "type": "system_metrics", "generation": snapshot.generation,
            "cpuUsagePercent": snapshot.cpuUsagePercent,
            "memoryUsagePercent": snapshot.memoryUsagePercent,
            "storageUsagePercent": snapshot.storageUsagePercent,
            "storageDevices": snapshot.storageDevices.map {
                ["id": $0.id, "label": $0.label, "usagePercent": $0.usagePercent] as [String: Any]
            },
        ]
        message["networkInterfaces"] = snapshot.networkInterfaces.map {
            ["id": $0.id, "label": $0.label, "address": $0.address]
        }
        if let battery = snapshot.batteryPercent { message["batteryPercent"] = battery }
        if let throughput = snapshot.networkThroughputKBps {
            message["networkThroughputKBps"] = throughput
        }
        sendJSON(message)
    }

    func publishSystemMetricsUnavailable() {
        sendJSON(["type": "system_metrics", "generation": 1, "available": false])
    }

    private func sendNextAppIconChunk() {
        guard let data = appIconData else { return }
        if appIconOffset >= data.count {
            sendJSON(["type": "app_icon.end", "appId": appIconIdentifier,
                      "generation": appIconGeneration])
            resetAppIconTransferState()
            processNextAppIconRequest()
            return
        }
        let end = min(appIconOffset + CompanionCapabilities.appIconChunkBytes, data.count)
        var frame = Data("ICON".utf8)
        var generation = appIconGeneration.bigEndian
        var offset = UInt32(appIconOffset).bigEndian
        withUnsafeBytes(of: &generation) { frame.append(contentsOf: $0) }
        withUnsafeBytes(of: &offset) { frame.append(contentsOf: $0) }
        frame.append(data[appIconOffset..<end])
        appIconOffset = end
        guard let sendingTask = task else {
            resetAppIconTransferState(clearPendingRequests: true)
            return
        }
        sendingTask.send(.data(frame)) { [weak self, weak sendingTask] error in
            guard error != nil else { return }
            Task { @MainActor [weak self, weak sendingTask] in
                guard let self, let sendingTask, self.task === sendingTask else { return }
                self.handleConnectionFailure(for: sendingTask, reason: "App icon chunk send failed")
            }
        }
    }

    private func processNextAppIconRequest() {
        guard sessionAuthenticated, appIconData == nil, !pendingAppIconRequests.isEmpty else { return }
        handleAppIconRequest(pendingAppIconRequests.removeFirst())
    }

    private func handleAppIconRequest(_ payload: CompanionWireAppIconRequest) {
        let pixelSide = supportsHighResolutionAppIcons
            ? CompanionCapabilities.appIconSide : CompanionCapabilities.appIconLegacySide
        guard supportsAlphaAppIcons,
              resources.launchableApps().contains(where: { $0.bundleIdentifier == payload.appId }),
              let pixels = resources.appIconPixels(bundleIdentifier: payload.appId, pixelSide: pixelSide),
              pixels.count == pixelSide * pixelSide * 3 else {
            sendJSON(["type": "app_icon.unavailable", "appId": payload.appId])
            processNextAppIconRequest()
            return
        }
        let transferPixels = pixels
        let transferFormat = "rgb565a8"
        let hash = SHA256.hash(data: transferPixels).map { String(format: "%02x", $0) }.joined()
        if payload.sha256 == hash {
            sendJSON(["type": "app_icon.unchanged", "appId": payload.appId, "sha256": hash])
            processNextAppIconRequest()
            return
        }
        appIconGeneration &+= 1
        if appIconGeneration == 0 { appIconGeneration = 1 }
        appIconIdentifier = payload.appId
        activeAppIconRequest = payload
        appIconData = transferPixels
        appIconOffset = 0
        sendJSON(["type": "app_icon.begin", "appId": payload.appId,
                  "generation": appIconGeneration, "byteLength": transferPixels.count,
                  "sha256": hash, "format": transferFormat])
    }

    func publishSessionLock(_ locked: Bool, displayAwake: Bool?) {
        guard sessionAuthenticated, supportsSessionLock else { return }
        var message: [String: Any] = ["type": "session.lock", "locked": locked]
        if let displayAwake { message["displayAwake"] = displayAwake }
        sendJSON(message)
    }

    private func sendJSON(_ object: [String: Any]) {
        var envelope = object
        envelope["protocol"] = CompanionCapabilities.protocolVersion
        guard JSONSerialization.isValidJSONObject(envelope),
              let data = try? JSONSerialization.data(withJSONObject: envelope), data.count <= Self.maximumTextFrameBytes,
              let value = String(data: data, encoding: .utf8) else { return }
        let state: CompanionProtocolState = sessionAuthenticated ? .connected : {
            if case .pair = mode { return .pairing }; return .authenticating
        }()
        guard CompanionProtocolDecoder.decode(data, direction: .macToPanel, state: state) != nil else { return }
        send(value)
    }

    func publishCatalogue(obsActions: [OBSConnection.CatalogueEntry]? = nil, includeDefinitions: Bool = true) {
        // An initial empty scan is provisional; publishing it would prune the
        // panel's persistent icons before discovery supplies the real app list.
        guard resources.applicationCatalogueReady else { return }
        guard sessionAuthenticated || task != nil else { return }
        if obsActions != nil && (!sessionAuthenticated || !supportsOBSCards) { return }
        if obsActions == nil { applicationFocusPublisher.reset() }
        var capabilities = ["keyboard_shortcuts"]
        capabilities.append(CompanionCapabilities.appIconsCapability)
        capabilities.append(CompanionCapabilities.appIconsAlphaCapability)
        capabilities.append(CompanionCapabilities.appIconsHighResolutionCapability)
        capabilities.append("url_card_focus")
        if onDemandShortcutsSupported { capabilities.append("shortcut_catalogue_on_demand") }
        if supportsOBSCards { capabilities.append("obs_scene_cards") }
        if supportsOBSOutputs { capabilities.append("obs_output_controls") }
        if supportsOBSBreak { capabilities.append("obs_brb") }
        if obsActions == nil { sendJSON(["type": "capabilities", "values": capabilities]) }
        let obsOnly = obsActions != nil && peerCapabilityVersion >= 22
        let supportedOBSActions = supportsOBSCards ? obsActions ?? resources.obsControlActions() : []
        let obsEntries: [[String: Any]] = supportedOBSActions.filter { entry in
            (supportsOBSFaders || OBSConnection.faderInputUUID(for: entry.id) == nil) &&
            (supportsOBSCough || OBSConnection.coughInputUUID(for: entry.id) == nil) &&
            (supportsOBSOutputs || !entry.id.hasPrefix("obs.output.")) &&
            (supportsOBSBreak || !(entry.id == "obs.brb" || entry.id.hasPrefix("obs.brb."))) &&
            (supportsOBSAdaptiveScenes || !entry.id.hasPrefix(OBSConnection.AdaptiveScene.prefix))
        }.map { entry in
            var fields: [String: Any] = ["id": entry.id, "label": Self.catalogueLabel(entry.label, fallback: "OBS scene")]
            if let state = entry.state, peerCapabilityVersion >= state.minimumCapability {
                fields["obsState"] = state.rawValue
                if let detail = entry.detail {
                    fields["obsDetail"] = Self.catalogueLabel(detail, fallback: "Unavailable")
                }
                if let available = entry.available { fields["obsAvailable"] = available }
            }
            return fields
        }
        // The browser receives identifiers, never application paths or shell commands.
        let apps = obsOnly ? [] : resources.launchableApps()
        let inputs: [[String: String]] = !obsOnly && supportsInputDevices ? resources.inputDeviceActions().map {
            ["id": $0.id, "label": Self.catalogueLabel($0.label, fallback: "Input device")]
        } : []
        let appleShortcuts: [[String: Any]] = !obsOnly && appleShortcutsSupported
            ? resources.appleShortcutActions().map { shortcut in
                var fields: [String: Any] = [
                    "id": shortcut.actionIdentifier, "label": Self.catalogueLabel(shortcut.name, fallback: "Apple Shortcut"),
                ]
                if let color = shortcut.color { fields["shortcutColor"] = color }
                return fields
            }
            : []
        let folders = obsOnly ? [] : resources.folderActions()
        let entries: [[String: String]] = folders.compactMap { folder -> [String: String]? in
            guard Self.validCatalogueIdentifier(folder.actionIdentifier) else { return nil }
            return ["id": folder.actionIdentifier, "label": Self.catalogueLabel(folder.name, fallback: "Folder")]
        } + apps.compactMap { app -> [String: String]? in
            guard Self.validCatalogueIdentifier(app.bundleIdentifier) else { return nil }
            return ["id": app.bundleIdentifier, "label": Self.catalogueLabel(app.name, fallback: app.bundleIdentifier)]
        }
        // Older panels share a limit across Mac and OBS actions. Keep their
        // existing application order before appending the OBS catalogue.
        let catalogue = (inputs + entries).map { $0 as [String: Any] } + appleShortcuts + obsEntries
        catalogueGeneration &+= 1
        if catalogueGeneration == 0 { catalogueGeneration = 1 }
        let pageSize = appleShortcutsSupported ? 16 : 48
        let pages = stride(from: 0, to: max(catalogue.count, 1), by: pageSize).map {
            Array(catalogue[$0..<min($0 + pageSize, catalogue.count)])
        }
        for (page, items) in pages.enumerated() {
            var message: [String: Any] = ["type": "catalogue.page", "generation": catalogueGeneration,
                                         "page": page, "complete": page == pages.count - 1, "items": items]
            if obsOnly { message["scope"] = "obs" }
            if !obsOnly && page == pages.count - 1 && resources.applicationCatalogueProvisional {
                message["appsProvisional"] = true
            }
            sendJSON(message)
        }
        if obsOnly { return }
        if includeDefinitions && obsActions == nil && remoteCatalogueDefinitionsSupported && !onDemandShortcutsSupported {
            let definitions = resources.remoteCompanionCatalogues().applicationsForDisplay(approvedApps: apps)
            let installedIDs = Set(apps.map(\.bundleIdentifier))
            let starter = definitions.map(\.starter)
            let expanded = expandedShortcutsSupported ? definitions.filter { app in
                installedIDs.contains(app.appId) ||
                    (app.appId == "com.apple.Safari.WebApp" && installedIDs.contains {
                        $0 != "com.apple.Safari" && CompanionKeyboardShortcut.isSafariApplication($0)
                    }) ||
                    (app.appId == "com.adobe.PremierePro" && installedIDs.contains {
                        CompanionKeyboardShortcut.scopedTargetMatches(app.appId, frontmost: $0, approved: installedIDs)
                    })
            }.flatMap { $0.expandedPages() } : []
            let encoder = JSONEncoder()
            let payloads: [(String, Data)] = (starter + expanded).prefix(256).compactMap { app in
                guard let data = try? encoder.encode(app), data.count <= 12_000 else { return nil }
                return ("application", data)
            }
            let definitionPages = max(payloads.count, 1)
            definitionGeneration &+= 1
            if definitionGeneration == 0 { definitionGeneration = 1 }
            for page in 0..<definitionPages {
                let items: [[String: String]]
                if page < payloads.count, let json = String(data: payloads[page].1, encoding: .utf8) {
                    items = [["kind": payloads[page].0, "json": json]]
                } else {
                    items = []
                }
                sendJSON(["type": "catalogue.definitions.page", "generation": definitionGeneration,
                          "page": page, "complete": page == definitionPages - 1, "items": items])
            }
        }
        publishFocusedAction()
    }

    private func publishShortcutCataloguePage(_ request: CompanionWireShortcutCatalogueRequest) {
        let catalogue = resources.remoteCompanionCatalogues()
        sendJSON(catalogue.shortcutPageResponse(request, approvedApps: resources.launchableApps()))
    }

    nonisolated static func supportsRemoteCatalogueDefinitions(capabilityVersion: UInt32) -> Bool {
        capabilityVersion >= 5
    }

    func publishTimezone() {
        let identifier = TimeZone.current.identifier
        guard !identifier.isEmpty, identifier.utf8.count <= 96 else { return }
        sendJSON(["type": "timezone.changed", "identifier": identifier])
    }

    func publishFocusedAction(invalidatePendingQuery: Bool = false,
                              activatedApplicationIdentifier: String? = nil) {
        // App-card colour is independent of the slower folder/tab lookup.
        // This message is visual-only: it cannot authorize a shortcut or open
        // an app subpage before the existing detailed query confirms its target.
        if sessionAuthenticated, supportsImmediateApplicationFocus,
           let application = activatedApplicationIdentifier ?? resources.immediateFocusedApplicationIdentifier(),
           Self.validCatalogueIdentifier(application) || application.isEmpty {
            applicationFocusPublisher.publish(application) { identifier in
                self.sendJSON(["type": "focus.changed", "actionId": identifier,
                               "actionIds": identifier.isEmpty ? [] : [identifier], "applicationOnly": true])
            }
        }
        if invalidatePendingQuery {
            // A new foreground app must not wait for an obsolete browser/Finder query.
            focusPublicationTask?.cancel()
            focusPublicationTask = nil
        }
        guard sessionAuthenticated, focusPublicationTask == nil, let requestingTask = task else { return }
        focusPublicationTask = Task { [weak self, weak requestingTask] in
            guard let self else { return }
            let focused = await self.resources.focusedCompanionActionIdentifiers(for: self.focusTargets)
            guard !Task.isCancelled, let requestingTask, self.task === requestingTask,
                  self.sessionAuthenticated else { return }
            self.focusPublicationTask = nil
            var identifiers: [String] = []
            for identifier in focused where identifiers.count < 64 {
                if !identifier.isEmpty && !identifiers.contains(identifier) { identifiers.append(identifier) }
            }
            guard identifiers.allSatisfy(Self.validCatalogueIdentifier) else { return }
            self.applicationFocusPublisher.publishDetails(identifiers) { confirmed in
                self.sendJSON(["type": "focus.changed", "actionId": confirmed.first ?? "", "actionIds": confirmed])
            }
        }
    }

    func publishOBSAudioValues(_ values: [String: Int], force: Bool = false, forceControl: String? = nil) {
        guard supportsOBSFaders, sessionAuthenticated else { return }
        let values = values.filter { supportsOBSCough || OBSConnection.coughInputUUID(for: $0.key) == nil }
        var removed = Set(lastOBSAudioValues.keys.filter { values[$0] == nil })
        if let forceControl, values[forceControl] == nil { removed.insert(forceControl) }
        for id in removed.sorted() {
            sendJSON(["type": "value.state", "controlId": id, "available": false])
        }
        for (id, value) in values.sorted(by: { $0.key < $1.key })
            where force || id == forceControl || lastOBSAudioValues[id] != value {
            sendJSON(["type": "value.state", "controlId": id, "available": true, "value": value])
        }
        lastOBSAudioValues = values
    }

    func publishMediaControlValues(_ values: [String: Int], unavailable: Set<String>) {
        for identifier in unavailable.sorted() where validMediaControlIdentifier(identifier) {
            sendJSON(["type": "value.state", "controlId": identifier, "available": false])
        }
        for (identifier, value) in values.sorted(by: { $0.key < $1.key }) {
            guard validMediaControlIdentifier(identifier), (0...100).contains(value) else { continue }
            sendJSON(["type": "value.state", "controlId": identifier, "available": true, "value": value])
        }
    }

    private func send(_ value: String) {
        guard let activeTask = task else { return }
        activeTask.send(.string(value)) { [weak self, weak activeTask] error in
            guard let error else { return }
            let reason = "Send failed: \(error.localizedDescription)"
            Task { @MainActor [weak self, weak activeTask] in
                guard let self, let activeTask, self.task === activeTask else { return }
                self.handleConnectionFailure(for: activeTask, reason: reason)
            }
        }
    }

    nonisolated static func shouldPublishSystemMetrics(
        previous: CompanionSystemMetricsSnapshot?,
        current: CompanionSystemMetricsSnapshot,
        elapsedSeconds: TimeInterval
    ) -> Bool {
        guard let previous else { return true }
        if current.networkInterfaces != previous.networkInterfaces { return true }
        if elapsedSeconds >= 30 { return true }
        if abs(current.cpuUsagePercent - previous.cpuUsagePercent) >= 1 { return true }
        if abs(current.memoryUsagePercent - previous.memoryUsagePercent) >= 0.5 { return true }
        if current.storageDevices.count != previous.storageDevices.count { return true }
        for (currentDevice, previousDevice) in zip(current.storageDevices, previous.storageDevices) {
            if currentDevice.id != previousDevice.id || currentDevice.label != previousDevice.label ||
                abs(currentDevice.usagePercent - previousDevice.usagePercent) >= 0.1 { return true }
        }
        if abs(current.storageUsagePercent - previous.storageUsagePercent) >= 0.1 { return true }
        if optionalDifference(current.batteryPercent, previous.batteryPercent) >= 1 { return true }
        if optionalDifference(current.networkThroughputKBps, previous.networkThroughputKBps) >= 32 { return true }
        return false
    }

    nonisolated private static func optionalDifference(_ lhs: Double?, _ rhs: Double?) -> Double {
        guard let lhs, let rhs else { return lhs == nil && rhs == nil ? 0 : .infinity }
        return abs(lhs - rhs)
    }

    private var certificateFingerprintKey: String { "companion.certificateFingerprint.\(preferences.pairingAccount)" }
    private var authenticationSequenceKey: String { "companion.authenticationSequence.\(preferences.pairingAccount)" }
    private var displayNameKey: String { "panelDisplayName" }

    private func refreshDisplayName(expectedFingerprint: String?) {
        guard let expectedFingerprint else { return }
        discovery.onChange = { [weak self] displays in
            guard let self, self.sessionAuthenticated else { return }
            // Keep the pinned display's newest endpoint for reconnects too.
            // The browser may already be active when scheduleReconnect runs.
            self.endpointRecovery.discovered(displays, expectedFingerprint: expectedFingerprint)
            guard let display = displays.first(where: { $0.id == expectedFingerprint }) else { return }
            self.preferences.setPreference(display.name, forKey: self.displayNameKey)
        }
        discovery.start()
    }

    private func nextAuthenticationSequence() -> UInt32 {
        let previous = UInt32(clamping: preferences.integerPreference(forKey: authenticationSequenceKey))
        let next = previous &+ 1
        preferences.setPreference(Int(next), forKey: authenticationSequenceKey)
        return next
    }

    private static func validCatalogueIdentifier(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 96 && value.utf8.allSatisfy {
            $0 >= 0x20 && $0 <= 0x7e && $0 != 0x7c && $0 != 0x3a && $0 != 0x2c
        }
    }

    private func validMediaControlIdentifier(_ value: String) -> Bool {
        if CompanionProtocolDecoder.isInputDeviceControl(value) { return supportsInputDevices }
        if value == SystemMediaController.coughID { return supportsCoughButton }
        return SystemMediaController.volumeControlIDs.contains(value) ||
            (appVolumeSupported && CompanionProtocolDecoder.appVolumeBundleIdentifier(value) != nil)
    }

    private static func catalogueLabel(_ value: String, fallback: String) -> String {
        var sanitized = ""
        for scalar in value.unicodeScalars {
            guard scalar.value >= 0x20 && scalar.value <= 0x10ffff,
                  scalar.value != 0x7c && scalar.value != 0x3a && scalar.value != 0x2c else { continue }
            let candidate = sanitized + String(scalar)
            guard candidate.utf8.count <= 96 else { break }
            sanitized = candidate
        }
        sanitized = sanitized.trimmingCharacters(in: .whitespacesAndNewlines)
        return sanitized.isEmpty ? fallback : sanitized
    }
}

private extension Data {
    init?(hex: String) {
        guard hex.count.isMultiple(of: 2) else { return nil }
        var result = Data(); result.reserveCapacity(hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
            result.append(byte); index = next
        }
        self = result
    }
}
