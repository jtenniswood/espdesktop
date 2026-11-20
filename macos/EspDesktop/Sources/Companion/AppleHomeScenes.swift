import AppKit
import Network
import Security
import SwiftUI

@MainActor
final class AppleHomeScenes: ObservableObject {
    private static let helperBundleID = "io.espdesktop.home"
    private static let approvalsKey = "appleHome.approvedDisplays"
    private static let cardsKey = "appleHome.cards"
    private static let inactive = UUID(uuid: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))

    @Published private(set) var status: AppleHomeSceneMessage.Status?
    @Published private(set) var canChooseHome = false
    @Published private(set) var note = ""
    @Published private(set) var approvals: [String: UUID]
    @Published private(set) var controls: [AppleHomeControl] = []
    @Published private(set) var cardLabels: [String: [UUID: String]]
    var onControlsChanged: (() -> Void)?
    var onContinueSetup: (() -> Void)?
    private var incomingControls: [AppleHomeControl]?
    private let defaults: UserDefaults
    private var listener: NWListener?
    private var peer: AppleHomeSceneChannel?
    private var helper: NSRunningApplication?
    private var bindingSet: UUID?
    private var runningAction = false
    private var pendingRun: (UUID, CheckedContinuation<AppleHomeSceneMessage?, Never>)?

    init(defaults: UserDefaults) {
        self.defaults = defaults
        approvals = (defaults.dictionary(forKey: Self.approvalsKey) as? [String: String] ?? [:])
            .compactMapValues(UUID.init(uuidString:))
        cardLabels = defaults.data(forKey: Self.cardsKey).flatMap {
            try? JSONDecoder().decode([String: [UUID: String]].self, from: $0)
        } ?? [:]
    }

    static var helperURL: URL? {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: helperBundleID) else { return nil }
        var mainCode: SecStaticCode?
        var helperCode: SecStaticCode?
        var information: CFDictionary?
        guard SecStaticCodeCreateWithPath(Bundle.main.bundleURL as CFURL, [], &mainCode) == errSecSuccess,
              let mainCode,
              SecCodeCopySigningInformation(mainCode, SecCSFlags(rawValue: kSecCSSigningInformation), &information) == errSecSuccess,
              let team = (information as? [String: Any])?[kSecCodeInfoTeamIdentifier as String] as? String,
              team.range(of: "^[A-Z0-9]{10}$", options: .regularExpression) != nil,
              SecStaticCodeCreateWithPath(url as CFURL, [], &helperCode) == errSecSuccess,
              let helperCode else { return nil }
        let requirementText = "anchor apple generic and identifier \"\(helperBundleID)\" and certificate leaf[subject.OU] = \"\(team)\""
        var requirement: SecRequirement?
        guard SecRequirementCreateWithString(requirementText as CFString, [], &requirement) == errSecSuccess,
              SecStaticCodeCheckValidity(helperCode, [], requirement) == errSecSuccess else { return nil }
        return url
    }

    var canRestore: Bool { approvals.values.contains { $0 != Self.inactive } }
    var readyBinding: UUID? { status == .ready ? bindingSet : nil }

    private var setupNeedsNoHomeChoice: Bool {
        !canChooseHome && (status == .ready || status == .empty)
    }

    func connect(activate: Bool = true) {
        guard listener == nil else {
            if activate {
                helper?.unhide()
                helper?.activate(options: [])
            }
            return
        }
        guard let url = Self.helperURL else {
            note = "EspDesktop Home could not be found."
            return
        }
        let settings = NWParameters.tcp
        settings.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        do {
            let listener = try NWListener(using: settings)
            let secret = UUID()
            self.listener = listener
            status = .waiting
            note = ""
            listener.newConnectionHandler = { [weak self] connection in
                MainActor.assumeIsolated { self?.accept(connection, secret: secret) }
            }
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                MainActor.assumeIsolated {
                    guard let self, let listener, self.listener === listener else { return }
                    switch state {
                    case .ready:
                        guard let port = listener.port else { return }
                        self.launch(url, port: port, secret: secret, activate: activate)
                    case .failed:
                        self.stop()
                        self.note = "Could not connect to EspDesktop Home."
                    default: break
                    }
                }
            }
            listener.start(queue: .main)
            Task {
                try? await Task.sleep(for: .seconds(12))
                guard self.listener === listener, self.peer == nil else { return }
                self.stop()
                self.note = "EspDesktop Home did not connect. Check that the app is signed and try again."
            }
        } catch {
            note = "Could not start the Apple Home connection."
        }
    }

    private func launch(_ url: URL, port: NWEndpoint.Port, secret: UUID, activate: Bool) {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = activate
        configuration.hides = !activate
        configuration.createsNewApplicationInstance = true
        configuration.arguments = ["--espdesktop-home-connection", String(port.rawValue), secret.uuidString,
                                   "--espdesktop-home-cards", "--espdesktop-home-continue"]
        let currentListener = listener
        Task {
            do {
                let app = try await NSWorkspace.shared.openApplication(at: url, configuration: configuration)
                guard self.listener === currentListener else { app.terminate(); return }
                helper = app
                if setupNeedsNoHomeChoice { app.hide() }
            } catch {
                guard self.listener === currentListener else { return }
                stop()
                note = "Could not open EspDesktop Home."
            }
        }
    }

    private func accept(_ connection: NWConnection, secret: UUID) {
        let channel = AppleHomeSceneChannel(connection)
        channel.onMessage = { [weak self, weak channel] message in
            guard let self, let channel else { return }
            if self.peer === channel {
                self.receive(message)
            } else if self.peer == nil && message.kind == .hello && message.secret == secret {
                self.peer = channel
            } else {
                channel.close()
            }
        }
        channel.onClose = { [weak self, weak channel] in
            guard let self, let channel, self.peer === channel else { return }
            self.stop()
            self.note = "EspDesktop Home disconnected."
        }
        channel.start()
        // Keep an unauthenticated connection alive only long enough to send hello.
        Task {
            try? await Task.sleep(for: .seconds(3))
            if self.peer !== channel { channel.close() }
        }
    }

    private func receive(_ message: AppleHomeSceneMessage) {
        switch message.kind {
        case .status:
            bindingSet = message.status == .ready ? message.bindingSet : nil
            status = message.status
            canChooseHome = message.canChooseHome == true
            if message.status != .ready { controls = [] }
            if setupNeedsNoHomeChoice && !runningAction { helper?.hide() }
            onControlsChanged?()
        case .catalogStart:
            incomingControls = []
        case .catalogControl:
            if let control = message.control { incomingControls?.append(control) }
        case .catalogEnd:
            if let incomingControls { controls = incomingControls }
            incomingControls = nil
            onControlsChanged?()
        case .continueSetup:
            guard status == .ready, let bindingSet, message.bindingSet == bindingSet, !controls.isEmpty else { return }
            helper?.hide()
            onContinueSetup?()
        case .result:
            if let pending = pendingRun, pending.0 == message.request {
                pendingRun = nil
                pending.1.resume(returning: message)
            }
        default: break
        }
    }

    func cardActions(for account: String) -> [(id: String, label: String)] {
        guard status == .ready, let bindingSet, approvals[account] == bindingSet,
              let labels = cardLabels[account] else { return [] }
        return controls.compactMap { control in labels[control.id].map { (control.action, $0) } }
    }

    func statusForAction(slot: Int, account: String, isUnlocked: () -> Bool) async -> String? {
        guard approvals[account] != nil else { return nil }
        return await run(account: account, isUnlocked: isUnlocked, slot: slot)
    }

    func statusForCard(reference: UUID, account: String, isUnlocked: () -> Bool) async -> String {
        guard cardLabels[account]?[reference] != nil,
              controls.contains(where: { $0.id == reference }) else { return "not_allowed" }
        return await run(account: account, isUnlocked: isUnlocked, reference: reference)
    }

    private func run(account: String, isUnlocked: () -> Bool, slot: Int? = nil, reference: UUID? = nil) async -> String {
        guard isUnlocked(), let bindingSet = readyBinding, approvals[account] == bindingSet,
              let peer, !runningAction else { return "not_allowed" }
        runningAction = true
        defer { runningAction = false }

        var result = await sendRun(peer, slot: slot, reference: reference, binding: bindingSet)
        if result?.needsForeground == true, !Task.isCancelled, isUnlocked(), self.peer === peer,
           let helper, readyBinding == bindingSet, approvals[account] == bindingSet {
            let previousApp = NSWorkspace.shared.frontmostApplication
            let wasHidden = helper.isHidden
            defer {
                let restoreFocus = helper.isActive
                if wasHidden { helper.hide() }
                if restoreFocus, previousApp?.processIdentifier != helper.processIdentifier {
                    previousApp?.activate(options: [])
                }
            }
            if wasHidden { helper.unhide() }
            if helper.isActive || helper.activate(options: [.activateIgnoringOtherApps]) {
                // Wait for macOS to grant foreground access before retrying the
                // command that HomeKit rejected without performing.
                for _ in 0..<20 where !helper.isActive {
                    try? await Task.sleep(for: .milliseconds(50))
                }
                if helper.isActive, !Task.isCancelled, isUnlocked(), self.peer === peer,
                   readyBinding == bindingSet, approvals[account] == bindingSet {
                    result = await sendRun(peer, slot: slot, reference: reference, binding: bindingSet,
                                           needsForeground: true)
                }
            }
        }
        if result?.succeeded == true {
            note = ""
            return "performed"
        }
        note = "Apple Home could not run the control."
        return "not_allowed"
    }

    private func sendRun(_ peer: AppleHomeSceneChannel, slot: Int?, reference: UUID?,
                         binding: UUID, needsForeground: Bool = false) async -> AppleHomeSceneMessage? {
        let request = UUID()
        return await withCheckedContinuation { continuation in
            pendingRun = (request, continuation)
            peer.send(.init(kind: .run, request: request, slot: slot, bindingSet: binding, reference: reference,
                            needsForeground: needsForeground))
            Task {
                try? await Task.sleep(for: .seconds(6))
                guard let pending = self.pendingRun, pending.0 == request else { return }
                self.pendingRun = nil
                pending.1.resume(returning: nil)
            }
        }
    }

    func updateEditorCards(_ cards: [AppleHomeDeviceEditor.SavedCard], for account: String, binding: UUID) {
        guard readyBinding == binding else { return }
        let available = Set(controls.map(\.id))
        let current = cardLabels[account] ?? [:]
        let labels = Dictionary(cards.filter { available.contains($0.reference) }
            .map { ($0.reference, $0.label) }, uniquingKeysWith: { first, _ in first })
        if labels.isEmpty && approvals[account] != binding { return }
        let updated = current.filter { !available.contains($0.key) }.merging(labels) { _, label in label }
        guard approvals[account] != binding || current != updated else { return }
        approvals[account] = binding
        cardLabels[account] = updated
        saveApprovals()
        defaults.set(try? JSONEncoder().encode(cardLabels), forKey: Self.cardsKey)
        onControlsChanged?()
    }

    func disconnect() {
        approvals = approvals.mapValues { _ in Self.inactive }
        saveApprovals()
        stop()
        note = "Apple Home is disconnected. Scene tiles are disabled."
    }

    private func saveApprovals() {
        defaults.set(approvals.mapValues(\.uuidString), forKey: Self.approvalsKey)
    }

    func stop() {
        let channel = peer
        peer = nil
        channel?.close()
        listener?.cancel()
        listener = nil
        helper?.terminate()
        helper = nil
        status = nil
        canChooseHome = false
        bindingSet = nil
        controls = []
        incomingControls = nil
        onControlsChanged?()
        let pending = pendingRun
        pendingRun = nil
        pending?.1.resume(returning: nil)
    }
}

