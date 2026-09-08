import Foundation
import XCTest
@testable import Companion

@MainActor
final class PreferenceMigrationTests: XCTestCase {
    func testPreviousPreferencesMoveIntoEmptyEspDesktopSuite() throws {
        let sourceName = "PreferenceMigrationTests.source.\(UUID().uuidString)"
        let destinationName = "PreferenceMigrationTests.destination.\(UUID().uuidString)"
        let source = try XCTUnwrap(UserDefaults(suiteName: sourceName))
        let destination = try XCTUnwrap(UserDefaults(suiteName: destinationName))
        defer {
            source.removePersistentDomain(forName: sourceName)
            destination.removePersistentDomain(forName: destinationName)
        }

        source.set("panel.local", forKey: "panelHost")
        source.set("panel.local", forKey: "pairingAccount")
        source.set(["com.apple.Safari"], forKey: "approvedApplications")
        source.set(Data("folders".utf8), forKey: "approvedFolders")
        source.set(true, forKey: "shareSystemMetrics")
        source.set(true, forKey: "companion.onboarding.completed")
        source.set("applications", forKey: "settings.selectedPage")

        CompanionStore.migrateStoredPreferences(from: [source], to: destination)

        XCTAssertEqual(destination.string(forKey: "panelHost"), "panel.local")
        XCTAssertEqual(destination.string(forKey: "pairingAccount"), "panel.local")
        XCTAssertEqual(destination.stringArray(forKey: "approvedApplications"), ["com.apple.Safari"])
        XCTAssertEqual(destination.data(forKey: "approvedFolders"), Data("folders".utf8))
        XCTAssertTrue(destination.bool(forKey: "shareSystemMetrics"))
        XCTAssertTrue(destination.bool(forKey: "companion.onboarding.completed"))
        XCTAssertEqual(destination.string(forKey: "settings.selectedPage"), "applications")
    }

    func testExistingEspDesktopPreferenceWinsOverPreviousValue() throws {
        let sourceName = "PreferenceMigrationTests.source.\(UUID().uuidString)"
        let destinationName = "PreferenceMigrationTests.destination.\(UUID().uuidString)"
        let source = try XCTUnwrap(UserDefaults(suiteName: sourceName))
        let destination = try XCTUnwrap(UserDefaults(suiteName: destinationName))
        defer {
            source.removePersistentDomain(forName: sourceName)
            destination.removePersistentDomain(forName: destinationName)
        }

        source.set("old-panel.local", forKey: "panelHost")
        destination.set("new-panel.local", forKey: "panelHost")

        CompanionStore.migrateStoredPreferences(from: [source], to: destination)

        XCTAssertEqual(destination.string(forKey: "panelHost"), "new-panel.local")
    }
}
