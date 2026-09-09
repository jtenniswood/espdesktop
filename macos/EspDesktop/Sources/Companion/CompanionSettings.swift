import AppKit
import SwiftUI

private enum CompanionSettingsField: Hashable {
    case panelHost, pairingCode
}

private enum CompanionSettingsPage: String, CaseIterable, Identifiable {
    // Retain the saved selection identifiers from earlier versions.
    case connection, applications, folders, general, updates, help

    var id: String { rawValue }
    var title: String {
        switch self {
        case .connection: return "Display"
        case .applications: return "Apps"
        case .folders: return "Folders"
        case .general: return "Permissions"
        case .updates: return "Updates"
        case .help: return "Help"
        }
    }
    var icon: String {
        switch self {
        case .connection: return "display"
        case .applications: return "square.grid.2x2"
        case .folders: return "folder"
        case .general: return "gearshape"
        case .updates: return "arrow.triangle.2.circlepath"
        case .help: return "questionmark.circle"
        }
    }
}

private enum CompanionPairingStep {
    case address, code, connecting, connected
}

private struct CompanionOnboardingPage<Content: View>: View {
    let icon: String
    let title: String
    let summary: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: icon)
                .font(.system(size: 38, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: 88, height: 88)
                .background {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(LinearGradient(colors: [.accentColor, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing))
                }
                .shadow(color: Color.accentColor.opacity(0.2), radius: 18, y: 8)
                .accessibilityHidden(true)
            VStack(spacing: 10) {
                Text(title)
                    .font(.system(size: 30, weight: .semibold, design: .rounded))
                Text(summary)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 12) {
                content()
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(nsColor: .controlBackgroundColor))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08))
            }
        }
        .frame(maxWidth: 460)

    }
}

private struct CompanionInfoButton: View {
    let title: String
    let information: String
    @State private var showingInformation = false

    var body: some View {
        Button {
            showingInformation = true
        } label: {
            Image(systemName: "info.circle")
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("About \(title)")
        .onHover { showingInformation = $0 }
        .popover(isPresented: $showingInformation, arrowEdge: .bottom) {
            Text(information)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
                .padding(16)
                .frame(width: 280, alignment: .leading)
        }
    }
}

private struct CompanionPermissionRow: View {
    let title: String
    let information: String
    @Binding var isEnabled: Bool
    var isAvailable = true

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
            CompanionInfoButton(title: title, information: information)
            Spacer()
            Toggle(title, isOn: $isEnabled)
                .labelsHidden()
                .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                .disabled(!isAvailable)
                .accessibilityHint(information)
        }
    }
}

private struct CompanionStatsToggle: View {
    @Binding var isEnabled: Bool

    var body: some View {
        Toggle("Share Mac Stats to Display", isOn: $isEnabled)
            .toggleStyle(SwitchToggleStyle(tint: .accentColor))
    }
}

private struct CompanionLaunchAtLoginToggle: View {
    @Binding var isEnabled: Bool
    let isAvailable: Bool

    var body: some View {
        Toggle("Launch Companion App at Login", isOn: $isEnabled)
            .toggleStyle(SwitchToggleStyle(tint: .accentColor))
            .disabled(!isAvailable)
    }
}

private struct CompanionAccessibilityToggle: View {
    @Binding var isEnabled: Bool
    let requestAccess: () -> Void

    var body: some View {
        Toggle("Enable Keyboard Shortcuts", isOn: Binding(
            get: { isEnabled },
            set: { _ in requestAccess() }
        ))
        .toggleStyle(SwitchToggleStyle(tint: .accentColor))
    }
}

private struct CompanionOnboardingStep: View {
    let index: Int
    let current: Int
    let title: String

