import Foundation

struct RemoteShortcutDefinition: Codable, Sendable, Equatable {
    let id: String
    let label: String
    let shortcut: String
    let icon: String
}

struct RemoteMacApplicationDefinition: Codable, Sendable, Equatable {
    let version: Int
    let appId: String
    let label: String
    let catalog: Bool
    let shortcuts: [RemoteShortcutDefinition]
}

struct RemoteWebApplicationDefinition: Codable, Sendable, Equatable {
    let version: Int
    let id: String
    let label: String
    let url: String
    let matchHost: String
    let matchPath: String?
    let icon: String
    let shortcuts: [RemoteShortcutDefinition]
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
    let webApplications: [RemoteWebApplicationDefinition]

    static let empty = RemoteCompanionCatalogues(version: 1, applications: [], webApplications: [])

    static func decode(
        nativeManifest: Data,
        nativeDefinitions: [Data],
        webManifest: Data,
        webDefinitions: [Data],
        companionVersion: String
    ) throws -> RemoteCompanionCatalogues {
        let decoder = JSONDecoder()
        let nativeIndex = try decoder.decode(RemoteCatalogueManifest.self, from: nativeManifest)
        let webIndex = try decoder.decode(RemoteCatalogueManifest.self, from: webManifest)
        guard nativeIndex.formatVersion == 1, webIndex.formatVersion == 1,
              nativeDefinitions.count == nativeIndex.entries.count,
              webDefinitions.count == webIndex.entries.count,
              supports(nativeIndex.minimumCompanionVersion, current: companionVersion),
              supports(webIndex.minimumCompanionVersion, current: companionVersion) else {
            throw CatalogueError.incompatible
        }
        let apps = try nativeDefinitions.map { try decoder.decode(RemoteMacApplicationDefinition.self, from: $0) }
        let webApps = try webDefinitions.map { try decoder.decode(RemoteWebApplicationDefinition.self, from: $0) }
        guard apps.allSatisfy(valid), webApps.allSatisfy(valid),
              Set(apps.map(\.appId)).count == apps.count,
              Set(webApps.map(\.id)).count == webApps.count else {
            throw CatalogueError.invalid
        }
        return RemoteCompanionCatalogues(version: max(nativeIndex.catalogueVersion, webIndex.catalogueVersion),
                                         applications: apps, webApplications: webApps)
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
        app.version == 1 && !app.label.isEmpty &&
        app.appId.range(of: #"^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$"#, options: .regularExpression) != nil &&
        !app.shortcuts.isEmpty && app.shortcuts.allSatisfy(valid) &&
        Set(app.shortcuts.map(\.id)).count == app.shortcuts.count
    }

    fileprivate static func valid(_ app: RemoteWebApplicationDefinition) -> Bool {
        guard app.version == 1,
              app.id.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil,
              !app.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let target = URL(string: app.url), target.scheme == "https", target.host != nil,
              app.matchHost == app.matchHost.lowercased(), !app.matchHost.isEmpty,
              target.host?.lowercased() == app.matchHost,
              app.matchPath.map({ $0.hasPrefix("/") && !$0.contains("?") && !$0.contains("#") }) ?? true,
              let iconURL = URL(string: app.icon), iconURL.scheme == "https",
              iconURL.host == "raw.githubusercontent.com",
              iconURL.path.hasPrefix("/jtenniswood/espdesktop/main/product/v2/web_apps/icons/"),
              !iconURL.path.split(separator: "/").contains(".."),
              ["png", "jpg", "jpeg"].contains(iconURL.pathExtension.lowercased()),
              !app.shortcuts.isEmpty, app.shortcuts.allSatisfy(valid),
              Set(app.shortcuts.map(\.id)).count == app.shortcuts.count else { return false }
        return true
    }

    fileprivate static func valid(_ shortcut: RemoteShortcutDefinition) -> Bool {
        guard shortcut.id.range(of: #"^(0|[1-9][0-9]{0,2})$"#, options: .regularExpression) != nil,
              !shortcut.label.isEmpty, !shortcut.icon.isEmpty else { return false }
        let parts = shortcut.shortcut.split(separator: "+").map(String.init)
        guard let key = parts.last, parts.count >= 2 else { return false }
        let modifiers = parts.dropLast()
        let allowed = Set(["command", "control", "option", "shift"])
        return Set(modifiers).count == modifiers.count && modifiers.allSatisfy(allowed.contains) &&
            modifiers.contains(where: { $0 != "shift" }) &&
            (key.range(of: #"^[a-z0-9]$|^f(?:[1-9]|1[0-9]|20)$"#, options: .regularExpression) != nil ||
             Set("space enter tab escape delete forwarddelete left right up down home end pageup pagedown keycomma keyperiod keyslash keysemicolon keyquote keybackslash keyminus keyequal keybracketleft keybracketright keybackquote".split(separator: " ").map(String.init)).contains(key))
    }

    enum CatalogueError: Error { case incompatible, invalid }
}

struct ActiveTabURLMatcher {
    static func matchingConfiguredWebAppIDs(url: URL?, definitions: [RemoteWebApplicationDefinition], configuredIDs: Set<String>) -> [String] {
        matchingWebAppIDs(url: url, definitions: definitions).filter(configuredIDs.contains)
    }

    static func matchingWebAppIDs(url: URL?, definitions: [RemoteWebApplicationDefinition]) -> [String] {
        guard let url, let host = url.host?.lowercased(),
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return [] }
        let path = url.path.isEmpty ? "/" : url.path
        return definitions.filter { definition in
            guard definition.matchHost == host else { return false }
            guard let prefix = definition.matchPath, !prefix.isEmpty else { return true }
            return path == prefix || (path.hasPrefix(prefix.hasSuffix("/") ? prefix : prefix + "/"))
        }.sorted { ($0.matchPath?.count ?? 0) > ($1.matchPath?.count ?? 0) }.map(\.id)
    }

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
        var next = value
        if let native = try? await loadCatalogue(directory: "app_shortcuts", webApps: false) {
            next = RemoteCompanionCatalogues(version: max(next.version, native.version),
                                             applications: native.applications,
                                             webApplications: next.webApplications)
        }
        if let web = try? await loadCatalogue(directory: "web_apps", webApps: true) {
            next = RemoteCompanionCatalogues(version: max(next.version, web.version),
                                             applications: next.applications,
                                             webApplications: web.webApplications)
        }
        guard next != value, Self.valid(next), let encoded = try? JSONEncoder().encode(next) else { return }
        defaults.set(encoded, forKey: Self.cacheKey)
        value = next
    }

    private func loadCatalogue(directory: String, webApps: Bool) async throws -> RemoteCompanionCatalogues {
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
        if webApps {
            let apps = try definitions.map { try decoder.decode(RemoteWebApplicationDefinition.self, from: $0) }
            guard apps.allSatisfy(RemoteCompanionCatalogues.valid) else { throw RemoteCompanionCatalogues.CatalogueError.invalid }
            return RemoteCompanionCatalogues(version: manifest.catalogueVersion, applications: [], webApplications: apps)
        }
        let apps = try definitions.map { try decoder.decode(RemoteMacApplicationDefinition.self, from: $0) }
        guard apps.allSatisfy(RemoteCompanionCatalogues.valid) else { throw RemoteCompanionCatalogues.CatalogueError.invalid }
        return RemoteCompanionCatalogues(version: manifest.catalogueVersion, applications: apps, webApplications: [])
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
        func load<T: Decodable>(_ type: T.Type, folder: String) -> [T] {
            guard let manifestURL = Bundle.module.url(
                forResource: "manifest", withExtension: "json", subdirectory: folder
            ), let manifestData = try? Data(contentsOf: manifestURL) else { return [] }
            return decodeBundledCatalogueEntries(
                manifestData: manifestData, companionVersion: companionVersion
            ) { path in
                let relative = URL(fileURLWithPath: path)
                let parent = relative.deletingLastPathComponent().path
                let subdirectory = parent == "." ? folder : "\(folder)/\(parent)"
                return Bundle.module.url(
                    forResource: relative.deletingPathExtension().lastPathComponent,
                    withExtension: relative.pathExtension,
                    subdirectory: subdirectory
                ).flatMap { try? Data(contentsOf: $0) }
            } ?? []
        }
        let applications: [RemoteMacApplicationDefinition] = load(RemoteMacApplicationDefinition.self, folder: "AppShortcuts")
        let webApps: [RemoteWebApplicationDefinition] = load(RemoteWebApplicationDefinition.self, folder: "WebApps")
        let result = RemoteCompanionCatalogues(version: 1, applications: applications, webApplications: webApps)
        return Self.valid(result) ? result : .empty
    }

    private static func valid(_ catalogues: RemoteCompanionCatalogues) -> Bool {
        catalogues.version > 0 && catalogues.applications.allSatisfy(RemoteCompanionCatalogues.valid) &&
            catalogues.webApplications.allSatisfy(RemoteCompanionCatalogues.valid) &&
            Set(catalogues.applications.map(\.appId)).count == catalogues.applications.count &&
            Set(catalogues.webApplications.map(\.id)).count == catalogues.webApplications.count
    }
}
