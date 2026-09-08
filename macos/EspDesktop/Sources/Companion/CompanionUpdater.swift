import AppKit
import Combine
import Sparkle
import SwiftUI

/// Sparkle owns the schedule, signed downloads, installer and native update UI.
@MainActor
final class CompanionUpdater: NSObject, ObservableObject, SPUUpdaterDelegate {
    @Published private(set) var isChecking = false
    @Published private(set) var message = ""
    @Published var automaticallyChecks = true {
        didSet {
            guard started, controller.updater.automaticallyChecksForUpdates != automaticallyChecks else { return }
            controller.updater.automaticallyChecksForUpdates = automaticallyChecks
            if automaticallyChecks { Task { await refreshPreviewFeed() } }
        }
    }
    @Published var automaticallyInstalls = false {
        didSet {
            guard started, controller.updater.automaticallyDownloadsUpdates != automaticallyInstalls else { return }
            controller.updater.automaticallyDownloadsUpdates = automaticallyInstalls
        }
    }
    @Published var includesPreReleases = UserDefaults.standard.bool(forKey: "updates.includesPreReleases") {
        didSet {
            UserDefaults.standard.set(includesPreReleases, forKey: "updates.includesPreReleases")
            previewFeedURL = nil
            if automaticallyChecks { Task { await refreshPreviewFeed() } }
        }
    }
    private var previewFeedURL: URL?
    private var previewTimer: Timer?
    private var discovery: (id: UUID, task: Task<URL?, Error>)?

    let installedVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Development build"
    private lazy var controller = SPUStandardUpdaterController(
        startingUpdater: false, updaterDelegate: self, userDriverDelegate: nil
    )
    private var observations = Set<AnyCancellable>()
    private var started = false

    func startAutomaticChecks() {
        guard !started else { return }
        guard Bundle.main.bundleURL.pathExtension == "app" else {
            message = "Install the packaged app to check for updates."
            return
        }
        do {
            try controller.updater.start()
            started = true
            if controller.updater.automaticallyChecksForUpdates { Task { await refreshPreviewFeed() } }
            previewTimer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, self.automaticallyChecks else { return }
                    await self.refreshPreviewFeed()
                }
            }
            previewTimer?.tolerance = 60
            automaticallyChecks = controller.updater.automaticallyChecksForUpdates
            automaticallyInstalls = controller.updater.automaticallyDownloadsUpdates
            controller.updater.publisher(for: \.automaticallyChecksForUpdates)
                .sink { [weak self] value in self?.automaticallyChecks = value }
                .store(in: &observations)
            controller.updater.publisher(for: \.automaticallyDownloadsUpdates)
                .sink { [weak self] value in self?.automaticallyInstalls = value }
                .store(in: &observations)
            controller.updater.publisher(for: \.canCheckForUpdates)
                .sink { [weak self] value in self?.isChecking = !value }
                .store(in: &observations)
        } catch {
            message = "The updater could not start. Reinstall the latest packaged EspDesktop app."
        }
    }

    func check() {
        startAutomaticChecks()
        guard started else {
            let alert = NSAlert()
            alert.messageText = "Companion Updates"
            alert.informativeText = message
            alert.runModal()
            return
        }
        guard controller.updater.canCheckForUpdates else { return }
        Task {
            if includesPreReleases {
                isChecking = true
                let resolved = await refreshPreviewFeed()
                isChecking = false
                guard resolved else {
                    let alert = NSAlert()
                    alert.messageText = "Couldn’t Check Pre-Release Updates"
                    alert.informativeText = "Check your internet connection and try again later."
                    alert.runModal()
                    return
                }
            }
            controller.checkForUpdates(nil)
        }
    }

    func feedURLString(for updater: SPUUpdater) -> String? {
        includesPreReleases ? previewFeedURL?.absoluteString : nil
    }

    /// Refresh the discovery cache before manual checks and hourly for scheduled
    /// checks. Sparkle still verifies the signed feed and archive before install.
    @discardableResult
    private func refreshPreviewFeed() async -> Bool {
        guard includesPreReleases else { previewFeedURL = nil; return true }
        let pending = discovery ?? (id: UUID(), task: Task {
            try await CompanionPreviewRelease.latestFeed(protocolVersion: CompanionCapabilities.protocolVersion)
        })
        discovery = pending
        defer { if discovery?.id == pending.id { discovery = nil } }
        do {
            let feed = try await pending.task.value
            guard includesPreReleases else { return true }
            previewFeedURL = feed
            message = ""
            return true
        } catch {
            guard includesPreReleases else { return true }
            previewFeedURL = nil
            message = "Couldn’t load pre-releases. Scheduled checks will use stable releases until discovery succeeds."
            return false
        }
    }
}

