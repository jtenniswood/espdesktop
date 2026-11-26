import Foundation

/// Filesystem discovery runs independently of the UI actor.
actor ApplicationCatalogue {
    static let sharedApplications = URL(fileURLWithPath: "/Applications", isDirectory: true)
    static let userApplications = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Applications", isDirectory: true)

    static let applicationRoots = [
        sharedApplications,
        URL(fileURLWithPath: "/System/Applications"),
        userApplications,
        // Current macOS releases install Safari in the protected Cryptex
        // application volume and expose only a compatibility link in /Applications.
        URL(fileURLWithPath: "/System/Cryptexes/App/System/Applications"),
    ]

    func scan() -> [LaunchableApp] {
        scan(roots: Self.applicationRoots, externalVolumes: Self.mountedExternalVolumes())
    }

    static func mountedExternalVolumes() -> [URL] {
        let keys: Set<URLResourceKey> = [
            .volumeIsInternalKey, .volumeIsLocalKey, .volumeIsRemovableKey, .volumeIsEjectableKey,
        ]
        let volumes = FileManager.default.mountedVolumeURLs(
            includingResourceValuesForKeys: Array(keys), options: [.skipHiddenVolumes]
        ) ?? []
        return volumes.filter { url in
            guard let values = try? url.resourceValues(forKeys: keys) else { return false }
            return values.volumeIsLocal == true && (
                values.volumeIsInternal == false || values.volumeIsRemovable == true || values.volumeIsEjectable == true
            )
        }.sorted { $0.path < $1.path }
    }

    func scan(roots: [URL], externalVolumes: [URL] = []) -> [LaunchableApp] {
        let keys: Set<URLResourceKey> = [.isAliasFileKey, .isSymbolicLinkKey]
        var found: [LaunchableApp] = []
        var aliases: [URL] = []

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

        appendApplication(at: URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app"))
        for root in roots {
            guard let enumerator = FileManager.default.enumerator(
                at: root, includingPropertiesForKeys: Array(keys), options: [.skipsHiddenFiles, .skipsPackageDescendants]
            ) else { continue }
            for case let url as URL in enumerator {
                let values = try? url.resourceValues(forKeys: keys)
                if values?.isAliasFile == true, values?.isSymbolicLink != true {
                    aliases.append(url)
                } else if url.pathExtension == "app" {
                    appendApplication(at: url)
                }
            }
        }

        // Installed bundles take precedence over aliases with the same bundle identifier.
        for alias in aliases {
            guard let target = try? URL(resolvingAliasFileAt: alias, options: [.withoutUI, .withoutMounting]),
                  target.pathExtension.lowercased() == "app",
                  (try? target.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else { continue }
            appendApplication(at: target)
        }
        // Keep the installed or explicitly aliased copy when the same app is on a drive.
        let externalKeys: Set<URLResourceKey> = [.isDirectoryKey, .isSymbolicLinkKey]
        for volume in externalVolumes {
            guard let enumerator = FileManager.default.enumerator(
                at: volume, includingPropertiesForKeys: Array(externalKeys), options: [.skipsHiddenFiles, .skipsPackageDescendants]
            ) else { continue }
            for case let url as URL in enumerator where url.pathExtension.lowercased() == "app" {
                guard let values = try? url.resourceValues(forKeys: externalKeys),
                      values.isDirectory == true, values.isSymbolicLink == false else { continue }
                enumerator.skipDescendants()
                appendApplication(at: url)
            }
        }

        return Dictionary(grouping: found, by: \.bundleIdentifier)
            .compactMap { $0.value.first }
            .sorted { lhs, rhs in
                let nameOrder = lhs.name.localizedCaseInsensitiveCompare(rhs.name)
                if nameOrder == .orderedSame { return lhs.bundleIdentifier < rhs.bundleIdentifier }
                return nameOrder == .orderedAscending
            }
    }
}
