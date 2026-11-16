import Foundation

/// Filesystem discovery runs independently of the UI actor.
actor ApplicationCatalogue {
    static let sharedApplications = URL(fileURLWithPath: "/Applications", isDirectory: true)
    static let userApplications = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Applications", isDirectory: true)

    func scan() -> [LaunchableApp] {
        let standardRoots = [
            Self.sharedApplications,
            URL(fileURLWithPath: "/System/Applications"),
            Self.userApplications,
        ]
        let cryptexRoots = [
            // Current macOS releases install Safari in the protected Cryptex
            // application volume and expose only a compatibility link in /Applications.
            URL(fileURLWithPath: "/System/Cryptexes/App/System/Applications"),
        ]
        let keys: Set<URLResourceKey> = [.isDirectoryKey]
        var found: [LaunchableApp] = []

        func appendApplication(at url: URL) {
            guard let bundle = Bundle(url: url), let id = bundle.bundleIdentifier else { return }
            let name = (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
                ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String)
                ?? url.deletingPathExtension().lastPathComponent
            found.append(LaunchableApp(
                bundleIdentifier: id,
                name: name,
                url: url
            ))
        }

        func scanApplicationRoots(_ roots: [URL]) {
            for root in roots {
                guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: Array(keys), options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { continue }
                for case let url as URL in enumerator where url.pathExtension == "app" {
                    appendApplication(at: url)
                }
            }
        }
        appendApplication(at: URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app"))
        scanApplicationRoots(standardRoots)
        scanApplicationRoots(cryptexRoots)
        return Dictionary(grouping: found, by: \.bundleIdentifier)
            .compactMap { $0.value.first }
            .sorted { lhs, rhs in
                let nameOrder = lhs.name.localizedCaseInsensitiveCompare(rhs.name)
                if nameOrder == .orderedSame { return lhs.bundleIdentifier < rhs.bundleIdentifier }
                return nameOrder == .orderedAscending
            }
    }

}