    var body: some View {
        HStack(spacing: 7) {
            ZStack {
                Circle()
                    .fill(index <= current ? Color.accentColor : Color.secondary.opacity(0.12))
                if index < current {
                    Image(systemName: "checkmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                } else {
                    Text("\(index + 1)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(index == current ? Color.white : Color.secondary)
                }
            }
            .frame(width: 24, height: 24)
            Text(title)
                .font(.caption.weight(index == current ? .semibold : .regular))
                .foregroundStyle(index == current ? Color.primary : Color.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(index + 1): \(title)")
        .accessibilityValue(index == current ? "Current step" : (index < current ? "Visited" : "Upcoming"))
    }
}

private struct CompanionOnboarding: View {
    @ObservedObject var store: CompanionStore
    let onComplete: () -> Void
    @State private var step = 0
    @State private var accessibilityGranted = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let totalSteps = 3

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 32) {
                    VStack(spacing: 18) {
                        Text("WELCOME TO ESPDESKTOP")
                            .font(.caption.weight(.semibold))
                            .tracking(2)
                            .foregroundStyle(.secondary)
                        HStack(spacing: 24) {
                            ForEach(0..<totalSteps, id: \.self) { index in
                                CompanionOnboardingStep(
                                    index: index,
                                    current: step,
                                    title: ["Shortcuts", "Mac stats", "Startup"][index]
                                )
                            }
                        }
                    }
                    currentPage
                        .id(step)
                        .transition(.opacity)
                    Text("Make it yours. You can change these options later in Settings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
            }

            Divider()
            HStack {
                Button("Skip for now") { onComplete() }
                    .buttonStyle(.borderless)
                Spacer()
                if step > 0 {
                    Button("Back") { step -= 1 }
                }
                Button(step == totalSteps - 1 ? "Finish" : "Continue") {
                    if step == totalSteps - 1 {
                        onComplete()
                    } else {
                        step += 1
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            .controlSize(.large)
            .frame(maxWidth: 460)
            .padding(.vertical, 18)
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: step)
        .onAppear { refreshAccessibilityStatus() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            refreshAccessibilityStatus()
        }
    }

    @ViewBuilder private var currentPage: some View {
        switch step {
        case 0:
            CompanionOnboardingPage(
                icon: "keyboard",
                title: "Your shortcuts, one tap away",
                summary: "Run keyboard shortcuts and arrange windows from your display. Enable Accessibility access to control your Mac apps."
            ) {
                CompanionAccessibilityToggle(isEnabled: $accessibilityGranted, requestAccess: enableAccessibility)
                Text(accessibilityGranted
                     ? "Keyboard shortcuts and window controls are enabled for your display."
                     : "Turn on EspDesktop in System Settings → Privacy & Security → Accessibility to enable keyboard shortcuts and window controls.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        case 1:
            CompanionOnboardingPage(
                icon: "chart.bar.xaxis",
                title: "Your Mac at a glance",
                summary: "Keep an eye on processor, memory, storage, network, and battery activity, right on your display."
            ) {
                CompanionStatsToggle(isEnabled: $store.shareSystemMetricsEnabled)
                Text("Statistics are shared only with your paired display on the local network. You can change this later in Permissions settings.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        default:
            CompanionOnboardingPage(
                icon: "power",
                title: "Ready when you are",
                summary: "Start EspDesktop automatically when you sign in so your paired display can reconnect to the Mac."
            ) {
                CompanionLaunchAtLoginToggle(
                    isEnabled: store.launchAtLoginBinding(),
                    isAvailable: store.supportsLaunchAtLogin
                )
                Text(store.supportsLaunchAtLogin
                     ? store.launchAtLoginMessage
                     : "Install EspDesktop in Applications before enabling automatic startup.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func refreshAccessibilityStatus() {
        accessibilityGranted = CompanionAccessibilityAuthorizer.shared.hasAccess
    }

    private func enableAccessibility() {
        accessibilityGranted = CompanionAccessibilityAuthorizer.shared.isTrusted()
    }
}

struct CompanionSettings: View {
    @ObservedObject var store: CompanionStore
    @StateObject private var discovery = CompanionDiscovery()
    @State private var manualAddress = false
    @State private var selectedDisplayID: String?
    @State private var pairingCode = ""
    @State private var confirmingForget = false
    @State private var folderToRemove: ApprovedFolder?
    @State private var accessibilityGranted = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pairingStep: CompanionPairingStep = .address
    @State private var pairingFlowActive = false
    @State private var pairingFlowError = ""
    @AppStorage("companion.onboarding.completed") private var onboardingCompleted = false
    @State private var selectedPageID = CompanionSettingsPage.connection.rawValue
    @FocusState private var focusedField: CompanionSettingsField?

    var body: some View {
        if onboardingCompleted || store.requestedSettingsPage == "help" {
            settingsContent
        } else {
            CompanionOnboarding(store: store) {
                onboardingCompleted = true
            }
        }
    }

    private var settingsContent: some View {
        detailView
            .scrollContentBackground(.hidden)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color(nsColor: .windowBackgroundColor))
            .background(CompanionSettingsToolbar(selection: selectedPageBinding))
            .navigationTitle("Settings")
            .safeAreaInset(edge: .bottom, alignment: .trailing, spacing: 0) {
                floatingSupportButton
                    .padding(.horizontal, 24)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
            }
        .onAppear {
            selectedPageID = store.requestedSettingsPage
            if !store.hasSavedPairing && !pairingFlowActive { startPairingFlow() }
            refreshAccessibilityStatus()
        }
        .onChange(of: store.settingsRequestID) { _ in
            selectedPageID = store.requestedSettingsPage
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            refreshAccessibilityStatus()
        }
        .onChange(of: store.isConnected) { connected in
            if connected {
                pairingCode = ""
                if pairingFlowActive { pairingStep = .connected }
            }
        }
        .onChange(of: store.connectionState) { state in
            if pairingFlowActive && pairingStep == .connecting && state == .failed {
                pairingStep = .code
                pairingFlowError = store.connectionRecoveryMessage
            }
        }
        .onChange(of: pairingStep) { step in
            switch step {
            case .address: focusedField = .panelHost
            case .code: focusedField = .pairingCode
            case .connecting, .connected: focusedField = nil
            }
        }
        .alert("Forget this display?", isPresented: $confirmingForget) {
            Button("Cancel", role: .cancel) {}
            Button("Forget Display", role: .destructive) {
                store.forgetPanel()
                selectedDisplayID = nil
                manualAddress = false
                pairingCode = ""
                pairingFlowActive = true
                pairingStep = .address
                pairingFlowError = ""
                focusedField = .panelHost
            }
        } message: {
            Text("Your Mac will disconnect and remove its saved pairing. You’ll need the code from the device webpage to pair again. Your application and folder choices will be kept.")
        }
        .alert("Remove folder?", isPresented: Binding(
            get: { folderToRemove != nil },
            set: { if !$0 { folderToRemove = nil } }
        )) {
            Button("Cancel", role: .cancel) { folderToRemove = nil }
            Button("Remove Folder", role: .destructive) {
                if let folder = folderToRemove { store.removeFolder(folder) }
                folderToRemove = nil
            }
        } message: {
            Text("This folder will no longer be available to your display. The folder and its files will stay on your Mac.")
        }
    }

    @ViewBuilder private var detailView: some View {
        switch selectedPage {
        case .connection: connectionPage
        case .applications: applicationsPage
        case .folders: foldersPage
        case .general: permissionsPage
        case .updates: CompanionUpdateSettings(updater: store.updater)
        case .help: helpPage
        }
    }

    private var selectedPage: CompanionSettingsPage {
        CompanionSettingsPage(rawValue: selectedPageID) ?? .connection
    }

    private var selectedPageBinding: Binding<CompanionSettingsPage> {
        Binding(get: { selectedPage }, set: { selectedPageID = $0.rawValue })
    }

    private var connectionPage: some View {
        Group {
            if store.hasSavedPairing && !pairingFlowActive {
                Form {
                    Section {
                        connectionStatus
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 24)
                    }
                    Section("Display Settings") {
                        LabeledContent {
                            Button("Customize") { store.openPanelWebServer() }
                                .help("Open the display’s configuration in your browser")
                        } label: {
                            Text("Manage your display layout")
                                .foregroundStyle(.secondary)
                        }
                        LabeledContent {
                            Button("Remove", role: .destructive) { confirmingForget = true }
                        } label: {
                            Text("Reset your display pairing")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .formStyle(.grouped)
            } else {
                pairingFlowPage
            }
        }
    }

    private var pairingFlowPage: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Step \(pairingStepNumber) of 3")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text(pairingStepTitle)
                        .font(.title.weight(.semibold))
                    Text(pairingStepDescription)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .multilineTextAlignment(.center)

                if pairingStep == .address || pairingStep == .code {
                    VStack(alignment: .leading, spacing: 10) {
                        if pairingStep == .address {
                            displaySelection
                                .onAppear { if !manualAddress { discovery.start() } }
                                .onDisappear { discovery.stop() }
                                .onChange(of: manualAddress) { manual in
                                    if manual { discovery.stop() } else { discovery.start() }
                                }
                        } else {
                            CompanionPairingCodeField(code: $pairingCode, onSubmit: pairDisplay)
                        }
                        if !pairingFlowError.isEmpty {
                            Label(pairingFlowError, systemImage: "exclamationmark.circle")
                                .font(.callout)
                                .foregroundStyle(.orange)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .font(.title3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    HStack {
                        if pairingStep == .code {
                            Button("Back") {
                                pairingFlowError = ""
                                pairingStep = .address
                                focusedField = .panelHost
                            }
                        }
                        if pairingStep == .code { Spacer() }
                        Button(pairingStep == .address ? "Continue" : "Connect") {
                            if pairingStep == .address { openPairingPage() } else { pairDisplay() }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(pairingStep == .address ? !canOpenPairingPage : !canPair)
                    }
                } else if pairingStep == .connecting {
                    ProgressView()
                        .accessibilityLabel("Connecting to display")
                } else {
                    Button("Done") {
                        pairingFlowActive = false
                        pairingStep = .address
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .controlSize(.large)
            .frame(maxWidth: 380)
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private var displaySelection: some View {
        if manualAddress {
            TextField("IP address or name.local", text: $store.panelHost)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Display address")
                .focused($focusedField, equals: .panelHost)
                .onSubmit { openPairingPage() }
            Button("Find displays automatically") {
                manualAddress = false
                selectedDisplayID = nil
            }
            .buttonStyle(.link)
            .font(.callout)
        } else {
            if discovery.displays.isEmpty {
                displayOption(
                    title: discovery.isSearching ? "Searching for displays…" : "Discovery unavailable",
                    subtitle: discovery.message,
                    icon: "exclamationmark.circle",
                    selected: false,
                    searching: discovery.isSearching
                )
                if !discovery.isSearching {
                    Button("Retry discovery") { discovery.stop(); discovery.start() }
                }
            }
            ForEach(discovery.displays) { display in
                Button {
                    selectedDisplayID = display.id
                } label: {
                    displayOption(
                        title: display.name,
                        subtitle: display.hostname,
                        icon: selectedDisplayID == display.id ? "checkmark.circle.fill" : "circle",
                        selected: selectedDisplayID == display.id
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(display.name), \(display.hostname)")
                .accessibilityAddTraits(selectedDisplayID == display.id ? .isSelected : [])
            }
            Button {
                manualAddress = true
                selectedDisplayID = nil
                focusedField = .panelHost
            } label: {
                displayOption(
                    title: "Enter address manually",
                    subtitle: "Use an IP address or hostname",
                    icon: "keyboard",
                    selected: false
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func displayOption(title: String, subtitle: String, icon: String, selected: Bool, searching: Bool = false) -> some View {
        HStack(spacing: 12) {
            Group {
                if searching {
                    ProgressView().controlSize(.small)
                        .accessibilityLabel("Searching for displays")
                } else {
                    Image(systemName: icon)
                        .font(.title3)
                        .foregroundStyle(selected ? Color.accentColor : Color.secondary)
                }
            }
            .frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.body.weight(.medium))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 10)
                .fill(selected ? Color.accentColor.opacity(0.1) : Color.primary.opacity(0.04))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(selected ? Color.accentColor : Color.primary.opacity(0.12), lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 10))
    }

    private var pairingStepNumber: Int {
        switch pairingStep {
        case .address: return 1
        case .code: return 2
        case .connecting, .connected: return 3
        }
    }

    private var pairingStepTitle: String {
        switch pairingStep {
        case .address: return "Choose your display"
        case .code: return "Enter pairing code"
        case .connecting: return "Connecting your display"
        case .connected: return "You’re connected"
        }
    }

    private var pairingStepDescription: String {
        switch pairingStep {
        case .address:
            return "Your Mac and display must be on the same network."
        case .code:
            return "Start pairing in your browser, then enter the eight-letter code."
        case .connecting:
            return "Keep your Mac and display on the same network."
        case .connected:
            return "Your display is ready to use."
        }
    }

    private var connectionStatus: some View {
        VStack(spacing: 10) {
            connectionSwitch
            HStack(spacing: 8) {
                if store.connectionState.isBusy {
                    ProgressView().controlSize(.small)
                }
                Text(store.connectionState.title)
                    .font(.title.weight(.semibold))
            }
            .accessibilityElement(children: .combine)
            Text(store.panelHost)
                .font(.callout)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
            if store.connectionState == .failed || store.connectionState == .reconnecting {
                Text(store.connectionState == .reconnecting
                     ? "Check that your display is powered on and connected to the same network. EspDesktop will try again automatically."
                     : store.connectionRecoveryMessage)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .multilineTextAlignment(.center)
    }

    private var connectionSwitch: some View {
        Toggle("Display connection", isOn: connectionToggleBinding)
            .labelsHidden()
            .toggleStyle(SwitchToggleStyle(tint: .accentColor))
            .controlSize(connectionSwitchSize)
            .disabled(store.connectionState.isBusy)
            .accessibilityLabel("Display connection")
    }

    private var connectionSwitchSize: ControlSize {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) { return .extraLarge }
        #endif
        return .large
    }

    private var connectionToggleBinding: Binding<Bool> {
        Binding(
            get: { store.isConnected },
            set: { enabled in
                if enabled {
                    store.connect()
                } else {
                    store.disconnect()
                }
            }
        )
    }

    private var canPair: Bool {
        !store.connectionState.isBusy && CompanionPairingInput.isValid(host: store.panelHost, code: pairingCode)
    }

    private var canOpenPairingPage: Bool {
        manualAddress ? CompanionStore.panelWebServerURL(from: store.panelHost) != nil
            : discovery.displays.contains(where: { $0.id == selectedDisplayID })
    }

    private func startPairingFlow() {
        selectedDisplayID = nil
        manualAddress = false
        pairingFlowActive = true
        pairingStep = .address
        pairingFlowError = ""
    }

    private func openPairingPage() {
        if !manualAddress {
            guard let display = discovery.displays.first(where: { $0.id == selectedDisplayID }) else { return }
            store.panelHost = display.endpoint
        }
        guard canOpenPairingPage else {
            pairingFlowError = "Enter a valid local IP address or name.local."
            return
        }
        guard store.openPanelPairing() else {
            pairingFlowError = "Could not open the display pairing page."
            return
        }
        pairingFlowError = ""
        pairingStep = .code
    }

    private func pairDisplay() {
        guard CompanionPairingInput.normalizedCode(pairingCode) != nil else {
            pairingFlowError = "Enter the eight-letter pairing code shown on the display."
            return
        }
        guard ConnectionEndpointPolicy.isLocalEndpoint(store.panelHost) else {
            pairingFlowError = "Go back and choose a display or enter a valid local address."
            return
        }
        guard !store.connectionState.isBusy else { return }
        pairingFlowError = ""
        pairingStep = .connecting
        store.pair(code: pairingCode)
    }

    private var applicationsPage: some View {
        Form {
            Section {
                if store.availableApps.isEmpty {
                    emptyState("No Applications Found", symbol: "app.dashed",
                               detail: "Install applications in your Applications folder, then refresh this list.") {
                        Button("Refresh Applications") { store.refreshApplications() }
                    }
                } else {
                    ForEach(store.availableApps) { application in
                        Toggle(isOn: Binding(
                            get: { store.applicationIsApproved(application) },
                            set: { store.setApplication(application, approved: $0) }
                        )) {
                            HStack(spacing: 10) {
                                Text(application.name)
                            }
                        }
                        .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                        .padding(.vertical, 2)
                    }
                }
            } header: {
                HStack(spacing: 6) {
                    Text("Apps")
                    CompanionInfoButton(
                        title: "Apps",
                        information: "Choose which Mac apps you can launch from your display. Enabled apps are available for app shortcuts; switch an app off to hide it from the display."
                    )
                }
            }
        }
        .formStyle(.grouped)
    }

    private var foldersPage: some View {
        Form {
            Section {
                if store.approvedFolders.isEmpty {
                    emptyState("Add Your First Folder", symbol: "folder.badge.plus",
                               detail: "Keep a project, documents, or downloads one tap away on your display.") {
                        Button("Add Folder…") { store.chooseFolder() }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ForEach(store.approvedFolders) { folder in
                        HStack(spacing: 10) {
                            Image(systemName: "folder")
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(folder.name)
                                if store.folderNeedsAccess(folder) {
                                    Label("Folder unavailable", systemImage: "exclamationmark.triangle")
                                        .font(.callout)
                                    Button("Choose Again…") { store.chooseFolder(restoring: folder) }
                                }
                            }
                            Spacer()
                            Button(role: .destructive) { folderToRemove = folder } label: {
                                Image(systemName: "minus.circle")
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Remove \(folder.name)")
                            .help("Remove folder from your display")
                        }
                        .padding(.vertical, 2)
                    }
                    Button("Add Folder…") { store.chooseFolder() }
                        .buttonStyle(.bordered)
                }
                if let message = store.folderMessage {
                    Text(message).font(.callout).foregroundStyle(.secondary)
                }
            } header: {
                HStack(spacing: 6) {
                    Text("Folders")
                    CompanionInfoButton(
                        title: "Folders",
                        information: "Add folders you want to open on this Mac from your display. Use them as folder shortcuts for projects, documents, or downloads. Folder paths stay on this Mac."
                    )
                }
            }
        }
        .formStyle(.grouped)
    }

    private func emptyState<Action: View>(
        _ title: String, symbol: String, detail: String,
        @ViewBuilder action: () -> Action
    ) -> some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 32, weight: .regular))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            VStack(spacing: 6) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: 300)
            action()
                .padding(.top, 4)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 24)
    }

    private var permissionsPage: some View {
        Form {
            Section("Permissions") {
                CompanionPermissionRow(
                    title: "Launch Companion App at Login",
                    information: store.supportsLaunchAtLogin
                        ? (store.launchAtLoginMessage.isEmpty
                           ? "Open EspDesktop automatically after you sign in."
                           : store.launchAtLoginMessage)
                        : "Install EspDesktop in Applications to open it automatically at login.",
                    isEnabled: store.launchAtLoginBinding(),
                    isAvailable: store.supportsLaunchAtLogin
                )
                CompanionPermissionRow(
                    title: "Share Mac Stats to Display",
                    information: "Share processor, memory, storage, network, and battery statistics only with your paired display on the local network.",
                    isEnabled: $store.shareSystemMetricsEnabled
                )
                CompanionPermissionRow(
                    title: "Enable Keyboard Shortcuts",
                    information: accessibilityGranted
                        ? "Keyboard shortcuts and window controls are enabled for your display."
                        : "Turn on EspDesktop in System Settings → Privacy & Security → Accessibility to enable keyboard shortcuts and window controls.",
                    isEnabled: Binding(get: { accessibilityGranted }, set: { _ in enableAccessibility() })
                )
            }
        }
        .formStyle(.grouped)
    }

    private var helpPage: some View {
        Form {
            Section("Support") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Enjoying EspDisplay?")
                        .font(.headline)
                    Text("Buy me a coffee to help fund new features, improvements, and support. Every contribution makes a difference. Thank you!")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Link("Buy Me a Coffee", destination: CompanionStore.buyMeACoffeeURL)
                }
            }
            Section("Resources") {
                Link("Support", destination: CompanionStore.supportURL)
                Link("Raise an issue", destination: CompanionStore.issuesURL)
                Link("Privacy Policy", destination: CompanionStore.privacyPolicyURL)
            }
        }
        .formStyle(.grouped)
    }

    private var companionResourceBundle: Bundle {
        // Installed apps keep resources inside Contents/Resources; SwiftPM runs
        // use the generated module bundle beside the build output.
        Bundle.main.url(forResource: "EspDesktop_Companion", withExtension: "bundle")
            .flatMap { Bundle(url: $0) } ?? .module
    }

    private var supportButtonImage: NSImage? {
        guard let imageURL = companionResourceBundle.url(
            forResource: "buy-me-a-coffee-button",
            withExtension: "png"
        ) else { return nil }
        return NSImage(contentsOf: imageURL)
    }

    private var floatingSupportButton: some View {
        Link(destination: CompanionStore.buyMeACoffeeURL) {
            if let supportButtonImage {
                Image(nsImage: supportButtonImage)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 171.2, height: 48)
                    .clipShape(Capsule())
            } else {
                Label("Buy me a coffee", systemImage: "cup.and.saucer.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.black.opacity(0.78))
                    .frame(width: 171.2, height: 48)
                    .background(Color(red: 1.0, green: 0.867, blue: 0.0))
                    .clipShape(Capsule())
            }
        }
        .buttonStyle(.plain)
        .help("Support EspDesktop by buying me a coffee")
        .accessibilityLabel("Buy me a coffee to support EspDesktop")
    }

    private func refreshAccessibilityStatus() {
        accessibilityGranted = CompanionAccessibilityAuthorizer.shared.hasAccess
    }

    private func enableAccessibility() {
        accessibilityGranted = CompanionAccessibilityAuthorizer.shared.isTrusted()
    }
}

/// Installs real selectable toolbar items in the hosting window. AppKit owns
/// their layout, selection appearance, accessibility, and light/dark styling.
private struct CompanionSettingsToolbar: NSViewRepresentable {
    @Binding var selection: CompanionSettingsPage

    func makeCoordinator() -> Coordinator { Coordinator(selection: $selection) }

    func makeNSView(context: Context) -> WindowObserver {
        let view = WindowObserver()
        view.onWindowChange = { [weak coordinator = context.coordinator] window in
            coordinator?.attach(to: window)
        }
        return view
    }

    func updateNSView(_ nsView: WindowObserver, context: Context) {
        context.coordinator.selection = $selection
        context.coordinator.toolbar.selectedItemIdentifier = .init(selection.rawValue)
    }

    static func dismantleNSView(_ nsView: WindowObserver, coordinator: Coordinator) {
        nsView.onWindowChange = nil
        coordinator.attach(to: nil)
    }

    final class WindowObserver: NSView {
        var onWindowChange: ((NSWindow?) -> Void)?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            onWindowChange?(window)
        }
    }

    @MainActor
    final class Coordinator: NSObject, NSToolbarDelegate {
        var selection: Binding<CompanionSettingsPage>
        let toolbar = NSToolbar(identifier: "EspDesktopSettingsNavigation")
        private weak var window: NSWindow?

        init(selection: Binding<CompanionSettingsPage>) {
            self.selection = selection
            super.init()
            toolbar.delegate = self
            toolbar.displayMode = .iconAndLabel
            toolbar.allowsUserCustomization = false
            toolbar.centeredItemIdentifiers = Set(pageIdentifiers)
            toolbar.selectedItemIdentifier = .init(selection.wrappedValue.rawValue)
        }

        func attach(to window: NSWindow?) {
            if let previous = self.window, previous !== window, previous.toolbar === toolbar {
                previous.toolbar = nil
            }
            self.window = window
            guard let window else { return }
            window.title = "Settings"
            // Keep the native icon-and-label tabs below the centered window title.
            window.toolbarStyle = .preference
            // Match the reference toolbar's neutral grey while retaining native light appearance.
            window.backgroundColor = NSColor(name: nil) { appearance in
                if appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua {
                    return NSColor(srgbRed: 35.0 / 255, green: 35.0 / 255, blue: 35.0 / 255, alpha: 1)
                }
                return .windowBackgroundColor
            }
            window.titlebarAppearsTransparent = true
            window.titlebarSeparatorStyle = .line
            window.toolbar = toolbar
            toolbar.selectedItemIdentifier = .init(selection.wrappedValue.rawValue)
        }

        private var pageIdentifiers: [NSToolbarItem.Identifier] {
            CompanionSettingsPage.allCases.map { .init($0.rawValue) }
        }

        func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
            pageIdentifiers
        }

        func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
            pageIdentifiers
        }

        func toolbarSelectableItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
            pageIdentifiers
        }

        func toolbar(
            _ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier,
            willBeInsertedIntoToolbar flag: Bool
        ) -> NSToolbarItem? {
            guard let page = CompanionSettingsPage(rawValue: identifier.rawValue) else { return nil }
            let item = NSToolbarItem(itemIdentifier: identifier)
            item.label = page.title
            item.paletteLabel = page.title
            item.toolTip = "Show \(page.title) settings"
            item.image = NSImage(systemSymbolName: page.icon, accessibilityDescription: page.title)
            item.target = self
            item.action = #selector(selectPage(_:))
            return item
        }

        @objc private func selectPage(_ sender: NSToolbarItem) {
            guard let page = CompanionSettingsPage(rawValue: sender.itemIdentifier.rawValue) else { return }
            selection.wrappedValue = page
        }
    }
}
