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
    @Published private(set) var saving = false
    @Published private(set) var controls: [AppleHomeControl] = []
    @Published private(set) var cardLabels: [String: [UUID: String]]
    var onControlsChanged: (() -> Void)?
    private var incomingControls: [AppleHomeControl]?
    private let defaults: UserDefaults
    private var listener: NWListener?
    private var peer: AppleHomeSceneChannel?
    private var helper: NSRunningApplication?
    private var bindingSet: UUID?
    private var pendingRun: (UUID, CheckedContinuation<Bool, Never>)?

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

    func connect(activate: Bool = true) {
        guard listener == nil else {
            if activate { helper?.activate(options: []) }
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
        configuration.createsNewApplicationInstance = true
        configuration.arguments = ["--espdesktop-home-connection", String(port.rawValue), secret.uuidString, "--espdesktop-home-cards"]
        let currentListener = listener
        Task {
            do {
                let app = try await NSWorkspace.shared.openApplication(at: url, configuration: configuration)
                guard self.listener === currentListener else { app.terminate(); return }
                helper = app
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
            onControlsChanged?()
        case .catalogStart:
            incomingControls = []
        case .catalogControl:
            if let control = message.control { incomingControls?.append(control) }
        case .catalogEnd:
            if let incomingControls { controls = incomingControls }
            incomingControls = nil
            onControlsChanged?()
        case .result:
            if let pending = pendingRun, pending.0 == message.request {
                pendingRun = nil
                pending.1.resume(returning: message.succeeded == true)
            }
        default: break
        }
    }

    func cardActions(for account: String) -> [(id: String, label: String)] {
        guard status == .ready, let bindingSet, approvals[account] == bindingSet,
              let labels = cardLabels[account] else { return [] }
        return controls.compactMap { control in labels[control.id].map { (control.action, $0) } }
    }

    func statusForAction(slot: Int, account: String, isUnlocked: Bool) async -> String? {
        guard approvals[account] != nil else { return nil }
        return await run(account: account, isUnlocked: isUnlocked, slot: slot)
    }

    func statusForCard(reference: UUID, account: String, isUnlocked: Bool) async -> String {
        guard cardLabels[account]?[reference] != nil,
              controls.contains(where: { $0.id == reference }) else { return "not_allowed" }
        return await run(account: account, isUnlocked: isUnlocked, reference: reference)
    }

    private func run(account: String, isUnlocked: Bool, slot: Int? = nil, reference: UUID? = nil) async -> String {
        guard isUnlocked, status == .ready, let bindingSet, approvals[account] == bindingSet,
              let peer, pendingRun == nil else { return "not_allowed" }
        let request = UUID()
        let succeeded = await withCheckedContinuation { continuation in
            pendingRun = (request, continuation)
            peer.send(.init(kind: .run, request: request, slot: slot, bindingSet: bindingSet, reference: reference))
            Task {
                try? await Task.sleep(for: .seconds(6))
                guard let pending = self.pendingRun, pending.0 == request else { return }
                self.pendingRun = nil
                pending.1.resume(returning: false)
            }
        }
        return succeeded ? "performed" : "not_allowed"
    }

    func saveCard(_ scene: AppleHomeControl, label: String, to display: CompanionDisplay) async {
        guard status == .ready, let bindingSet, display.hasSavedPairing, display.state == .connected,
              !display.usesUSB, let url = CompanionStore.panelWebServerURL(from: display.record.host),
              controls.contains(where: { $0.id == scene.id }), !saving else { return }
        let label = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !label.isEmpty, label.utf8.count <= 80 else {
            note = "Enter a shorter display label."
            return
        }
        let account = display.pairingAccount
        saving = true
        defer { saving = false }
        do {
            let result = try await AppleHomePageInstaller.install(at: url, action: scene.action, label: label) {
                guard self.bindingSet == bindingSet, display.pairingAccount == account, display.state == .connected,
                      self.controls.contains(where: { $0.id == scene.id }) else {
                    throw AppleHomePageInstaller.InstallError("The display or control changed. Try again.")
                }
            }
            guard self.bindingSet == bindingSet, display.pairingAccount == account else {
                note = "Apple Home changed while the card was saved. Reconnect it to enable the card."
                return
            }
            approvals[account] = bindingSet
            cardLabels[account, default: [:]][scene.id] = label
            saveApprovals()
            defaults.set(try? JSONEncoder().encode(cardLabels), forKey: Self.cardsKey)
            note = result
            onControlsChanged?()
        } catch {
            note = error.localizedDescription
        }
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

    private func stop() {
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
        pending?.1.resume(returning: false)
    }
}

struct AppleHomeSceneSettings: View {
    @ObservedObject var home: AppleHomeScenes
    let displays: [CompanionDisplay]
    @Binding var selectedDisplayID: UUID?
    @State private var sceneToSave: AppleHomeControl?
    @State private var cardLabel = ""

    private var eligibleDisplays: [CompanionDisplay] {
        displays.filter { $0.state == .connected && !$0.usesUSB }
    }

    private var display: CompanionDisplay? {
        eligibleDisplays.first { $0.id == selectedDisplayID } ?? eligibleDisplays.first
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
                    if eligibleDisplays.count > 1 {
                        Picker("Display", selection: Binding(get: { display?.id }, set: { selectedDisplayID = $0 })) {
                            ForEach(eligibleDisplays) { item in Text(item.name).tag(Optional(item.id)) }
                        }
                    } else if let display {
                        LabeledContent("Display", value: display.name)
                    } else {
                        Text("Connect a display over Wi-Fi to add scene cards.")
                    }
                case nil: EmptyView()
                }
                if home.canChooseHome && (home.status == .ready || home.status == .empty) {
                    Button("Change Home…") { home.connect() }
                }
                if !home.note.isEmpty { Text(home.note).foregroundStyle(.secondary) }
            }

            if home.status == .ready {
                Section("Available Controls") {
                    if home.controls.isEmpty {
                        Text("Update EspDesktop Home to load the control list.")
                    }
                    ForEach(home.controls) { scene in
                        HStack {
                            Text(scene.name)
                            Spacer()
                            let existingLabel = display.flatMap { home.cardLabels[$0.pairingAccount]?[scene.id] }
                            Button(existingLabel == nil ? "Add Card…" : "Edit Label…") {
                                cardLabel = existingLabel ?? ""
                                sceneToSave = scene
                            }
                            .disabled(display == nil || home.saving)
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .sheet(item: $sceneToSave) { scene in
            VStack(alignment: .leading, spacing: 12) {
                Text(scene.name).font(.headline)
                TextField("Label on Display", text: $cardLabel)
                HStack {
                    Spacer()
                    Button("Cancel") { sceneToSave = nil }.keyboardShortcut(.cancelAction)
                    Button("Save Card") {
                        guard let display else { return }
                        let label = cardLabel
                        sceneToSave = nil
                        Task { await home.saveCard(scene, label: label, to: display) }
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(cardLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              cardLabel.utf8.count > 80 || display == nil)
                }
            }
            .padding()
            .frame(width: 350)
        }
    }
}
