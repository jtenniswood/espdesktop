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
        let encodedSize = (try? JSONEncoder().encode(app).count) ?? Int.max
        return app.version == 1 && !app.label.isEmpty && app.label.utf8.count <= 48 &&
        app.appId.range(of: #"^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$"#, options: .regularExpression) != nil &&
        !app.shortcuts.isEmpty && app.shortcuts.allSatisfy(valid) &&
        Set(app.shortcuts.map(\.id)).count == app.shortcuts.count && encodedSize <= 12_000
    }

    fileprivate static func valid(_ shortcut: RemoteShortcutDefinition) -> Bool {
        guard shortcut.id.range(of: #"^(0|[1-9][0-9]{0,2})$"#, options: .regularExpression) != nil,
              !shortcut.label.isEmpty, shortcut.label.utf8.count <= 48, !shortcut.icon.isEmpty else { return false }
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
        if let native = try? await loadCatalogue(directory: "app_shortcuts") {
            next = RemoteCompanionCatalogues(version: max(next.version, native.version),
                                             applications: native.applications)
        }
        guard next != value, Self.valid(next), let encoded = try? JSONEncoder().encode(next) else { return }
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
        let result = RemoteCompanionCatalogues(version: 1, applications: applications)
        return Self.valid(result) ? result : .empty
    }

    private static func valid(_ catalogues: RemoteCompanionCatalogues) -> Bool {
        catalogues.version > 0 && catalogues.applications.allSatisfy(RemoteCompanionCatalogues.valid) &&
            Set(catalogues.applications.map(\.appId)).count == catalogues.applications.count
    }
}
