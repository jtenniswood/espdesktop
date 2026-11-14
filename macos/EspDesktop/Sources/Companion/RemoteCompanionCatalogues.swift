import Foundation

struct RemoteShortcutDefinition: Codable, Sendable, Equatable {
    let id: String
    let label: String
    let shortcut: String
    let icon: String
}

struct RemoteMacApplicationDefinition: Codable, Sendable, Equatable {
    let version: Int
    var appId: String
    let label: String
    let catalog: Bool
    var defaultShortcutIds: [String]?
    var shortcuts: [RemoteShortcutDefinition]
    var extendedShortcuts: [RemoteShortcutDefinition]?
    var additionalShortcuts: [RemoteShortcutDefinition]?
    var claudeShortcuts: [RemoteShortcutDefinition]?
    var safariShortcuts: [RemoteShortcutDefinition]?
    var moreShortcuts: [RemoteShortcutDefinition]?

    var starter: Self {
        var app = self
        app.moreShortcuts = nil
        return app
    }

    func expandedPages() -> [Self] {
        guard let moreShortcuts, !moreShortcuts.isEmpty else { return [] }
        var page = starter
        page.shortcuts = []
        page.defaultShortcutIds = nil
        page.extendedShortcuts = nil
        page.additionalShortcuts = nil
        page.claudeShortcuts = nil
        page.safariShortcuts = nil
        // At the catalogue's field limits, 52 entries still fit the escaped
        // 16 KB frame. This also leaves room for every bundled app to sync.
        let pageSize = 52
        return stride(from: 0, to: moreShortcuts.count, by: pageSize).map { offset in
            var chunk = page
            chunk.moreShortcuts = Array(moreShortcuts[offset..<min(offset + pageSize, moreShortcuts.count)])
            return chunk
        }
    }
}

struct RemoteCatalogueManifest: Decodable, Sendable {
    struct Entry: Decodable, Sendable {
        let path: String
    }
    let formatVersion: Int
    let catalogueVersion: Int
    let minimumCompanionVersion: String
    let entries: [Entry]
}

