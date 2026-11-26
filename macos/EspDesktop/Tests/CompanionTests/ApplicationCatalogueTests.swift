import XCTest
@testable import Companion

final class ApplicationCatalogueTests: XCTestCase {
    func testDiscoversExternalApplicationThroughFinderAlias() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let applications = root.appendingPathComponent("Applications")
        try FileManager.default.createDirectory(at: applications, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let externalApp = root.appendingPathComponent("External/Example.app")
        let id = "io.espdesktop.tests.external-app"
        try makeApplication(at: externalApp, identifier: id)
        let alias = applications.appendingPathComponent("Example on external drive")
        try makeAlias(at: alias, to: externalApp)

        let catalogue = ApplicationCatalogue()
        let discovered = await catalogue.scan(roots: [applications])
        let app = try XCTUnwrap(discovered.first { $0.bundleIdentifier == id })
        XCTAssertEqual(app.url.resolvingSymlinksInPath().path, externalApp.resolvingSymlinksInPath().path)
        XCTAssertEqual(app.name, "Example")

        try FileManager.default.moveItem(at: alias, to: applications.appendingPathComponent("Renamed alias.app"))
        let afterRename = await catalogue.scan(roots: [applications])
        XCTAssertTrue(afterRename.contains { $0.bundleIdentifier == id })

        try FileManager.default.removeItem(at: externalApp)
        let afterRemoval = await catalogue.scan(roots: [applications])
        XCTAssertFalse(afterRemoval.contains { $0.bundleIdentifier == id })
    }

    func testPrefersInstalledBundleAndIgnoresAliasToRegularFolder() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let applications = root.appendingPathComponent("Applications")
        try FileManager.default.createDirectory(at: applications, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let externalApp = root.appendingPathComponent("External/Example.app")
        let installedApp = applications.appendingPathComponent("Example.app")
        let id = "io.espdesktop.tests.duplicate-app"
        try makeApplication(at: externalApp, identifier: id)
        try makeApplication(at: installedApp, identifier: id)
        try makeAlias(at: applications.appendingPathComponent("Duplicate.app"), to: externalApp)
        let externalFolder = root.appendingPathComponent("Other folder")
        try makeApplication(at: externalFolder.appendingPathComponent("Other.app"), identifier: "io.espdesktop.tests.nested-app")
        try makeAlias(at: applications.appendingPathComponent("External folder"), to: externalFolder)

        let catalogue = ApplicationCatalogue()
        let discovered = await catalogue.scan(roots: [applications])
            .filter { $0.bundleIdentifier.hasPrefix("io.espdesktop.tests.") }
        XCTAssertEqual(
            discovered.map { $0.url.resolvingSymlinksInPath().path },
            [installedApp.resolvingSymlinksInPath().path]
        )
    }

    func testDiscoversAppsInHomeApplicationsAndNestedOnExternalVolume() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let homeApplications = root.appendingPathComponent("Home/Applications")
        let externalVolume = root.appendingPathComponent("External Drive")
        let homeApp = homeApplications.appendingPathComponent("Home.app")
        let externalApp = externalVolume.appendingPathComponent("Tools/Editors/External.app")
        let homeID = "io.espdesktop.tests.home-app"
        let externalID = "io.espdesktop.tests.external-volume-app"
        defer { try? FileManager.default.removeItem(at: root) }

        try makeApplication(at: homeApp, identifier: homeID)
        try makeApplication(at: externalApp, identifier: externalID)
        try makeApplication(at: externalVolume.appendingPathComponent("Copy of Home.app"), identifier: homeID)
        let helperID = "io.espdesktop.tests.bundled-helper"
        try makeApplication(at: externalApp.appendingPathComponent("Contents/Helpers/Helper.app"), identifier: helperID)

        let catalogue = ApplicationCatalogue()
        let discovered = await catalogue.scan(roots: [homeApplications], externalVolumes: [externalVolume])
        let homeMatch = try XCTUnwrap(discovered.first { $0.bundleIdentifier == homeID })
        let externalMatch = try XCTUnwrap(discovered.first { $0.bundleIdentifier == externalID })
        XCTAssertEqual(homeMatch.url.resolvingSymlinksInPath().path, homeApp.resolvingSymlinksInPath().path)
        XCTAssertEqual(externalMatch.url.resolvingSymlinksInPath().path, externalApp.resolvingSymlinksInPath().path)
        XCTAssertFalse(discovered.contains { $0.bundleIdentifier == helperID })

        let afterEject = await catalogue.scan(roots: [homeApplications])
        XCTAssertTrue(afterEject.contains { $0.bundleIdentifier == homeID })
        XCTAssertFalse(afterEject.contains { $0.bundleIdentifier == externalID })
    }

    private func makeApplication(at url: URL, identifier: String) throws {
        let contents = url.appendingPathComponent("Contents")
        try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
        let info = [
            "CFBundleIdentifier": identifier,
            "CFBundleName": "Example",
            "CFBundlePackageType": "APPL",
        ]
        let data = try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0)
        try data.write(to: contents.appendingPathComponent("Info.plist"))
    }

    private func makeAlias(at alias: URL, to target: URL) throws {
        let bookmark = try target.bookmarkData(options: [.suitableForBookmarkFile])
        try URL.writeBookmarkData(bookmark, to: alias)
    }
}
