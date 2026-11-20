import AppKit
import Network
import Security
import SwiftUI

@MainActor
final class AppleHomeScenes: ObservableObject {
    private static let helperBundleID = "io.espdesktop.home"
    private static let approvalsKey = "appleHome.approvedDisplays"
    private static let inactive = UUID(uuid: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))

    @Published private(set) var status: AppleHomeSceneMessage.Status?
    @Published private(set) var note = ""
    @Published private(set) var approvals: [String: UUID]
    @Published private(set) var saving = false
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
        configuration.arguments = ["--espdesktop-home-connection", String(port.rawValue), secret.uuidString]
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
        case .result:
            if let pending = pendingRun, pending.0 == message.request {
                pendingRun = nil
                pending.1.resume(returning: message.succeeded == true)
            }
        default: break
        }
    }

    func statusForAction(slot: Int, account: String, isUnlocked: Bool) async -> String? {
        guard let approved = approvals[account] else { return nil }
        guard isUnlocked, status == .ready, approved == bindingSet, let peer, pendingRun == nil else {
            return "not_allowed"
        }
        let request = UUID()
        let succeeded = await withCheckedContinuation { continuation in
            pendingRun = (request, continuation)
            peer.send(.init(kind: .run, request: request, slot: slot))
            Task {
                try? await Task.sleep(for: .seconds(6))
                guard let pending = self.pendingRun, pending.0 == request else { return }
                self.pendingRun = nil
                pending.1.resume(returning: false)
            }
        }
        return succeeded ? "performed" : "not_allowed"
    }

    func addPage(to display: CompanionDisplay) async {
        guard status == nil || status == .ready, display.hasSavedPairing, display.state == .connected,
              !display.usesUSB, let url = CompanionStore.panelWebServerURL(from: display.record.host),
              !saving else { return }
        let bindingSet = self.bindingSet
        let account = display.pairingAccount
        saving = true
        defer { saving = false }
        do {
            let result = try await AppleHomePageInstaller.install(at: url) {
                guard self.bindingSet == bindingSet, display.pairingAccount == account, display.state == .connected else {
                    throw AppleHomePageInstaller.InstallError("The display or Apple Home connection changed. Try again.")
                }
                if self.approvals[account] == nil {
                    // A lost HTTP response can leave the new page on the display.
                    // Reserve the commands before saving so they cannot send keys.
                    self.approvals[account] = Self.inactive
                    self.saveApprovals()
                }
            }
            guard self.bindingSet == bindingSet, display.pairingAccount == account else {
                note = "Apple Home changed during setup. Connect again to enable the page."
                return
            }
            approvals[account] = bindingSet ?? Self.inactive
            saveApprovals()
            note = bindingSet == nil ? result + " Connect Apple Home to enable the scene tiles." : result
        } catch {
            note = error.localizedDescription
        }
    }

    func shouldSetUp(_ account: String) -> Bool {
        bindingSet != nil && approvals[account] != bindingSet
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
        bindingSet = nil
        let pending = pendingRun
        pendingRun = nil
        pending?.1.resume(returning: false)
    }
}

struct AppleHomeSceneSettings: View {
    @ObservedObject var home: AppleHomeScenes
    let displays: [CompanionDisplay]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Apple Home").font(.title2)
            if home.status == nil {
                Button("Connect Apple Home") { home.connect() }
            } else {
                Button("Disconnect Apple Home") { home.disconnect() }
            }
            switch home.status {
            case .waiting:
                ProgressView("Waiting for Apple Home")
            case .chooseHome:
                Text("Choose a home in EspDesktop Home.")
            case .denied:
                Text("Allow EspDesktop Home in System Settings under Privacy & Security → HomeKit.")
            case .empty:
                Text("Add a scene in Apple Home to use it on your display.")
            case .ready:
                Text("Match the numbered display tiles to your scenes in EspDesktop Home.")
                Button("Show Scene Assignments") { home.connect() }
            case nil: EmptyView()
            }
            if home.status == nil || home.status == .ready {
                ForEach(displays.filter { $0.state == .connected && !$0.usesUSB }) { display in
                    Button("Add Scene Page to \(display.name)") {
                        Task { await home.addPage(to: display) }
                    }
                    .disabled(home.saving)
                }
            }
            if !home.note.isEmpty { Text(home.note).foregroundStyle(.secondary) }
        }
        .padding()
        .onReceive(home.$status.removeDuplicates()) { status in
            guard status == .ready else { return }
            let connected = displays.filter { $0.state == .connected && !$0.usesUSB }
            guard connected.count == 1, let display = connected.first,
                  home.shouldSetUp(display.pairingAccount) else { return }
            Task { await home.addPage(to: display) }
        }
    }
}
