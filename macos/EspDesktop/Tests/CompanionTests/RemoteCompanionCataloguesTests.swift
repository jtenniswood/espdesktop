import Foundation
import XCTest
@testable import Companion

final class RemoteCompanionCataloguesTests: XCTestCase {
    private let docs = RemoteWebApplicationDefinition(
        version: 1,
        id: "google-docs",
        label: "Google Docs",
        url: "https://docs.google.com/document/u/0/",
        matchHost: "docs.google.com",
        matchPath: "/document/",
        icon: "https://raw.githubusercontent.com/jtenniswood/espdesktop/main/product/v2/web_apps/icons/google-docs.png",
        shortcuts: [RemoteShortcutDefinition(id: "0", label: "Bold", shortcut: "command+b", icon: "Web")]
    )

    func testWebAppMatchingUsesHostAndPathAndIgnoresQueryAndFragment() throws {
        let match = try XCTUnwrap(URL(string: "https://docs.google.com/document/d/abc/edit?tab=t.0#heading"))
        XCTAssertEqual(ActiveTabURLMatcher.matchingWebAppIDs(url: match, definitions: [docs]), ["google-docs"])
        XCTAssertTrue(ActiveTabURLMatcher.matchingWebAppIDs(
            url: URL(string: "https://docs.google.com/spreadsheets/d/abc"), definitions: [docs]
        ).isEmpty)
        XCTAssertTrue(ActiveTabURLMatcher.matchingWebAppIDs(
            url: URL(string: "https://docs.google.com.evil.test/document/d/abc"), definitions: [docs]
        ).isEmpty)
        XCTAssertTrue(ActiveTabURLMatcher.matchingWebAppIDs(url: nil, definitions: [docs]).isEmpty)
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

    func testRemoteCatalogueRequiresSupportedVersionAndValidHostMatch() throws {
        let nativeManifest = Data(#"{"formatVersion":1,"catalogueVersion":2,"minimumCompanionVersion":"1.0.0","entries":[{"path":"example.json"}]}"#.utf8)
        let webManifest = Data(#"{"formatVersion":1,"catalogueVersion":4,"minimumCompanionVersion":"1.0.0","entries":[{"path":"google-docs.json"}]}"#.utf8)
        let native = Data(#"{"version":1,"appId":"org.example.Editor","label":"Editor","catalog":false,"shortcuts":[{"id":"0","label":"New","shortcut":"command+n","icon":"Plus"}]}"#.utf8)
        let web = try JSONEncoder().encode(docs)
        let catalogues = try RemoteCompanionCatalogues.decode(
            nativeManifest: nativeManifest,
            nativeDefinitions: [native],
            webManifest: webManifest,
            webDefinitions: [web],
            companionVersion: "1.2.0"
        )
        XCTAssertEqual(catalogues.version, 4)
        XCTAssertEqual(catalogues.webApplications.map(\.id), ["google-docs"])
        XCTAssertThrowsError(try RemoteCompanionCatalogues.decode(
            nativeManifest: nativeManifest,
            nativeDefinitions: [native],
            webManifest: webManifest,
            webDefinitions: [web],
            companionVersion: "0.9.0"
        ))

        let invalidWeb = RemoteWebApplicationDefinition(
            version: docs.version, id: docs.id, label: docs.label, url: docs.url,
            matchHost: "not-google.example", matchPath: docs.matchPath, icon: docs.icon,
            shortcuts: docs.shortcuts
        )
        XCTAssertThrowsError(try RemoteCompanionCatalogues.decode(
            nativeManifest: nativeManifest,
            nativeDefinitions: [native],
            webManifest: webManifest,
            webDefinitions: [JSONEncoder().encode(invalidWeb)],
            companionVersion: "1.2.0"
        ))
    }
}