struct AppleHomeSceneSettings: View {
    @ObservedObject var home: AppleHomeScenes
    let displays: [CompanionDisplay]
    let selectedDisplayID: UUID?
    let openDevice: (CompanionDisplay) -> Void

    private var eligibleDisplays: [CompanionDisplay] {
        let connected = displays.filter { $0.state == .connected && !$0.usesUSB }
        if let selected = connected.first(where: { $0.id == selectedDisplayID }) { return [selected] }
        return connected
    }

    var body: some View {
        Form {
            Section("Apple Home") {
                if home.status == nil {
                    Button("Connect Apple Home") { home.connect() }
                } else {
                    Button("Disconnect Apple Home") { home.disconnect() }
                }
                switch home.status {
                case .waiting: ProgressView("Waiting for Apple Home")
                case .chooseHome: Button("Choose a Home") { home.connect() }
                case .denied:
                    Text("Allow EspDesktop Home in System Settings under Privacy & Security → HomeKit.")
                case .empty: Text("No compatible controls or scenes are available in this home.")
                case .ready:
                    Text("Choose Apple Home controls while editing cards in Device Settings.")
                    if eligibleDisplays.isEmpty {
                        Text("Connect a display over Wi-Fi to open Device Settings.")
                    }
                    ForEach(eligibleDisplays) { display in
                        Button("Open \(display.name) Device Settings") { openDevice(display) }
                    }
                case nil: EmptyView()
                }
                if home.canChooseHome && (home.status == .ready || home.status == .empty) {
                    Button("Change Home…") { home.connect() }
                }
                if !home.note.isEmpty { Text(home.note).foregroundStyle(.secondary) }
            }
        }
        .formStyle(.grouped)
    }
}
