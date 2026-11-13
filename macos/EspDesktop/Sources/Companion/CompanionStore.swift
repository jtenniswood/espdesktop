import AppKit
import Combine
import Foundation
import ServiceManagement
import SwiftUI

struct LaunchableApp: Identifiable, Hashable, Sendable {
    let bundleIdentifier: String
    let name: String
    let url: URL

    var id: String { bundleIdentifier }

    static func == (lhs: LaunchableApp, rhs: LaunchableApp) -> Bool {
        lhs.bundleIdentifier == rhs.bundleIdentifier && lhs.name == rhs.name && lhs.url == rhs.url
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(bundleIdentifier)
        hasher.combine(name)
        hasher.combine(url)
    }
}

struct ApprovedFolder: Codable, Identifiable, Hashable {
    static let actionPrefix = "folder."

    let id: UUID
    let name: String
    let path: String

    init(id: UUID, name: String, path: String) {
        self.id = id
        self.name = name
        self.path = path
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, path, bookmarkData
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        name = try values.decode(String.self, forKey: .name)
        if let savedPath = try values.decodeIfPresent(String.self, forKey: .path) {
            path = savedPath
            return
        }
        if let bookmarkData = try values.decodeIfPresent(Data.self, forKey: .bookmarkData) {
            var isStale = false
            if let resolvedURL = try? URL(
                resolvingBookmarkData: bookmarkData,
                options: [],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            ) {
                path = resolvedURL.path
                return
            }
        }
        throw DecodingError.dataCorruptedError(
            forKey: .path,
            in: values,
            debugDescription: "Approved folder has no usable local path"
        )
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(name, forKey: .name)
        try values.encode(path, forKey: .path)
    }

    var needsReapproval: Bool {
        var isDirectory: ObjCBool = false
        return !FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) || !isDirectory.boolValue
    }

    var actionIdentifier: String { Self.actionPrefix + id.uuidString.lowercased() }

    static func identifier(from actionIdentifier: String) -> UUID? {
        guard actionIdentifier.hasPrefix(actionPrefix) else { return nil }
        return UUID(uuidString: String(actionIdentifier.dropFirst(actionPrefix.count)))
    }

    static func actionIdentifier(forFocusedPath path: String, in folders: [ApprovedFolder]) -> String {
        guard !path.isEmpty else { return "" }
        let focusedPath = URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath().path
        return folders.first { folder in
            URL(fileURLWithPath: folder.path).standardizedFileURL.resolvingSymlinksInPath().path == focusedPath
        }?.actionIdentifier ?? ""
    }
}

@MainActor
final class CompanionStore: NSObject, ObservableObject {
    let updater = CompanionUpdater()
    @Published var settingsRequestID: UUID?
    var requestedSettingsDestination: CompanionSettingsDestination = .displays
    static let privacyPolicyURL = URL(string: "https://espdesktop.com/reference/privacy")!
    static let issuesURL = URL(string: "https://github.com/jtenniswood/espdesktop/issues")!
    static let supportURL = URL(string: "https://espdesktop.com/getting-started/troubleshooting")!
    static let buyMeACoffeeURL = URL(string: "https://www.buymeacoffee.com/jtenniswood")!

    @Published var onboardingCompleted: Bool {
        didSet { defaults.set(onboardingCompleted, forKey: Keys.onboardingCompleted) }
    }
    @Published private(set) var displays: [CompanionDisplay] = []
    @Published private(set) var connectedDisplayCount = 0
    @Published private(set) var pairingState: CompanionConnectionState = .disconnected
    private(set) var pairingRecoveryMessage = ""
    var hasSavedPairing: Bool { !displays.isEmpty }
    var hasSavedPairingInProgress: Bool { pairingDisplay.hasSavedPairing }
    var panelHost: String {
        get { pairingDisplay.panelHost }
        set { pairingDisplay.panelHost = newValue }
    }
    var panelDisplayName: String {
        get { pairingDisplay.record.name }
        set { pairingDisplay.record.name = newValue }
    }
    @Published private(set) var availableApps: [LaunchableApp] = []
    @Published private(set) var approvedApplicationIdentifiers: Set<String>
    @Published private(set) var approvedFolders: [ApprovedFolder]
    @Published private(set) var folderMessage: String?
    @Published private(set) var foldersNeedingAccess: Set<UUID> = []
    @Published private(set) var launchAtLoginEnabled = false
    @Published private(set) var launchAtLoginMessage = ""
    @Published private(set) var systemMetricsStatus = "Waiting for a display connection"

    private enum Keys {
        static let onboardingCompleted = "companion.onboarding.completed"
        static let approvedApplications = "approvedApplications"
        static let knownApplications = "knownApplications"
        static let approvedFolders = "approvedFolders"
    }
    private static let preferencesSuite = "io.espdesktop.app"
    private let defaults: UserDefaults
    private let savedDisplays: CompanionSavedDisplays
    private var forgettingDisplays: Set<UUID> = []
    private lazy var pairingDisplay = makeDisplay(CompanionDisplayRecord())
    private(set) var isRePairing = false
    var canRetryRePairing: Bool { isRePairing && pairingDisplay.connection.isPairing }
    private var connectedDisplays: [CompanionDisplay] { displays.filter { $0.state == .connected } }
    private var metricsDisplays: [CompanionDisplay] { connectedDisplays.filter(\.supportsSystemMetrics) }
    private var systemMetricsActive = false
    private let mediaController: any MediaControlling
    private let systemMetricsProvider: any SystemMetricsProviding
    private let remoteCatalogueStore = RemoteCompanionCatalogueStore()
    private var latestSystemMetricsSnapshot: CompanionSystemMetricsSnapshot?
    private let sessionLock = MacSessionLockMonitor()
    private var mediaControlTimer: Timer?
    private var focusTimer: Timer?
    private var activatedApplicationPID: pid_t?
    private var browserFocusQuery: Task<URL?, Never>?
    private var browserFocusGeneration = 0
    private var lastMediaControlValues: [String: Int] = [:]