func decodeBundledCatalogueEntries<T: Decodable>(
    manifestData: Data,
    companionVersion: String,
    loadEntry: (String) -> Data?
) -> [T]? {
    guard let manifest = try? JSONDecoder().decode(RemoteCatalogueManifest.self, from: manifestData),
          manifest.formatVersion == 1,
          manifest.catalogueVersion > 0,
          !manifest.entries.isEmpty,
          manifest.entries.count <= 128,
          Set(manifest.entries.map(\.path)).count == manifest.entries.count,
          RemoteCompanionCatalogues.supports(manifest.minimumCompanionVersion, current: companionVersion) else {
        return nil
    }
    var definitions: [T] = []
    for entry in manifest.entries {
        guard !entry.path.hasPrefix("/"),
              !entry.path.split(separator: "/").contains(".."),
              entry.path.hasSuffix(".json"),
              entry.path.range(of: #"^[A-Za-z0-9._/-]+$"#, options: .regularExpression) != nil,
              let data = loadEntry(entry.path),
              let definition = try? JSONDecoder().decode(T.self, from: data) else { return nil }
        definitions.append(definition)
    }
    return definitions.count == manifest.entries.count ? definitions : nil
}

struct RemoteCompanionCatalogues: Codable, Sendable, Equatable {
    let version: Int
    let applications: [RemoteMacApplicationDefinition]

    static let empty = RemoteCompanionCatalogues(version: 1, applications: [])

    func applicationsForDisplay(approvedApps: [LaunchableApp]) -> [RemoteMacApplicationDefinition] {
        let athenaTemplateID = "io.github.jtenniswood.athena"
        guard let template = applications.first(where: { $0.appId == athenaTemplateID }) else { return applications }
        let existingIDs = Set(applications.map(\.appId))
        let installedTemplates = approvedApps.compactMap { app -> RemoteMacApplicationDefinition? in
            // Safari generates a different bundle ID for each installation. Match
            // Athena by its web manifest so renamed Dock icons still work.
            let id = app.bundleIdentifier
            guard !existingIDs.contains(id), id != "com.apple.Safari",
                  CompanionKeyboardShortcut.isSafariApplication(id),
                  let manifest = Bundle(url: app.url)?.object(forInfoDictionaryKey: "Manifest") as? [String: Any],
                  manifest["name"] as? String == "Athena for Hermes Agent" else { return nil }
            var installed = template
            installed.appId = id
            return installed
        }
        return applications.filter { $0.appId != athenaTemplateID } + installedTemplates
    }

    static func decode(
        nativeManifest: Data,
        nativeDefinitions: [Data],
        companionVersion: String
    ) throws -> RemoteCompanionCatalogues {
        let decoder = JSONDecoder()
        let nativeIndex = try decoder.decode(RemoteCatalogueManifest.self, from: nativeManifest)
        guard nativeIndex.formatVersion == 1,
              nativeDefinitions.count == nativeIndex.entries.count,
              supports(nativeIndex.minimumCompanionVersion, current: companionVersion) else {
            throw CatalogueError.incompatible
        }
        let apps = try nativeDefinitions.map { try decoder.decode(RemoteMacApplicationDefinition.self, from: $0) }
        guard apps.allSatisfy(valid), Set(apps.map(\.appId)).count == apps.count else {
            throw CatalogueError.invalid
        }
        return RemoteCompanionCatalogues(version: nativeIndex.catalogueVersion, applications: apps)
    }

    fileprivate static func supports(_ minimum: String, current: String) -> Bool {
        func parts(_ value: String) -> [Int]? {
            let values = value.split(separator: ".", omittingEmptySubsequences: false)
            guard !values.isEmpty, values.allSatisfy({ Int($0) != nil }) else { return nil }
            return values.compactMap { Int($0) }
        }
        guard let required = parts(minimum), let installed = parts(current) else { return false }
        let width = max(required.count, installed.count)
        for index in 0..<width {
            let lhs = index < installed.count ? installed[index] : 0
            let rhs = index < required.count ? required[index] : 0
            if lhs != rhs { return lhs > rhs }
        }
        return true
    }

    fileprivate static func valid(_ app: RemoteMacApplicationDefinition) -> Bool {
        let encodedSize = (try? JSONEncoder().encode(app.starter).count) ?? Int.max
        let extended = app.extendedShortcuts ?? []
        let additional = app.additionalShortcuts ?? []
        let claude = app.claudeShortcuts ?? []
        let safari = app.safariShortcuts ?? []
        let more = app.moreShortcuts ?? []
        let starterShortcuts = app.shortcuts + extended + additional + claude + safari
        let allShortcuts = starterShortcuts + more
        let allIDs = Set(allShortcuts.map(\.id))
        if let defaults = app.defaultShortcutIds {
            guard (1...8).contains(defaults.count), Set(defaults).count == defaults.count,
                  defaults.allSatisfy(allIDs.contains) else { return false }
        }
        let validSafari = safari.isEmpty ||
            (extended.isEmpty && CompanionKeyboardShortcut.isSafariTemplate(app.appId) &&
                safari.allSatisfy { validMetadata($0) && CompanionKeyboardShortcut.isSafariUnmodifiedShortcut($0.shortcut) })
        let validAdditional = additional.isEmpty ||
            (app.appId == CompanionKeyboardShortcut.chatGPTDesktopBundleIdentifier && !app.catalog &&
                additional.allSatisfy {
                    $0.shortcut == CompanionKeyboardShortcut.chatGPTClearUnreads ? validMetadata($0) : validRegularShortcut($0)
                })
        let validClaude = claude.isEmpty ||
            (app.appId == CompanionKeyboardShortcut.claudeDesktopBundleIdentifier && !app.catalog &&
                claude.allSatisfy {
                    validRegularShortcut($0) || (validMetadata($0) && CompanionKeyboardShortcut.isClaudeScopedShortcut($0.shortcut))
                })
        return app.version == 1 && !app.label.isEmpty && app.label.utf8.count <= 48 &&
        app.appId.range(of: #"^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$"#, options: .regularExpression) != nil &&
        !app.shortcuts.isEmpty && app.shortcuts.count + extended.count + safari.count <= 64 && starterShortcuts.count <= 96 &&
        more.count <= 900 && more.allSatisfy { validRegularShortcut($0) ||
            (validMetadata($0) && CompanionKeyboardShortcut.scopedStrokes($0.shortcut) != nil) } &&
        app.shortcuts.allSatisfy(validRegularShortcut) &&
        (extended.isEmpty ||
            (CompanionKeyboardShortcut.isSafariTemplate(app.appId) &&
                extended.allSatisfy { validMetadata($0) && CompanionKeyboardShortcut.isSafariUnmodifiedShortcut($0.shortcut) }) ||
            (app.appId == CompanionKeyboardShortcut.booksBundleIdentifier && !app.catalog &&
                extended.allSatisfy { validMetadata($0) && CompanionKeyboardShortcut.isBooksExtendedShortcut($0.shortcut) })) &&
        validAdditional && validClaude && validSafari &&
        allIDs.count == allShortcuts.count && encodedSize <= 12_000
    }

    private static func validRegularShortcut(_ shortcut: RemoteShortcutDefinition) -> Bool {
        validMetadata(shortcut) &&
            !CompanionKeyboardShortcut.isBooksExtendedShortcut(shortcut.shortcut) &&
            !CompanionKeyboardShortcut.isClaudeScopedShortcut(shortcut.shortcut) &&
            !CompanionKeyboardShortcut.isSafariUnmodifiedShortcut(shortcut.shortcut) &&
            shortcut.shortcut != CompanionKeyboardShortcut.chatGPTClearUnreads &&
            CompanionKeyboardShortcut(actionIdentifier: CompanionKeyboardShortcut.actionPrefix + shortcut.shortcut) != nil
    }

    private static func validMetadata(_ shortcut: RemoteShortcutDefinition) -> Bool {
        shortcut.id.range(of: #"^(0|[1-9][0-9]{0,2})$"#, options: .regularExpression) != nil &&
            !shortcut.label.isEmpty && shortcut.label.utf8.count <= 48 &&
            !shortcut.icon.isEmpty && shortcut.icon.utf8.count <= 48 &&
            !shortcut.label.unicodeScalars.contains { $0.value < 32 } &&
            !shortcut.icon.unicodeScalars.contains { $0.value < 32 }
    }

    enum CatalogueError: Error { case incompatible, invalid }
}

struct ActiveTabURLMatcher {
    static func matchingURLCardIDs(url: URL?, targets: [(id: String, url: URL)]) -> [String] {
        guard let url, let normalized = normalizedURL(url) else { return [] }
        return targets.filter { normalizedURL($0.url) == normalized }.map(\.id)
    }

    private static func normalizedURL(_ url: URL) -> String? {
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = parts.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = parts.host?.lowercased() else { return nil }
        parts.scheme = scheme
        parts.host = host
        if (scheme == "http" && parts.port == 80) || (scheme == "https" && parts.port == 443) { parts.port = nil }
        if parts.path.isEmpty { parts.path = "/" }
        return parts.string
    }
}

@MainActor
final class RemoteCompanionCatalogueStore {
    private static let cacheKey = "remoteCompanionCatalogues"
    private static let repositoryRoot = URL(string: "https://raw.githubusercontent.com/jtenniswood/espdesktop/main/product/v2/")!
    private let defaults: UserDefaults
    private let session: URLSession
    private(set) var value: RemoteCompanionCatalogues
    private var refreshTask: Task<Void, Never>?

    init(defaults: UserDefaults = UserDefaults(suiteName: "io.espdesktop.app") ?? .standard,
         session: URLSession = .shared) {
        self.defaults = defaults
        self.session = session
        value = Self.bundled()
        if let cache = defaults.data(forKey: Self.cacheKey),
           let decoded = try? JSONDecoder().decode(RemoteCompanionCatalogues.self, from: cache),
           decoded.version > value.version,
           Self.valid(decoded) {
            value = decoded
        }
    }

    func refresh() async {
        if let refreshTask {
            await refreshTask.value
            return
        }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.refreshOnce()
        }
        refreshTask = task
        await task.value
        refreshTask = nil
    }

    private func refreshOnce() async {
        guard let next = try? await loadCatalogue(directory: "app_shortcuts"),
              next.version >= value.version, next != value,
              Self.valid(next), let encoded = try? JSONEncoder().encode(next) else { return }
        defaults.set(encoded, forKey: Self.cacheKey)
        value = next
    }

    private func loadCatalogue(directory: String) async throws -> RemoteCompanionCatalogues {
        let manifestURL = Self.repositoryRoot.appendingPathComponent(directory).appendingPathComponent("manifest.json")
        let manifestData = try await download(manifestURL)
        let manifest = try JSONDecoder().decode(RemoteCatalogueManifest.self, from: manifestData)
        guard manifest.formatVersion == 1, manifest.catalogueVersion > 0,
              !manifest.entries.isEmpty, manifest.entries.count <= 128,
              Set(manifest.entries.map(\.path)).count == manifest.entries.count,
              RemoteCompanionCatalogues.supports(manifest.minimumCompanionVersion,
                  current: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0") else {
            throw RemoteCompanionCatalogues.CatalogueError.incompatible
        }
        var definitions: [Data] = []
        for entry in manifest.entries {
            guard !entry.path.hasPrefix("/"), !entry.path.split(separator: "/").contains(".."),
                  entry.path.range(of: #"^[A-Za-z0-9._/-]+$"#, options: .regularExpression) != nil else {
                throw RemoteCompanionCatalogues.CatalogueError.invalid
            }
            definitions.append(try await download(manifestURL.deletingLastPathComponent().appendingPathComponent(entry.path)))
        }
        let decoder = JSONDecoder()
        let apps = try definitions.map { try decoder.decode(RemoteMacApplicationDefinition.self, from: $0) }
        guard apps.allSatisfy(RemoteCompanionCatalogues.valid) else { throw RemoteCompanionCatalogues.CatalogueError.invalid }
        return RemoteCompanionCatalogues(version: manifest.catalogueVersion, applications: apps)
    }

    private func download(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
              data.count <= 256 * 1024 else { throw RemoteCompanionCatalogues.CatalogueError.invalid }
        return data
    }

    private static func bundled() -> RemoteCompanionCatalogues {
        let companionVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let folder = "AppShortcuts"
        guard let resources = Bundle.companionResources,
              let manifestURL = resources.url(forResource: "manifest", withExtension: "json", subdirectory: folder),
              let manifestData = try? Data(contentsOf: manifestURL),
              let manifest = try? JSONDecoder().decode(RemoteCatalogueManifest.self, from: manifestData) else { return .empty }
        let applications: [RemoteMacApplicationDefinition]? = decodeBundledCatalogueEntries(
            manifestData: manifestData, companionVersion: companionVersion
        ) { path in
            let relative = path as NSString
            let parent = relative.deletingLastPathComponent
            let subdirectory = parent.isEmpty || parent == "." ? folder : "\(folder)/\(parent)"
            let filename = relative.lastPathComponent as NSString
            return resources.url(
                forResource: filename.deletingPathExtension,
                withExtension: filename.pathExtension,
                subdirectory: subdirectory
            ).flatMap { try? Data(contentsOf: $0) }
        }
        guard let applications else { return .empty }
        let result = RemoteCompanionCatalogues(version: manifest.catalogueVersion, applications: applications)
        return Self.valid(result) ? result : .empty
    }

    private static func valid(_ catalogues: RemoteCompanionCatalogues) -> Bool {
        catalogues.version > 0 && catalogues.applications.allSatisfy(RemoteCompanionCatalogues.valid) &&
            Set(catalogues.applications.map(\.appId)).count == catalogues.applications.count
    }
}