struct CompanionUpdateSettings: View {
    @ObservedObject var updater: CompanionUpdater

    var body: some View {
        Form {
            Section("Current Version") {
                LabeledContent("EspDesktop", value: updater.installedVersion)
                HStack {
                    if updater.isChecking || !updater.message.isEmpty {
                        Text(updater.isChecking ? "Checking for updates…" : updater.message)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if updater.isChecking { ProgressView().controlSize(.small) }
                    Button("Check Now") { updater.check() }
                        .disabled(updater.isChecking)
                }
            }
            Section("Automatic Updates") {
                Toggle("Automatically Check for Updates", isOn: $updater.automaticallyChecks)
                    .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                Toggle("Automatically Install Updates", isOn: $updater.automaticallyInstalls)
                    .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                    .disabled(!updater.automaticallyChecks)
            }
            Section("Pre-Release Updates") {
                Toggle("Check for Pre-Release Updates", isOn: $updater.includesPreReleases)
                    .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                    .disabled(updater.isChecking)
            }
        }
        .formStyle(.grouped)
    }
}

struct CompanionPreviewRelease: Decodable {
    struct Asset: Decodable {
        let name: String
        let state: String
        let size: Int
    }
    let tag_name: String
    let draft: Bool
    let assets: [Asset]

    func feedURL(protocolVersion: Int) -> URL? {
        guard !draft,
              tag_name.range(of: #"^v?[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$"#, options: .regularExpression) != nil else { return nil }
        let name = "companion-appcast-v\(protocolVersion).xml"
        guard assets.contains(where: { $0.name == name && $0.state == "uploaded" && $0.size > 0 }) else { return nil }
        return URL(string: "https://github.com/jtenniswood/espdesktop/releases/download/\(tag_name)/\(name)")
    }

    static func isNewer(_ candidate: String, than existing: String) -> Bool {
        let lhs = candidate.split(separator: "-", maxSplits: 1).map(String.init)
        let rhs = existing.split(separator: "-", maxSplits: 1).map(String.init)
        let coreOrder = lhs[0].compare(rhs[0], options: .numeric)
        if coreOrder != .orderedSame { return coreOrder == .orderedDescending }
        // A final release supersedes every preview of that same version.
        if lhs.count != rhs.count { return lhs.count == 1 }
        guard lhs.count == 2 else { return false }
        let left = lhs[1].split(separator: ".").map(String.init)
        let right = rhs[1].split(separator: ".").map(String.init)
        for (a, b) in zip(left, right) where a != b {
            let aNumeric = a.allSatisfy(\.isNumber)
            let bNumeric = b.allSatisfy(\.isNumber)
            if aNumeric != bNumeric { return !aNumeric }
            return a.compare(b, options: aNumeric ? .numeric : []) == .orderedDescending
        }
        return left.count > right.count
    }

    typealias Fetch = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    static func latestFeed(protocolVersion: Int, fetch: Fetch = { try await URLSession.shared.data(for: $0) }) async throws -> URL? {
        var latest: Self?
        for page in 1...10 {
            let url = URL(string: "https://api.github.com/repos/jtenniswood/espdesktop/releases?per_page=100&page=\(page)")!
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
            let (data, response) = try await fetch(request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let releases = try JSONDecoder().decode([Self].self, from: data)
            for release in releases {
                guard release.feedURL(protocolVersion: protocolVersion) != nil else { continue }
                let version = release.tag_name.hasPrefix("v") ? String(release.tag_name.dropFirst()) : release.tag_name
                let previous = latest.map { $0.tag_name.hasPrefix("v") ? String($0.tag_name.dropFirst()) : $0.tag_name }
                if previous == nil || isNewer(version, than: previous!) {
                    latest = release
                }
            }
            if releases.count < 100 { return latest?.feedURL(protocolVersion: protocolVersion) }
        }
        throw URLError(.dataLengthExceedsMaximum)
    }
}
