import AppKit
import SwiftUI

private enum CompanionSettingsField: Hashable {
    case panelHost, pairingCode
}

private enum CompanionSettingsPage: String, CaseIterable, Identifiable {
    // Retain the saved selection identifiers from earlier versions.
    case connection, applications, folders, updates, help

    var id: String { rawValue }
    var title: String {
        switch self {
        case .connection: return "Display"
        case .applications: return "Apps"
        case .folders: return "Folders"
        case .updates: return "Updates"
        case .help: return "Support"
        }
    }
    var icon: String {
        switch self {
        case .connection: return "display"
        case .applications: return "square.grid.2x2"
        case .folders: return "folder"
        case .updates: return "arrow.triangle.2.circlepath"
        case .help: return "questionmark.circle"
        }
    }
}

private enum CompanionPairingStep {
    case address, code, connecting, connected
}

struct CompanionCapsuleButton: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 14.0, *) {
            content.buttonBorderShape(.capsule)
        } else {
            // Keep the native bordered control on macOS 13, with pill-shaped edges.
            content.clipShape(Capsule())
        }
    }
}

private struct CompanionSetupHeading: View {
    let step: Int
    let title: String
    let summary: String

    var body: some View {
        VStack(spacing: 8) {
            Text("Step \(step) of 3")
                .font(.callout)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.title.weight(.semibold))
            Text(summary)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .multilineTextAlignment(.center)
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

private struct CompanionAccessibilityRow: View {
    var body: some View {
        HStack {
            Text("Enable Shortcuts")
                .help("Accessibility access is required to let your display send keyboard shortcuts to this Mac.")
            Spacer()
            Button {
                // Leave the SwiftUI control transaction before opening another app.
                DispatchQueue.main.async {
                    CompanionAccessibilityAuthorizer.shared.requestAccess()
                }
            } label: {
                Text("Open Settings")
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            .modifier(CompanionCapsuleButton())
        }
    }
}

private struct OnboardingWindowTitle: NSViewRepresentable {
    let hidden: Bool

    func makeNSView(context: Context) -> TitleView { TitleView() }
    func updateNSView(_ view: TitleView, context: Context) {
        view.hideTitle = hidden
    }

    final class TitleView: NSView {
        var hideTitle = false {
            didSet { updateTitle() }
        }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            updateTitle()
        }
        private func updateTitle() {
            DispatchQueue.main.async { [weak self] in
                guard let self, let window = self.window else { return }
                let visibility: NSWindow.TitleVisibility = self.hideTitle ? .hidden : .visible
                if window.titleVisibility != visibility { window.titleVisibility = visibility }
            }
        }
    }
}

private struct CompanionOnboarding: View {
    @ObservedObject var store: CompanionStore
    let onComplete: () -> Void
    @State private var accessibilityGranted = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                CompanionSetupHeading(
                    step: 3,
                    title: "Access and startup",
                    summary: "Your display is paired. Choose what to enable."
                )

                GroupBox {
                    VStack(alignment: .leading, spacing: 16) {
                        if !accessibilityGranted {
                            CompanionAccessibilityRow()
                            Divider()
                        }
                        CompanionPermissionRow(
                            title: "Launch at login",
                            information: "Open EspDesktop automatically when you sign in to your Mac.",
                            isEnabled: store.launchAtLoginBinding(),
                            isAvailable: store.supportsLaunchAtLogin
                        )
                        Text(store.supportsLaunchAtLogin
                             ? store.launchAtLoginMessage
                             : "Install EspDesktop in Applications to enable automatic startup.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(12)
                }

                Button("Finish") { onComplete() }
                    .buttonStyle(.borderedProminent)
            }
            .controlSize(.large)
            .frame(maxWidth: 380)
            .padding(.horizontal, 24)
            .padding(.vertical, 36)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear { refreshAccessibilityStatus() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            refreshAccessibilityStatus()
        }
    }

    private func refreshAccessibilityStatus() {
        accessibilityGranted = CompanionAccessibilityAuthorizer.shared.hasAccess
    }

}

struct CompanionSettings: View {
    @ObservedObject var store: CompanionStore
    @StateObject private var discovery = CompanionDiscovery()
    @State private var manualAddress = false
    @State private var selectedDisplayID: String?
    @State private var pairingCode = ""
    @State private var confirmingForget = false
    @State private var confirmingRestartSetup = false
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
        Group {
            switch CompanionSetupRoute.resolve(
                completed: onboardingCompleted,
                showingHelp: store.requestedSettingsPage == "help",
                hasSavedPairing: store.hasSavedPairing,
                pairingInProgress: pairingFlowActive,
                pairingConnected: pairingStep == .connected
            ) {
            case .settings:
                settingsContent
            case .pairing:
                pairingFlowPage
                    .background(Color(nsColor: .windowBackgroundColor))
                    .onAppear { if !pairingFlowActive { startPairingFlow() } }
            case .preferences:
                CompanionOnboarding(store: store) {
                    pairingFlowActive = false
                    pairingStep = .address
                    onboardingCompleted = true
                }
            }
        }
        .background(OnboardingWindowTitle(hidden: !onboardingCompleted && store.requestedSettingsPage != "help"))
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
            if !store.hasSavedPairing && !pairingFlowActive && store.requestedSettingsPage != "help" {
                startPairingFlow()
            }
            refreshAccessibilityStatus()
        }
        .onChange(of: store.settingsRequestID) { _ in
            selectedPageID = store.requestedSettingsPage
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            refreshAccessibilityStatus()
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
        .alert("Restart setup?", isPresented: $confirmingRestartSetup) {
            Button("Cancel", role: .cancel) {}
            Button("Restart Setup", role: .destructive) {
                store.forgetPanel()
                pairingCode = ""
                startPairingFlow()
                selectedPageID = CompanionSettingsPage.connection.rawValue
                store.requestedSettingsPage = CompanionSettingsPage.connection.rawValue
                onboardingCompleted = false
            }
        } message: {
            Text("Your Mac will disconnect and remove its saved display pairing, then start onboarding again. You’ll need a new pairing code from your display. Your application and folder choices will be kept.")
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
                        VStack(spacing: 20) {
                            connectionStatus
                            HStack(spacing: 12) {
                                Button {
                                    store.openPanelWebServer()
                                } label: {
                                    Label("Customize", systemImage: "rectangle.grid.2x2")
                                        .padding(.vertical, 4)
                                }
                                    .help("Open the display’s configuration in your browser")
                                    .modifier(CompanionCapsuleButton())
                                Button(role: .destructive) {
                                    confirmingForget = true
                                } label: {
                                    Label("Remove", systemImage: "trash")
                                        .padding(.vertical, 4)
                                }
                                    .help("Remove this display’s pairing")
                                    .modifier(CompanionCapsuleButton())
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                    }
                    accessibilityAndStartupSections
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
                CompanionSetupHeading(
                    step: pairingStepNumber,
                    title: pairingStepTitle,
                    summary: pairingStepDescription
                )

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
        case .code, .connecting: return 2
        case .connected: return 3
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
                        information: "Choose which Mac apps you can launch from your display. Use the switch beside Apps to select or deselect all apps. Enabled apps are available for app shortcuts; switch an app off to hide it from the display."
                    )
                    Spacer()
                    Toggle("Select all apps", isOn: Binding(
                        get: { store.allApplicationsApproved },
                        set: { store.setAllApplications(approved: $0) }
                    ))
                    .labelsHidden()
                    .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                    .controlSize(.mini)
                    .disabled(store.availableApps.isEmpty)
                    .help("Select or deselect all apps")
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
                            .controlSize(.large)
                            .modifier(CompanionCapsuleButton())
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
                        .controlSize(.large)
                        .modifier(CompanionCapsuleButton())
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

    @ViewBuilder
    private var accessibilityAndStartupSections: some View {
        if !accessibilityGranted {
            Section("Accessibility") {
                CompanionAccessibilityRow()
            }
        }
        Section("Startup") {
            CompanionPermissionRow(
                title: "Open at Startup",
                information: store.supportsLaunchAtLogin
                    ? (store.launchAtLoginMessage.isEmpty
                       ? "Open EspDesktop automatically after you sign in."
                       : store.launchAtLoginMessage)
                    : "Install EspDesktop in Applications to open it automatically at login.",
                isEnabled: store.launchAtLoginBinding(),
                isAvailable: store.supportsLaunchAtLogin
            )
        }
    }

    private var helpPage: some View {
        Form {
            Section {
                Link("Buy Me a Coffee", destination: CompanionStore.buyMeACoffeeURL)
                    .help("Contribute to ongoing support and new features")
                Link("Give Feedback", destination: CompanionStore.issuesURL)
                Link("Get Help", destination: CompanionStore.supportURL)
            } header: {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Help EspDesktop grow")
                        .font(.title2.weight(.semibold))
                    Text("Your contributions help fund ongoing support and new features.")
                        .font(.title3)
                        .fontWeight(.regular)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 16)
            }
            Section {
                Link("Privacy Policy", destination: CompanionStore.privacyPolicyURL)
                Button("Restart Setup") { confirmingRestartSetup = true }
                    .buttonStyle(.link)
            } header: {
                Text("Support")
                    .padding(.top, 16)
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
        let selection = self.selection
        context.coordinator.toolbar.selectedItemIdentifier = .init(selection.rawValue)
        context.coordinator.updateSelection()
    }

    static func dismantleNSView(_ nsView: WindowObserver, coordinator: Coordinator) {
        nsView.onWindowChange = nil
        coordinator.attach(to: nil)
    }

    final class WindowObserver: NSView {
        var onWindowChange: ((NSWindow?) -> Void)?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.onWindowChange?(self.window)
            }
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

        func updateSelection() {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                let identifier = NSToolbarItem.Identifier(self.selection.wrappedValue.rawValue)
                if self.toolbar.selectedItemIdentifier != identifier {
                    self.toolbar.selectedItemIdentifier = identifier
                }
            }
        }

        func attach(to window: NSWindow?) {
            guard self.window !== window else { return }
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
