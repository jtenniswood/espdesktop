import Foundation
import XCTest
@testable import Companion

final class RemoteCompanionCataloguesTests: XCTestCase {
    @MainActor
    func testBundledClaudePresetsTakePriorityOverOlderCachedCatalogue() throws {
        let suite = "ClaudeCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let cached = RemoteCompanionCatalogues(version: 12, applications: [])
        defaults.set(try JSONEncoder().encode(cached), forKey: "remoteCompanionCatalogues")

        let catalogue = RemoteCompanionCatalogueStore(defaults: defaults).value
        XCTAssertGreaterThan(catalogue.version, cached.version)
        let claude = try XCTUnwrap(catalogue.applications.first {
            $0.appId == CompanionKeyboardShortcut.claudeDesktopBundleIdentifier
        })
        XCTAssertEqual(claude.shortcuts.count, 60)
        XCTAssertEqual(claude.additionalShortcuts?.count, 33)
        XCTAssertNil(claude.extendedShortcuts)
        XCTAssertTrue(claude.additionalShortcuts?.contains { $0.shortcut == "escape-twice" } == true)

        let json = String(decoding: try JSONEncoder().encode(claude), as: UTF8.self)
        let frame = try JSONSerialization.data(withJSONObject: [
            "type": "catalogue.definitions.page", "protocol": CompanionCapabilities.protocolVersion,
            "page": 0, "generation": 1, "complete": false,
            "items": [["kind": "application", "json": json]],
        ])
        XCTAssertNotNil(CompanionProtocolDecoder.decode(frame, direction: .macToPanel, state: .connected))
    }

    @MainActor
    func testBundledChatGPTPresetsFitInOneFrameAndKeepLegacyShortcutsReadable() throws {
        struct LegacyDefinition: Decodable {
            let shortcuts: [RemoteShortcutDefinition]
            let extendedShortcuts: [RemoteShortcutDefinition]?
        }
        let suite = "ChatGPTCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let catalogue = RemoteCompanionCatalogueStore(defaults: defaults).value
        let chatGPT = try XCTUnwrap(catalogue.applications.first {
            $0.appId == CompanionKeyboardShortcut.chatGPTDesktopBundleIdentifier
        })
        let data = try JSONEncoder().encode(chatGPT)
        let legacy = try JSONDecoder().decode(LegacyDefinition.self, from: data)
        XCTAssertEqual(legacy.shortcuts.count, 62)
        XCTAssertNil(legacy.extendedShortcuts)
        XCTAssertEqual(chatGPT.additionalShortcuts?.count, 10)
        XCTAssertTrue(chatGPT.additionalShortcuts?.contains { $0.shortcut == "shift+escape" } == true)
        let frame = try JSONSerialization.data(withJSONObject: [
            "type": "catalogue.definitions.page", "protocol": CompanionCapabilities.protocolVersion,
            "page": 0, "generation": 1, "complete": false,
            "items": [["kind": "application", "json": String(decoding: data, as: UTF8.self)]],
        ])
        XCTAssertNotNil(CompanionProtocolDecoder.decode(frame, direction: .macToPanel, state: .connected))
    }
    @MainActor
    func testBundledBooksPresetsTakePriorityOverOlderCachedCatalogue() throws {
        let suite = "BooksCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let cached = RemoteCompanionCatalogues(version: 12, applications: [])
        defaults.set(try JSONEncoder().encode(cached), forKey: "remoteCompanionCatalogues")

        let catalogue = RemoteCompanionCatalogueStore(defaults: defaults).value
        let books = try XCTUnwrap(catalogue.applications.first { $0.appId == "com.apple.iBooksX" })
        XCTAssertGreaterThan(catalogue.version, cached.version)
        XCTAssertEqual(books.extendedShortcuts?.map(\.shortcut), ["right", "left", "function+f", "space"])
    }

    func testExtendedShortcutsAreSeparateAndRestrictedToBooks() throws {
        struct LegacyDefinition: Decodable {
            let shortcuts: [RemoteShortcutDefinition]
        }
        let manifest = Data(#"{"formatVersion":1,"catalogueVersion":13,"minimumCompanionVersion":"1.0.0","entries":[{"path":"books.json"}]}"#.utf8)
        let app = #"{"version":1,"appId":"com.apple.iBooksX","label":"Books","catalog":false,"shortcuts":[{"id":"0","label":"Collection","shortcut":"command+n","icon":"Folder Plus"}],"extendedShortcuts":[{"id":"29","label":"Next Page","shortcut":"right","icon":"Page Next"}]}"#
        let decode: (String) throws -> RemoteCompanionCatalogues = { definition in
            try RemoteCompanionCatalogues.decode(nativeManifest: manifest, nativeDefinitions: [Data(definition.utf8)],
                                                 companionVersion: "1.0.0")
        }

        let catalogue = try decode(app)
        XCTAssertEqual(catalogue.applications.first?.extendedShortcuts?.map(\.shortcut), ["right"])
        XCTAssertEqual(try JSONDecoder().decode(LegacyDefinition.self, from: Data(app.utf8)).shortcuts.map(\.shortcut),
                       ["command+n"])
        XCTAssertThrowsError(try decode(app.replacingOccurrences(of: "com.apple.iBooksX", with: "com.example.Reader")))
        XCTAssertThrowsError(try decode(app.replacingOccurrences(of: #""29""#, with: #""0""#)))
        XCTAssertThrowsError(try decode(app.replacingOccurrences(of: #""right""#, with: #""a""#)))
    }

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