    override convenience init() {
        self.init(
            mediaController: SystemMediaController(),
            systemMetricsProvider: SystemMetricsProvider()
        )
    }

    init(
        mediaController: any MediaControlling,
        systemMetricsProvider: any SystemMetricsProviding,
        defaults: UserDefaults? = nil
    ) {
        self.mediaController = mediaController
        self.systemMetricsProvider = systemMetricsProvider
        let stableDefaults = defaults ?? (Bundle.main.bundleIdentifier == Self.preferencesSuite
            ? UserDefaults.standard
            : (UserDefaults(suiteName: Self.preferencesSuite) ?? .standard))
        self.defaults = stableDefaults
        let savedDisplays = CompanionSavedDisplays(defaults: stableDefaults)
        self.savedDisplays = savedDisplays
        approvedApplicationIdentifiers = Set(
            stableDefaults.stringArray(forKey: Keys.approvedApplications) ?? []
        )
        approvedFolders = stableDefaults.data(forKey: Keys.approvedFolders)
            .flatMap { try? JSONDecoder().decode([ApprovedFolder].self, from: $0) }
            ?? []
        let records = savedDisplays.load { KeychainStore.accounts(service: KeychainStore.service) }
        onboardingCompleted = stableDefaults.bool(forKey: Keys.onboardingCompleted) || !records.isEmpty
        super.init()
        displays = records.map(makeDisplay)
        sessionLock.onChange = { [weak self] locked, displayAwake in
            self?.publishToConnectedDisplays { $0.publishSessionLock(locked, displayAwake: displayAwake) }
        }
        sessionLock.start()
        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(frontmostApplicationDidChange(_:)),
            name: NSWorkspace.didActivateApplicationNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(systemTimeZoneDidChange(_:)),
            name: NSNotification.Name.NSSystemTimeZoneDidChange,
            object: nil
        )
        if onboardingCompleted { stableDefaults.set(true, forKey: Keys.onboardingCompleted) }
        systemMetricsProvider.onSnapshot = { [weak self] snapshot in
            guard let self else { return }
            guard !metricsDisplays.isEmpty else { return }
            latestSystemMetricsSnapshot = snapshot
            systemMetricsStatus = "Sharing processor, memory, storage, network and battery statistics"
            for display in metricsDisplays { display.connection.publishSystemMetrics(snapshot) }
        }
        if supportsLaunchAtLogin { refreshLaunchAtLoginStatus() }
        refreshApplications()
        Task { await remoteCatalogueStore.refresh() }
    }

    private func makeDisplay(_ record: CompanionDisplayRecord) -> CompanionDisplay {
        let display = CompanionDisplay(record: record, defaults: defaults, resources: self)
        display.isNewCertificate = { [weak self, weak display] fingerprint in
            guard let self, let display else { return false }
            return !displays.contains { $0.id != display.id && $0.certificateFingerprint == fingerprint }
        }
        display.onRecordChange = { [weak self, weak display] in
            guard let self, let display else { return }
            objectWillChange.send()
            guard display.hasSavedPairing else { return }
            if !displays.contains(where: { $0.id == display.id }) { displays.append(display) }
            savedDisplays.save(displays.map(\.record))
        }
        display.connection.onEvent = { [weak self, weak display] event in
            guard let self, let display else { return }
            receiveSessionEvent(event, from: display)
        }
        return display
    }

    private func publishToConnectedDisplays(_ publish: (CompanionConnection) -> Void) {
        for display in connectedDisplays { publish(display.connection) }
    }

    var supportsLaunchAtLogin: Bool {
        Bundle.main.bundleURL.pathExtension.lowercased() == "app"
    }
    func launchAtLoginBinding() -> Binding<Bool> {
        Binding(
            get: { self.launchAtLoginEnabled },
            set: { self.setLaunchAtLogin($0) }
        )
    }

    private func setLaunchAtLogin(_ enabled: Bool) {
        guard supportsLaunchAtLogin else { return }
        let service = SMAppService.mainApp
        do {
            if enabled {
                if service.status == .notRegistered || service.status == .notFound {
                    try service.register()
                }
            } else if service.status != .notRegistered && service.status != .notFound {
                try service.unregister()
            }
            refreshLaunchAtLoginStatus()
        } catch {
            refreshLaunchAtLoginStatus()
            launchAtLoginMessage = "macOS could not update this login item. Install the app in Applications and try again."
        }
    }

    func refreshLaunchAtLoginStatus() {
        switch SMAppService.mainApp.status {
        case .enabled:
            launchAtLoginEnabled = true
            launchAtLoginMessage = "The app will open automatically after you sign in."
        case .requiresApproval:
            launchAtLoginEnabled = true
            launchAtLoginMessage = "Allow the app in System Settings → General → Login Items to finish enabling it."
        case .notFound:
            launchAtLoginEnabled = false
            launchAtLoginMessage = "Install the app in Applications before enabling this setting."
        default:
            launchAtLoginEnabled = false
            launchAtLoginMessage = "The app will stay closed when you sign in."
        }
    }

    private let applicationCatalogue = ApplicationCatalogue()
    private var applicationScan: Task<Void, Never>?
    private(set) var applicationCatalogueReady = false

    func refreshApplications() {
        guard applicationScan == nil else { return }
        applicationScan = Task { [weak self, applicationCatalogue] in
            let applications = await applicationCatalogue.scan()
            guard let self else { return }
            let identifiers = Set(applications.map(\.bundleIdentifier))
            let previousIdentifiers = defaults.stringArray(forKey: Keys.knownApplications)
            // Preserve existing selections when upgrading. Fresh installs and newly
            // discovered apps default on; previously disabled apps stay disabled.
            let known = Set(previousIdentifiers ?? [])
            if previousIdentifiers != nil {
                approvedApplicationIdentifiers.formUnion(identifiers.subtracting(known))
            } else if defaults.object(forKey: Keys.approvedApplications) == nil {
                approvedApplicationIdentifiers.formUnion(identifiers)
            }
            if !identifiers.isEmpty {
                defaults.set(known.union(identifiers).sorted(), forKey: Keys.knownApplications)
                defaults.set(approvedApplicationIdentifiers.sorted(), forKey: Keys.approvedApplications)
            }
            availableApps = applications
            applicationCatalogueReady = true
            applicationScan = nil
            publishToConnectedDisplays { $0.publishCatalogue() }
        }
    }

    func launchableApps() -> [LaunchableApp] {
        availableApps.filter { approvedApplicationIdentifiers.contains($0.bundleIdentifier) }
    }

    func appIconPixels(bundleIdentifier: String, pixelSide: Int) -> Data? {
        guard let application = launchableApps().first(where: { $0.bundleIdentifier == bundleIdentifier }) else {
            return nil
        }
        let icon = NSWorkspace.shared.icon(forFile: application.url.path)
        guard [CompanionCapabilities.appIconSide, CompanionCapabilities.appIconLegacySide].contains(pixelSide) else { return nil }
        guard let bitmap = NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: pixelSide, pixelsHigh: pixelSide,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                isPlanar: false, colorSpaceName: .deviceRGB,
                bytesPerRow: 0, bitsPerPixel: 0
              ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        context.imageInterpolation = .high
        context.compositingOperation = .copy
        NSColor.clear.setFill()
        NSBezierPath(rect: NSRect(x: 0, y: 0, width: pixelSide, height: pixelSide)).fill()
        context.compositingOperation = .sourceOver
        let iconSize = icon.size
        guard iconSize.width > 0, iconSize.height > 0 else {
            NSGraphicsContext.restoreGraphicsState()
            return nil
        }
        let scale = min(CGFloat(pixelSide) / iconSize.width, CGFloat(pixelSide) / iconSize.height)
        // macOS app artwork includes generous transparent edge padding. Draw
        // it slightly oversized so the visible icon aligns with the card
        // label's inset while keeping the image centered in its square slot.
        let artworkScale: CGFloat = 1.2
        let fittedSize = NSSize(width: iconSize.width * scale * artworkScale,
                                height: iconSize.height * scale * artworkScale)
        // Ask AppKit for a high-resolution representation before the final
        // downsample, rather than magnifying a small cached workspace image.
        var sourceRect = NSRect(x: 0, y: 0, width: max(512, pixelSide * 2),
                                height: max(512, pixelSide * 2))
        let renderingIcon = icon.cgImage(forProposedRect: &sourceRect, context: nil, hints: nil)
            .map { NSImage(cgImage: $0, size: iconSize) } ?? icon
        renderingIcon.draw(
            in: NSRect(x: (CGFloat(pixelSide) - fittedSize.width) / 2,
                       y: (CGFloat(pixelSide) - fittedSize.height) / 2,
                       width: fittedSize.width, height: fittedSize.height),
            from: .zero, operation: .sourceOver, fraction: 1,
            respectFlipped: true, hints: nil
        )
        context.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        let pixelCount = pixelSide * pixelSide
        var pixels = Data(count: pixelCount * 3)
        for y in 0..<pixelSide {
            for x in 0..<pixelSide {
                guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { return nil }
                let pixel = y * pixelSide + x
                let alpha = UInt8((color.alphaComponent * 255).rounded())
                // Keep a useful matte in the RGB plane for older panel firmware,
                // while RGB565A8 panels use the alpha plane for clean rounded edges.
                let matte: CGFloat = alpha == 0 ? 0.16 : 0
                let red = UInt16(((alpha == 0 ? matte : color.redComponent) * 255).rounded())
                let green = UInt16(((alpha == 0 ? matte : color.greenComponent) * 255).rounded())
                let blue = UInt16(((alpha == 0 ? matte : color.blueComponent) * 255).rounded())
                let rgb565 = ((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3)
                let colorOffset = pixel * 2
                pixels[colorOffset] = UInt8(rgb565 & 0xff)
                pixels[colorOffset + 1] = UInt8(rgb565 >> 8)
                pixels[pixelCount * 2 + pixel] = alpha
            }
        }
        return pixels
    }

    func applicationIsApproved(_ application: LaunchableApp) -> Bool {
        approvedApplicationIdentifiers.contains(application.bundleIdentifier)
    }

    var allApplicationsApproved: Bool {
        !availableApps.isEmpty && availableApps.allSatisfy { applicationIsApproved($0) }
    }

    func setAllApplications(approved: Bool) {
        let identifiers = Set(availableApps.map(\.bundleIdentifier))
        if approved {
            approvedApplicationIdentifiers.formUnion(identifiers)
        } else {
            approvedApplicationIdentifiers.subtract(identifiers)
        }
        defaults.set(approvedApplicationIdentifiers.sorted(), forKey: Keys.approvedApplications)
        publishToConnectedDisplays { $0.publishCatalogue() }
    }

    func setApplication(_ application: LaunchableApp, approved: Bool) {
        if approved {
            approvedApplicationIdentifiers.insert(application.bundleIdentifier)
        } else {
            approvedApplicationIdentifiers.remove(application.bundleIdentifier)
        }
        defaults.set(approvedApplicationIdentifiers.sorted(), forKey: Keys.approvedApplications)
        publishToConnectedDisplays { $0.publishCatalogue() }
    }

    func folderActions() -> [ApprovedFolder] { approvedFolders }
    func remoteCompanionCatalogues() -> RemoteCompanionCatalogues { remoteCatalogueStore.value }
    func focusedLaunchableApplicationIdentifier() -> String {
        guard let application = NSWorkspace.shared.frontmostApplication,
              (application.bundleIdentifier == "com.apple.finder" ||
               CompanionWindowDetector.hasVisibleWindow(for: application)),
              let identifier = application.bundleIdentifier,
              approvedApplicationIdentifiers.contains(identifier),
              availableApps.contains(where: { $0.bundleIdentifier == identifier }) else { return "" }
        return identifier
    }

    func focusedCompanionActionIdentifier() async -> String {
        await focusedCompanionActionIdentifiers(for: []).first ?? ""
    }

    func immediateFocusedApplicationIdentifier() -> String? {
        // NSWorkspace has already confirmed foreground activation. Do not put
        // window enumeration or browser/Finder AppleScript on the colour path.
        let application = NSWorkspace.shared.frontmostApplication
        if let expected = activatedApplicationPID, application?.processIdentifier != expected { return nil }
        guard let identifier = application?.bundleIdentifier,
              approvedApplicationIdentifiers.contains(identifier) else { return "" }
        return identifier
    }

    func focusedCompanionActionIdentifiers(for targets: [(id: String, url: URL)]) async -> [String] {
        // Activation notifications can arrive before NSWorkspace updates its
        // frontmostApplication cache. Never confirm the previous app as current.
        let expectedPID = activatedApplicationPID
        let ready = await CompanionFocusQuery.waitForApplication(
            isExpectedApplication: {
                expectedPID == nil || NSWorkspace.shared.frontmostApplication?.processIdentifier == expectedPID
            }
        )
        guard !Task.isCancelled else { return [] }
        if activatedApplicationPID == expectedPID { activatedApplicationPID = nil }
        guard ready else { return [] }
        return await CompanionFocusQuery.readStable(
            currentApplication: { NSWorkspace.shared.frontmostApplication?.processIdentifier },
            query: { await self.queryFocusedCompanionActionIdentifiers(for: targets) }
        )
    }

    private func queryFocusedCompanionActionIdentifiers(for targets: [(id: String, url: URL)]) async -> [String] {
        guard let application = NSWorkspace.shared.frontmostApplication,
              let bundleIdentifier = application.bundleIdentifier else { return [] }
        if bundleIdentifier == "com.apple.Safari" || bundleIdentifier == "com.google.Chrome" {
            let browser = focusedLaunchableApplicationIdentifier()
            guard !targets.isEmpty else {
                return browser.isEmpty ? [] : [browser]
            }
            let activeURL = await sharedActiveBrowserTabURL(bundleIdentifier: bundleIdentifier)
            guard let url = activeURL else {
                return browser.isEmpty ? [] : [browser]
            }
            var matches = browser.isEmpty ? [] : [browser]
            matches.append(contentsOf: ActiveTabURLMatcher.matchingURLCardIDs(url: url, targets: targets))
            return matches
        }
        if bundleIdentifier == "com.apple.finder" {
            let folder = await focusedFinderFolderActionIdentifier()
            let result = folder.isEmpty ? focusedLaunchableApplicationIdentifier() : folder
            return result.isEmpty ? [] : [result]
        }
        guard approvedApplicationIdentifiers.contains(bundleIdentifier) else { return [] }
        let visible = await CompanionFocusQuery.waitForVisibleWindow(
            isCurrentApplication: {
                NSWorkspace.shared.frontmostApplication?.processIdentifier == application.processIdentifier
            },
            hasVisibleWindow: { CompanionWindowDetector.hasVisibleWindow(for: application) }
        )
        guard visible, approvedApplicationIdentifiers.contains(bundleIdentifier) else { return [] }
        return [bundleIdentifier]
    }

    private func sharedActiveBrowserTabURL(bundleIdentifier: String) async -> URL? {
        if let browserFocusQuery { return await browserFocusQuery.value }
        let generation = browserFocusGeneration
        let query = Task { [weak self] in
            await self?.activeBrowserTabURL(bundleIdentifier: bundleIdentifier)
        }
        browserFocusQuery = query
        let url = await query.value
        guard generation == browserFocusGeneration else { return nil }
        browserFocusQuery = nil
        return url
    }

    private func invalidateBrowserFocusQuery() {
        browserFocusGeneration += 1
        browserFocusQuery?.cancel()
        browserFocusQuery = nil
    }

    private func activeBrowserTabURL(bundleIdentifier: String) async -> URL? {
        let application = bundleIdentifier == "com.apple.Safari" ? "Safari" : "Google Chrome"
        let tab = bundleIdentifier == "com.apple.Safari" ? "current tab" : "active tab"
        let source = """
        tell application "\(application)"
            try
                if (count of windows) is 0 then return ""
                return URL of \(tab) of front window
            on error
                return ""
            end try
        end tell
        """
        guard let rawURL = await CompanionAppleScript.run(source),
              NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundleIdentifier,
              let url = URL(string: rawURL),
              (url.scheme == "http" || url.scheme == "https"), url.host != nil else { return nil }
        return url
    }

    private func focusedFinderFolderActionIdentifier() async -> String {
        guard !approvedFolders.isEmpty else { return "" }
        guard let path = await focusedFinderFolderPath() else { return "" }
        return ApprovedFolder.actionIdentifier(forFocusedPath: path, in: approvedFolders)
    }

    private func focusedFinderFolderPath() async -> String? {
        let source = """
        tell application "Finder"
            try
                set currentTarget to insertion location
                return POSIX path of (currentTarget as alias)
            on error
                return ""
            end try
        end tell
        """
        guard let path = await CompanionAppleScript.run(source),
              NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.apple.finder",
              !path.isEmpty else { return nil }
        return path
    }

    @objc private func frontmostApplicationDidChange(_ notification: Notification) {
        guard connectedDisplayCount > 0 else { return }
        let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        invalidateBrowserFocusQuery()
        activatedApplicationPID = application?.processIdentifier
        let activated = application?.bundleIdentifier
        let approved = activated.map { approvedApplicationIdentifiers.contains($0) ? $0 : "" }
        // Use the activation event itself rather than a possibly older cached
        // frontmostApplication value while this notification is being delivered.
        publishToConnectedDisplays {
            $0.publishFocusedAction(invalidatePendingQuery: true, activatedApplicationIdentifier: approved)
        }
    }

    @objc private func systemTimeZoneDidChange(_: Notification) {
        publishToConnectedDisplays { $0.publishTimezone() }
    }

    func folderNeedsAccess(_ folder: ApprovedFolder) -> Bool {
        folder.needsReapproval || foldersNeedingAccess.contains(folder.id)
    }

    func chooseFolder(restoring folder: ApprovedFolder? = nil) {
        folderMessage = nil
        let panel = NSOpenPanel()
        panel.title = folder.map { "Choose a new location for \($0.name)" } ?? "Choose a folder for your display"
        panel.prompt = folder == nil ? "Add Folder" : "Choose Folder"
        if let folder {
            if folder.path.hasPrefix("/") {
                panel.directoryURL = URL(fileURLWithPath: folder.path).deletingLastPathComponent()
            }
            panel.message = "Choose the folder that should be used by this display card."
        }
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let selected = panel.url else { return }

        let url = selected.standardizedFileURL
        if let folder, approvedFolders.contains(where: { $0.id != folder.id && $0.path == url.path }) {
            folderMessage = "That folder is already available. Choose a different folder."
            return
        }
        if let folder {
            guard let index = approvedFolders.firstIndex(where: { $0.id == folder.id }) else { return }
            foldersNeedingAccess.remove(folder.id)
            approvedFolders[index] = ApprovedFolder(id: folder.id, name: folder.name, path: url.path)
            persistApprovedFolders()
            folderMessage = "Folder updated for \(folder.name)."
            publishToConnectedDisplays { $0.publishCatalogue() }
            return
        }
        guard !approvedFolders.contains(where: { $0.path == url.path }) else {
            folderMessage = "That folder is already available on your display."
            return
        }
        let displayName = url.lastPathComponent.isEmpty ? url.path : url.lastPathComponent
        approvedFolders.append(ApprovedFolder(id: UUID(), name: displayName, path: url.path))
        approvedFolders.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        persistApprovedFolders()
        publishToConnectedDisplays { $0.publishCatalogue() }
    }

    func removeFolder(_ folder: ApprovedFolder) {
        folderMessage = nil
        foldersNeedingAccess.remove(folder.id)
        approvedFolders.removeAll { $0.id == folder.id }
        persistApprovedFolders()
        publishToConnectedDisplays { $0.publishCatalogue() }
    }

    private func persistApprovedFolders() {
        if let data = try? JSONEncoder().encode(approvedFolders) {
            defaults.set(data, forKey: Keys.approvedFolders)
        }
    }

    func connectSavedDisplays() {
        for display in displays where display.record.connectAtLaunch && !display.panelHost.isEmpty {
            display.connection.connect(mode: .authenticate)
        }
    }

    func setConnection(_ enabled: Bool, for display: CompanionDisplay) {
        guard display.state != .needsPairing, displays.contains(where: { $0.id == display.id }) else { return }
        display.record.connectAtLaunch = enabled
        if enabled {
            display.connection.connect(mode: .authenticate)
        } else {
            display.connection.disconnect()
        }
    }

    func openPanelWebServer(_ display: CompanionDisplay) {
        _ = openPanelWebServer(host: display.panelHost, tab: nil)
    }

    func openPanelPairing() -> Bool {
        openPanelWebServer(host: panelHost, tab: "connectors", connector: "mac_companion")
    }

    func openPanelSetup() -> Bool {
        openPanelWebServer(host: panelHost, setup: true)
    }

    private func openPanelWebServer(host: String, tab: String? = nil, connector: String? = nil, setup: Bool = false) -> Bool {
        guard let url = Self.panelWebServerURL(from: host, tab: tab, connector: connector, setup: setup),
              NSWorkspace.shared.open(url) else {
            updateStatus("Could not open display settings")
            return false
        }
        return true
    }

    static func panelWebServerURL(
        from value: String,
        tab: String? = nil,
        connector: String? = nil,
        setup: Bool = false
    ) -> URL? {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: raw.contains("://") ? raw : "http://\(raw)"),
              let host = parsed.host,
              ConnectionEndpointPolicy.isLocalHost(host) else { return nil }
        var components = URLComponents()
        components.scheme = parsed.scheme?.lowercased() == "https" ? "https" : "http"
        components.host = host
        if let tab {
            components.queryItems = [URLQueryItem(name: "tab", value: tab)]
        }
        if let connector {
            components.queryItems = (components.queryItems ?? []) + [
                URLQueryItem(name: "connector", value: connector),
            ]
        }
        if setup {
            components.queryItems = (components.queryItems ?? []) + [URLQueryItem(name: "setup", value: "1")]
        }
        return components.url
    }
    func isSavedDisplay(fingerprint: String) -> Bool {
        displays.contains { $0.certificateFingerprint == fingerprint }
    }

    func resetPairing() {
        let previous = pairingDisplay
        let wasRePairing = isRePairing
        isRePairing = false
        pairingDisplay = makeDisplay(CompanionDisplayRecord())
        if wasRePairing {
            previous.connection.cancelRePairing()
        } else if !previous.hasSavedPairing {
            previous.connection.disconnect()
        }
        pairingRecoveryMessage = ""
        pairingState = .disconnected
    }

    func prepareRePairing(_ display: CompanionDisplay) -> Bool {
        guard display.state == .needsPairing, displays.contains(where: { $0 === display }) else { return false }
        resetPairing()
        pairingDisplay = display
        isRePairing = true
        return true
    }

    func pair(code: String) {
        guard isRePairing || !pairingDisplay.hasSavedPairing,
              !pairingState.isBusy, ConnectionEndpointPolicy.isLocalEndpoint(panelHost),
              let normalizedCode = CompanionPairingInput.normalizedCode(code) else { return }
        pairingDisplay.connection.connect(mode: .pair(code: normalizedCode))
    }

    func forgetDisplay(_ display: CompanionDisplay) async {
        guard displays.contains(where: { $0 === display }), forgettingDisplays.insert(display.id).inserted else { return }
        defer { forgettingDisplays.remove(display.id) }
        await display.connection.showPairingBeforeDisconnecting()
        display.connection.disconnect()
        display.onRecordChange = nil
        display.connection.onEvent = nil
        displays.removeAll { $0.id == display.id }
        savedDisplays.save(displays.map(\.record))
        let account = display.pairingAccount
        KeychainStore.remove(service: KeychainStore.service, account: account)
        defaults.removeObject(forKey: "companion.certificateFingerprint.\(account)")
        defaults.removeObject(forKey: "companion.authenticationSequence.\(account)")
        if display === pairingDisplay { resetPairing() }
    }

    private func receiveSessionEvent(_ event: CompanionSessionEvent, from display: CompanionDisplay) {
        switch event {
        case let .connection(message, state, recovery):
            updateConnectionStatus(message, state: state, recovery: recovery, for: display)
        case let .status(message):
            updateStatus(message)
        case let .capabilities(systemMetrics):
            display.supportsSystemMetrics = systemMetrics
            updateSystemMetricsProvider()
        case .publishCurrentState:
            sessionLock.refresh()
            display.connection.publishSessionLock(sessionLock.locked, displayAwake: sessionLock.displayAwake)
            if display.supportsSystemMetrics, let snapshot = latestSystemMetricsSnapshot {
                display.connection.publishSystemMetrics(snapshot, force: true)
            }
            publishMediaControlValues(force: true, to: display)
        }
    }

    private func updateConnectionStatus(_ message: String, state: CompanionConnectionState,
                                        recovery: String?, for display: CompanionDisplay) {
        objectWillChange.send()
        display.recoveryMessage = recovery ?? (display.hasSavedPairing && !display.connection.isPairing
            ? "Check that your display is on and connected to the same network, then try Connect again."
            : "Start pairing on your display and enter the current pairing code to try again.")
        display.state = state
        if display === pairingDisplay {
            pairingRecoveryMessage = display.recoveryMessage
            pairingState = state
        }
        updateStatus(message)
        if state != .connected { display.supportsSystemMetrics = false }
        let previousCount = connectedDisplayCount
        connectedDisplayCount = connectedDisplays.count
        updateSystemMetricsProvider()
        if state == .connected {
            if previousCount == 0 { startMediaControlPublishing() }
            Task { [weak display] in
                await remoteCatalogueStore.refresh()
                if let display, display.state == .connected { display.connection.publishCatalogue() }
            }
        } else if previousCount > 0 && connectedDisplayCount == 0 {
            mediaControlTimer?.invalidate()
            mediaControlTimer = nil
            focusTimer?.invalidate()
            focusTimer = nil
            activatedApplicationPID = nil
            invalidateBrowserFocusQuery()
            lastMediaControlValues = [:]
        }
    }

    func updateStatus(_ message: String) {
        print("[EspDesktop] \(message)")
    }

    private func updateSystemMetricsProvider() {
        let active = !metricsDisplays.isEmpty
        guard systemMetricsActive != active else { return }
        systemMetricsActive = active
        if active {
            systemMetricsStatus = "Collecting Mac system statistics…"
            systemMetricsProvider.start()
        } else {
            systemMetricsProvider.stop()
            latestSystemMetricsSnapshot = nil
            systemMetricsStatus = "Waiting for a display connection"
        }
    }

    func launch(bundleIdentifier: String) async -> Bool {
        guard let app = launchableApps().first(where: { $0.bundleIdentifier == bundleIdentifier }) else { return false }
        // Approval still applies when the app is already open. Avoid reopening
        // the current app (which can also create an unwanted extra window).
        if let frontmost = NSWorkspace.shared.frontmostApplication,
           frontmost.bundleIdentifier == bundleIdentifier,
           CompanionWindowDetector.hasVisibleWindow(for: frontmost) {
            return true
        }
        if let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
            .first(where: { !$0.isTerminated && !$0.isHidden }),
           CompanionWindowDetector.hasVisibleWindow(for: running),
           running.activate(options: [.activateIgnoringOtherApps]) {
            return await waitForApplicationActivation(bundleIdentifier, name: app.name)
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        let runningApplication: NSRunningApplication? = await withCheckedContinuation { continuation in
            NSWorkspace.shared.openApplication(at: app.url, configuration: configuration) { application, error in
                continuation.resume(returning: error == nil ? application : nil)
            }
        }
        guard let runningApplication else { return false }
        _ = runningApplication.activate(options: [.activateIgnoringOtherApps])
        return await waitForApplicationActivation(bundleIdentifier, name: app.name)
    }

    private func waitForApplicationActivation(_ bundleIdentifier: String, name: String) async -> Bool {
        for _ in 0..<150 {
            guard !Task.isCancelled else { return false }
            if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundleIdentifier {
                return true
            }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        updateStatus("\(name) did not become active")
        return false
    }

    func performResultStatus(actionIdentifier: String,
                             folderOpenBehavior: String = "new_window") async -> String {
        guard !sessionLock.refresh() else { return "not_allowed" }
        let performed = await perform(actionIdentifier: actionIdentifier,
                                      folderOpenBehavior: folderOpenBehavior)
        return Self.actionResultStatus(actionIdentifier: actionIdentifier, performed: performed)
    }

    nonisolated static func actionResultStatus(actionIdentifier: String, performed: Bool) -> String {
        guard performed else { return "not_allowed" }
        let isApplicationLaunch = !actionIdentifier.hasPrefix(ApprovedFolder.actionPrefix)
            && !actionIdentifier.hasPrefix(CompanionKeyboardShortcut.actionPrefix)
        return isApplicationLaunch ? "activated" : "performed"
    }

    func openFolder(actionIdentifier: String, behavior: String = "new_window") -> Bool {
        guard let identifier = ApprovedFolder.identifier(from: actionIdentifier),
              let folder = approvedFolders.first(where: { $0.id == identifier }) else {
            updateStatus("Blocked an unavailable folder")
            return false
        }
        let url = URL(fileURLWithPath: folder.path)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            foldersNeedingAccess.insert(folder.id)
            folderMessage = "Choose a new location for \(folder.name) in Folders."
            updateStatus("This folder is no longer available")
            return false
        }
        guard behavior == "same_window" else { return NSWorkspace.shared.open(url) }
        let escapedPath = folder.path
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        let source = """
        tell application "Finder"
            set targetFolder to POSIX file "\(escapedPath)" as alias
            if (count of Finder windows) > 0 then
                set target of front Finder window to targetFolder
            else
                open targetFolder
            end if
            activate
        end tell
        """
        var error: NSDictionary?
        guard NSAppleScript(source: source)?.executeAndReturnError(&error) != nil else {
            updateStatus("Finder could not open \(folder.name) in the current window")
            return false
        }
        return true
    }

    func perform(actionIdentifier: String, folderOpenBehavior: String = "new_window") async -> Bool {
        if actionIdentifier.hasPrefix(ApprovedFolder.actionPrefix) {
            return openFolder(actionIdentifier: actionIdentifier, behavior: folderOpenBehavior)
        }

        // Keep legacy window identifiers from falling through to application launch.
        guard !actionIdentifier.hasPrefix("window.") else { return false }

        guard actionIdentifier.hasPrefix(CompanionKeyboardShortcut.actionPrefix) else {
            return await launch(bundleIdentifier: actionIdentifier)
        }
        if actionIdentifier.hasPrefix(CompanionKeyboardShortcut.installedWebAppActionPrefix) {
            guard let application = NSWorkspace.shared.frontmostApplication,
                  let shortcut = CompanionKeyboardShortcut.installedWebAppShortcut(
                    actionIdentifier, frontmostBundleIdentifier: application.bundleIdentifier,
                    approvedBundleIdentifiers: approvedApplicationIdentifiers
                  ) else {
                updateStatus("Bring the approved Safari web app for this shortcut to the front")
                return false
            }
            guard shortcut.replay(to: application.processIdentifier) else {
                updateStatus("Allow EspDesktop in Privacy & Security → Accessibility")
                return false
            }
            return true
        }
        guard let shortcut = CompanionKeyboardShortcut(actionIdentifier: actionIdentifier) else {
            updateStatus("Blocked an invalid keyboard shortcut")
            return false
        }
        let keys = String(actionIdentifier.dropFirst(CompanionKeyboardShortcut.actionPrefix.count))
        if CompanionKeyboardShortcut.isSafariUnmodifiedShortcut(keys),
           !CompanionKeyboardShortcut.isSafariApplication(NSWorkspace.shared.frontmostApplication?.bundleIdentifier) {
            updateStatus("Bring Safari or the installed Safari web app to the front to use this shortcut")
            return false
        }
        if CompanionKeyboardShortcut.isBooksExtendedShortcut(keys),
           NSWorkspace.shared.frontmostApplication?.bundleIdentifier != CompanionKeyboardShortcut.booksBundleIdentifier {
            updateStatus("Bring Books to the front to use this shortcut")
            return false
        }
        var targetPID: pid_t?
        if actionIdentifier.hasPrefix(CompanionKeyboardShortcut.actionPrefix),
           CompanionKeyboardShortcut.isClaudeScopedShortcut(keys) {
            guard let application = NSWorkspace.shared.frontmostApplication,
                  application.bundleIdentifier == CompanionKeyboardShortcut.claudeDesktopBundleIdentifier else {
                updateStatus("Bring Claude Desktop to the front to use this shortcut")
                return false
            }
            targetPID = application.processIdentifier
        } else if actionIdentifier == CompanionKeyboardShortcut.actionPrefix + CompanionKeyboardShortcut.chatGPTClearUnreads {
            guard let application = NSWorkspace.shared.frontmostApplication,
                  application.bundleIdentifier == CompanionKeyboardShortcut.chatGPTDesktopBundleIdentifier else {
                updateStatus("Bring ChatGPT Desktop to the front to clear unread chats")
                return false
            }
            targetPID = application.processIdentifier
        }
        guard shortcut.replay(to: targetPID) else {
            updateStatus("Allow EspDesktop in Privacy & Security → Accessibility")
            return false
        }
        if keys == CompanionKeyboardShortcut.claudeRewindShortcut, let targetPID {
            do {
                try await Task.sleep(for: .milliseconds(80))
            } catch {
                return false
            }
            guard !sessionLock.refresh(),
                  NSWorkspace.shared.frontmostApplication?.processIdentifier == targetPID else { return false }
            return shortcut.replay(to: targetPID)
        }
        return true
    }

    func setMediaControlValue(_ value: Int, controlIdentifier: String) -> Bool {
        guard !sessionLock.refresh() else { return false }
        guard mediaController.setValue(value, controlIdentifier: controlIdentifier) else { return false }
        publishMediaControlValues(force: true)
        return true
    }

    private func startMediaControlPublishing() {
        if mediaControlTimer == nil {
            mediaControlTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.publishMediaControlValues()
                }
            }
        }
        if focusTimer == nil {
            // Tabs and Finder folders do not generate app-activation events.
            // Keep their polling independent of the slower audio-level timer.
            let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in self?.publishToConnectedDisplays { $0.publishFocusedAction() } }
            }
            RunLoop.main.add(timer, forMode: .common)
            focusTimer = timer
        }
        publishToConnectedDisplays { $0.publishFocusedAction() }
    }

    private func publishMediaControlValues(force: Bool = false, to display: CompanionDisplay? = nil) {
        guard connectedDisplayCount > 0 else { return }
        let values = mediaController.values()
        guard force || values != lastMediaControlValues else { return }
        let unavailable = mediaController.unavailableVolumeIDs(
            values: values,
            previousValues: lastMediaControlValues,
            force: force
        )
        if let display {
            display.connection.publishMediaControlValues(values, unavailable: unavailable)
        } else {
            lastMediaControlValues = values
            publishToConnectedDisplays { $0.publishMediaControlValues(values, unavailable: unavailable) }
        }
    }

    func openURL(encodedURL: String, newWindow: Bool) async -> Bool {
        guard !sessionLock.refresh() else { return false }
        guard encodedURL.utf8.count <= 128,
              let value = encodedURL.removingPercentEncoding,
              let components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(),
              (scheme == "http" || scheme == "https"),
              components.host != nil,
              components.user == nil,
              components.password == nil,
              let url = components.url else {
            updateStatus("Blocked an invalid URL")
            return false
        }
        let browserURL = NSWorkspace.shared.urlForApplication(toOpen: url)
        let browserID = browserURL.flatMap { Bundle(url: $0)?.bundleIdentifier }
        if let script = CompanionBrowserOpen.script(browserID: browserID, newWindow: newWindow) {
            let result = await CompanionAppleScript.run(script, arguments: [url.absoluteString], timeout: 20)
            if result == "opened" { return true }
            if newWindow || result != "denied" {
                updateStatus("Could not open the link. Check the browser's Automation permission in System Settings.")
                return false
            }
        } else if newWindow {
            updateStatus("Opening a link in a new window requires Safari or Google Chrome as the default browser")
            return false
        }

        guard !sessionLock.refresh(), !Task.isCancelled else { return false }
        let opened = NSWorkspace.shared.open(url)
        if !opened {
            updateStatus("macOS could not open this URL in the default browser")
        }
        return opened
    }
}

extension CompanionStore: CompanionSessionResources {}
