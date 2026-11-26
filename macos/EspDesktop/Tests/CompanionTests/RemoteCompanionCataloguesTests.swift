import Foundation
import XCTest
@testable import Companion

final class RemoteCompanionCataloguesTests: XCTestCase {
    @MainActor
    func testLargeBundledCatalogueFitsInBoundedFrames() throws {
        let suite = "ExpandedCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let catalogue = RemoteCompanionCatalogueStore(defaults: defaults).value
        let finalCut = try XCTUnwrap(catalogue.applications.first { $0.appId == "com.apple.FinalCut" })
        let more = try XCTUnwrap(finalCut.moreShortcuts)
        XCTAssertGreaterThan(more.count, 300)
        XCTAssertNil(finalCut.starter.moreShortcuts)
        XCTAssertEqual(finalCut.starter.defaultShortcutIds?.prefix(3), ["279", "18", "177"])
        XCTAssertTrue(finalCut.expandedPages().allSatisfy { $0.defaultShortcutIds == nil })
        XCTAssertEqual(finalCut.expandedPages().flatMap { $0.moreShortcuts ?? [] }, more)

        // Validate the actual escaped frames, including labels with punctuation.
        let encoder = JSONEncoder()
        for app in catalogue.applications {
            for (index, page) in ([app.starter] + app.expandedPages()).enumerated() {
                let data = try encoder.encode(page)
                let frame = try JSONSerialization.data(withJSONObject: [
                    "type": "catalogue.definitions.page", "protocol": CompanionCapabilities.protocolVersion,
                    "page": index, "generation": 1, "complete": false,
                    "items": [["kind": "application", "json": String(decoding: data, as: UTF8.self)]],
                ])
                XCTAssertNotNil(CompanionProtocolDecoder.decode(frame, direction: .macToPanel, state: .connected), app.appId)
                XCTAssertLessThanOrEqual(frame.count, CompanionCapabilities.maximumTextFrameBytes)
            }
        }
    }

