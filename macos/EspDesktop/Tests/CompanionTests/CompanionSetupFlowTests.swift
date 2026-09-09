import XCTest
@testable import Companion

final class CompanionSetupFlowTests: XCTestCase {
    func testNewSetupRequiresPairingBeforePreferences() {
        XCTAssertEqual(route(saved: false), .pairing)
        XCTAssertEqual(route(saved: false, pairing: true), .pairing)
        XCTAssertEqual(route(saved: true, pairing: true), .pairing, "Stay on pairing until the connection succeeds")
        XCTAssertEqual(route(saved: true), .preferences)
    }

    func testSuccessfulPairingGoesStraightToFinalAccessScreen() {
        XCTAssertEqual(CompanionSetupRoute.resolve(
            completed: false, showingHelp: false, hasSavedPairing: true,
            pairingInProgress: true, pairingConnected: true
        ), .preferences)
        XCTAssertEqual(CompanionSetupRoute.resolve(
            completed: true, showingHelp: false, hasSavedPairing: true,
            pairingInProgress: true, pairingConnected: true
        ), .settings, "Re-pairing must not restart first-run setup")
    }

    func testExistingPairingResumesPreferencesAndCompletedUsersKeepSettings() {
        XCTAssertEqual(route(saved: true), .preferences)
        XCTAssertEqual(route(saved: true, completed: true), .settings)
        XCTAssertEqual(route(saved: false, completed: true), .settings, "Normal Settings still handles re-pairing")
        XCTAssertEqual(route(saved: false, help: true), .settings)
    }

    private func route(saved: Bool, pairing: Bool = false, completed: Bool = false, help: Bool = false) -> CompanionSetupRoute {
        CompanionSetupRoute.resolve(completed: completed, showingHelp: help, hasSavedPairing: saved, pairingInProgress: pairing)
    }
}
