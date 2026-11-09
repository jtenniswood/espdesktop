import Foundation
import XCTest
@testable import Companion

final class RemoteCompanionCataloguesTests: XCTestCase {
    @MainActor
    func testBundledSafariTemplatesTakePriorityOverOlderCachedCatalogue() throws {
        let suite = "SafariCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let cached = RemoteCompanionCatalogues(version: 12, applications: [])
        defaults.set(try JSONEncoder().encode(cached), forKey: "remoteCompanionCatalogues")

        let catalogue = RemoteCompanionCatalogueStore(defaults: defaults).value
        XCTAssertGreaterThan(catalogue.version, cached.version)
        for appId in ["com.apple.Safari", "com.apple.Safari.WebApp"] {
            let app = try XCTUnwrap(catalogue.applications.first { $0.appId == appId })
            XCTAssertEqual(app.extendedShortcuts?.map(\.shortcut), ["tab", "escape"])
        }
    }
    func testURLCardTargetsMatchFullConfiguredURLAndClearWhenUnavailable() throws {
        let target = try XCTUnwrap(URL(string: "https://example.com/docs?q=1#intro"))
        XCTAssertEqual(ActiveTabURLMatcher.matchingURLCardIDs(
            url: target, targets: [(id: "urlcard.0123456789abcdef", url: target)]
        ), ["urlcard.0123456789abcdef"])
        XCTAssertTrue(ActiveTabURLMatcher.matchingURLCardIDs(url: nil, targets: []).isEmpty)
        XCTAssertTrue(ActiveTabURLMatcher.matchingURLCardIDs(
            url: URL(string: "https://example.com/docs?q=2#intro"),
            targets: [(id: "urlcard.0123456789abcdef", url: target)]
        ).isEmpty)
    }

    func testRemoteCatalogueRequiresSupportedVersion() throws {
        let manifest = Data(#"{"formatVersion":1,"catalogueVersion":2,"minimumCompanionVersion":"1.0.0","entries":[{"path":"example.json"}]}"#.utf8)
        let app = Data(#"{"version":1,"appId":"org.example.Editor","label":"Editor","catalog":false,"shortcuts":[{"id":"0","label":"New","shortcut":"command+n","icon":"Plus"}]}"#.utf8)
        XCTAssertEqual(try RemoteCompanionCatalogues.decode(
            nativeManifest: manifest, nativeDefinitions: [app], companionVersion: "1.2.0"
        ).applications.map(\.appId), ["org.example.Editor"])
        XCTAssertThrowsError(try RemoteCompanionCatalogues.decode(
            nativeManifest: manifest, nativeDefinitions: [app], companionVersion: "0.9.0"
        ))
    }

    func testBundledDefinitionsAreLoadedFromEveryManifestEntry() throws {
        let manifest = Data(#"{"formatVersion":1,"catalogueVersion":7,"minimumCompanionVersion":"1.0.0","entries":[{"path":"custom/editor.json"},{"path":"custom/writer.json"}]}"#.utf8)
        let editor = Data(#"{"version":1,"appId":"org.example.Editor","label":"Editor","catalog":false,"shortcuts":[{"id":"0","label":"New","shortcut":"command+n","icon":"Plus"}]}"#.utf8)
        let writer = Data(#"{"version":1,"appId":"org.example.Writer","label":"Writer","catalog":false,"shortcuts":[{"id":"0","label":"New","shortcut":"command+n","icon":"Plus"}]}"#.utf8)
        var requestedPaths: [String] = []
        let entries: [RemoteMacApplicationDefinition]? = decodeBundledCatalogueEntries(
            manifestData: manifest,
            companionVersion: "1.2.0"
        ) { path in
            requestedPaths.append(path)
            return path == "custom/editor.json" ? editor : (path == "custom/writer.json" ? writer : nil)
        }
        XCTAssertEqual(requestedPaths, ["custom/editor.json", "custom/writer.json"])
        XCTAssertEqual(entries?.map(\.appId), ["org.example.Editor", "org.example.Writer"])
    }
}