    @MainActor
    func testRequestedAppWorksBeyondLegacyCatalogueLimit() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: UUID().uuidString))
        let bundled = RemoteCompanionCatalogueStore(defaults: defaults).value
        let brave = try XCTUnwrap(bundled.applications.first { $0.appId == "com.brave.Browser" })
        let applications = (0..<300).map { index in
            var app = brave
            app.appId = "org.example.App\(index)"
            return app
        }
        let catalogue = RemoteCompanionCatalogues(version: 42, applications: applications)
        var indexed: [String] = []
        for page in 0..<10 {
            let request = CompanionWireShortcutCatalogueRequest(
                requestId: 1, appId: "index", page: UInt32(page))
            let response = catalogue.shortcutPageResponse(request, approvedApps: [])
            let json = try XCTUnwrap(response["json"] as? String)
            let index = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: [[String: String]]])
            indexed += index["applications", default: []].compactMap { $0["appId"] }
            XCTAssertEqual(response["complete"] as? Bool, page == 9)
        }
        XCTAssertEqual(indexed, applications.map(\.appId))
        let appId = "org.example.App299"
        let expandedPageCount = brave.onDemandExpandedPages.count
        var ids: [String] = []
        for page in 0...expandedPageCount {
            let request = CompanionWireShortcutCatalogueRequest(
                requestId: 1, appId: appId, page: UInt32(page))
            var response = catalogue.shortcutPageResponse(request, approvedApps: [])
            response["protocol"] = CompanionCapabilities.protocolVersion
            let frame = try JSONSerialization.data(withJSONObject: response)
            guard case .shortcutCataloguePage(let result)? = CompanionProtocolDecoder.decode(
                frame, direction: .macToPanel, state: .connected) else {
                return XCTFail("The requested app page did not fit the protocol")
            }
            XCTAssertEqual(result.appId, appId)
            XCTAssertEqual(result.catalogueVersion, 42)
            XCTAssertEqual(result.complete, page == expandedPageCount)
            let json = try XCTUnwrap(result.json)
            let app = try JSONDecoder().decode(RemoteMacApplicationDefinition.self, from: Data(json.utf8))
            ids += (app.shortcuts + (app.moreShortcuts ?? [])).map(\.id)
        }
        XCTAssertEqual(ids, (brave.shortcuts + (brave.moreShortcuts ?? [])).map(\.id))
    }

    @MainActor
    func testExpandedCatalogueFitsFramesWithLongEscapedEntries() throws {
        let suite = "EscapedCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        var app = try XCTUnwrap(RemoteCompanionCatalogueStore(defaults: defaults).value.applications.first {
            $0.appId == "com.streamlabs.slobs"
        })
        let entries = (100..<164).map { id in
            RemoteShortcutDefinition(
                id: String(id), label: String(repeating: "\"", count: 48),
                shortcut: "scoped.command+control+option+shift+function+f20~command+control+option+shift+f20",
                icon: String(repeating: "/", count: 48)
            )
        }
        app.moreShortcuts = entries

        let pages = app.expandedPages()
        XCTAssertGreaterThan(pages.count, 1)
        XCTAssertEqual(pages.flatMap { $0.moreShortcuts ?? [] }, entries)
        for page in pages {
            let payload = try JSONEncoder().encode(page)
            XCTAssertLessThanOrEqual(payload.count, 12_000)
            let frame = try JSONSerialization.data(withJSONObject: [
                "type": "catalogue.definitions.page", "protocol": CompanionCapabilities.protocolVersion,
                "page": Int(UInt16.max), "generation": Int(UInt32.max), "complete": false,
                "items": [["kind": "application", "json": String(decoding: payload, as: UTF8.self)]],
            ])
            XCTAssertLessThanOrEqual(frame.count, CompanionCapabilities.maximumTextFrameBytes)
            XCTAssertNotNil(CompanionProtocolDecoder.decode(frame, direction: .macToPanel, state: .connected))
        }
    }

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
        XCTAssertEqual(claude.claudeShortcuts?.count, 33)
        XCTAssertTrue(claude.claudeShortcuts?.contains { $0.shortcut == "escape-twice" } == true)

        struct LegacyDefinition: Decodable {
            let shortcuts: [RemoteShortcutDefinition]
            let extendedShortcuts: [RemoteShortcutDefinition]?
            let additionalShortcuts: [RemoteShortcutDefinition]?
        }
        let data = try JSONEncoder().encode(claude)
        let legacy = try JSONDecoder().decode(LegacyDefinition.self, from: data)
        XCTAssertEqual(legacy.shortcuts.count, 60)
        XCTAssertNil(legacy.extendedShortcuts)
        XCTAssertNil(legacy.additionalShortcuts)

        let json = String(decoding: data, as: UTF8.self)
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
        XCTAssertEqual(legacy.shortcuts.count, 28)
        XCTAssertTrue(legacy.shortcuts.contains { $0.shortcut == "control+tab" })
        XCTAssertTrue(legacy.shortcuts.contains { $0.shortcut == "command+option+6" })
        XCTAssertNil(legacy.extendedShortcuts)
        XCTAssertNil(chatGPT.additionalShortcuts)
        XCTAssertEqual(chatGPT.moreShortcuts?.map(\.shortcut), ["scoped.up"])
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
            XCTAssertNil(app.extendedShortcuts)
            XCTAssertEqual(app.safariShortcuts?.map(\.shortcut), ["tab", "escape"])
        }
    }

    @MainActor
    func testWebsiteTemplatesUseApprovedSafariInstallationIDs() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        func installedApp(id: String, manifest: [String: String], path: String) throws -> LaunchableApp {
            let url = directory.appendingPathComponent(path + ".app")
            let contents = url.appendingPathComponent("Contents")
            try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
            let plist: [String: Any] = [
                "CFBundleIdentifier": id, "CFBundlePackageType": "AAPL",
                "Manifest": manifest,
            ]
            try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
                .write(to: contents.appendingPathComponent("Info.plist"))
            return LaunchableApp(bundleIdentifier: id, name: path, url: url)
        }

        let athena = try installedApp(id: "com.apple.Safari.WebApp." + UUID().uuidString,
                                      manifest: ["name": "Athena for Hermes Agent"], path: "Renamed App")
        let other = try installedApp(id: "com.apple.Safari.WebApp." + UUID().uuidString,
                                      manifest: ["name": "Twitch", "start_url": "https://www.twitch.tv.example.org/"],
                                     path: "Athena")
        let native = try installedApp(id: "com.example.athena",
                                       manifest: ["name": "Athena for Hermes Agent"], path: "Native App")
        let twitch = try installedApp(id: "com.apple.Safari.WebApp." + UUID().uuidString,
                                      manifest: ["start_url": "https://www.twitch.tv/channel"],
                                      path: "Renamed Streaming App")
        let suite = "WebsiteCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let catalogue = RemoteCompanionCatalogueStore(defaults: defaults).value
        let template = try XCTUnwrap(catalogue.applications.first { $0.label == "Athena" })
        XCTAssertFalse(catalogue.applicationsForDisplay(approvedApps: [other, native]).contains { $0.label == "Athena" })
        let twitchTemplate = try XCTUnwrap(catalogue.applications.first { $0.label == "Twitch" })
        XCTAssertFalse(catalogue.applicationsForDisplay(approvedApps: [other, native]).contains { $0.label == "Twitch" })
        let resolved = catalogue.applicationsForDisplay(approvedApps: [athena, other, native, twitch])
        let installedTwitch = try XCTUnwrap(resolved.first { $0.appId == twitch.bundleIdentifier })
        XCTAssertEqual(resolved.filter { $0.label == "Twitch" }.map(\.appId), [twitch.bundleIdentifier])
        XCTAssertEqual(installedTwitch.defaultShortcutIds, twitchTemplate.defaultShortcutIds)
        XCTAssertEqual(installedTwitch.moreShortcuts, twitchTemplate.moreShortcuts)
        XCTAssertEqual(resolved.filter { $0.label == "Athena" }.map(\.appId), [athena.bundleIdentifier])
        XCTAssertEqual(resolved.first { $0.appId == athena.bundleIdentifier }?.shortcuts, template.shortcuts)
        XCTAssertEqual(resolved.first { $0.appId == athena.bundleIdentifier }?.defaultShortcutIds,
                       template.defaultShortcutIds)
        XCTAssertTrue(resolved.contains { $0.appId == "com.apple.Safari.WebApp" })
    }

    @MainActor
    func testGoogleMeetPresetsUseApprovedSafariAndChromeInstallations() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }

        func installedApp(_ id: String, metadata: [String: Any],
                          name: String = "Renamed Meeting App") throws -> LaunchableApp {
            let url = directory.appendingPathComponent(UUID().uuidString + ".app")
            let contents = url.appendingPathComponent("Contents")
            try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
            var plist = metadata
            plist["CFBundleIdentifier"] = id
            plist["CFBundlePackageType"] = "AAPL"
            try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
                .write(to: contents.appendingPathComponent("Info.plist"))
            return LaunchableApp(bundleIdentifier: id, name: name, url: url)
        }

        let safari = try installedApp("com.apple.Safari.WebApp." + UUID().uuidString, metadata: [
            "Manifest": ["start_url": "https://meet.google.com/"],
        ])
        let chromeMetadata = ["CrBundleIdentifier": "com.google.Chrome",
                              "CrAppModeShortcutURL": "https://meet.google.com/landing"]
        let chrome = try installedApp("com.google.Chrome.app.abcdefghijklmnopabcdefghijklmnop",
                                      metadata: chromeMetadata)
        let other = try installedApp("com.apple.Safari.WebApp." + UUID().uuidString, metadata: [
            "Manifest": ["start_url": "https://meet.google.com.example.net/"],
        ], name: "Google Meet")
        let chromeOther = try installedApp("com.google.Chrome.app.ponmlkjihgfedcbaponmlkjihgfedcba", metadata: [
            "CrBundleIdentifier": "com.google.Chrome",
            "CrAppModeShortcutURL": "https://calendar.google.com/",
        ], name: "Google Meet")
        let browser = try installedApp("com.google.Chrome", metadata: chromeMetadata, name: "Google Chrome")

        let suite = "GoogleMeetCatalogueTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let catalogue = RemoteCompanionCatalogueStore(defaults: defaults).value
        let approved = [safari, chrome, other, chromeOther, browser]
        let resolved = catalogue.applicationsForDisplay(approvedApps: approved)
        XCTAssertEqual(resolved.filter { $0.label.hasPrefix("Google Meet") }.map(\.appId),
                       [safari.bundleIdentifier, chrome.bundleIdentifier])
        XCTAssertEqual(catalogue.shortcutApplication(safari.bundleIdentifier, approvedApps: approved)?.label,
                       "Google Meet (Safari)")
        XCTAssertEqual(catalogue.shortcutApplication(chrome.bundleIdentifier, approvedApps: approved)?.label,
                       "Google Meet (Chrome)")
        XCTAssertEqual(catalogue.shortcutApplication(other.bundleIdentifier, approvedApps: approved)?.label,
                       "Safari Web App")
        XCTAssertNil(catalogue.shortcutApplication(chrome.bundleIdentifier, approvedApps: [safari]))
        for app in [safari, chrome] {
            let definition = try XCTUnwrap(catalogue.shortcutApplication(app.bundleIdentifier, approvedApps: approved))
            XCTAssertTrue(definition.shortcuts.contains { $0.shortcut == "command+d" })
            XCTAssertTrue(definition.moreShortcuts?.contains { $0.shortcut == "scoped.c" } ?? false)
            XCTAssertEqual(definition.appId, app.bundleIdentifier)
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
