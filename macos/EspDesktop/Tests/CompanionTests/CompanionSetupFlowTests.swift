import XCTest
@testable import Companion

final class CompanionSetupFlowTests: XCTestCase {
    func testNewSetupRequiresPairingBeforePreferences() {
        XCTAssertEqual(route(saved: false), .pairing)
        XCTAssertEqual(route(saved: false, pairing: true), .pairing)
        XCTAssertEqual(route(saved: true, pairing: true), .pairing, "Stay on pairing until the connection succeeds")
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

    func testExistingPairingSkipsSetupEvenWithoutCompletionFlag() {
        XCTAssertEqual(route(saved: true), .settings)
        XCTAssertEqual(route(saved: true, completed: true), .settings)
        XCTAssertEqual(route(saved: false, completed: true), .settings, "Normal Settings still handles re-pairing")
        XCTAssertEqual(route(saved: false, help: true), .settings)
    }

    func testUpgradeRetainsPairingWithoutEnumeratingKeychain() {
        let pairing = CompanionPairingSelection.restore(host: "office.local", account: "192.168.6.100") {
            XCTFail("A known pairing must be retained even if Keychain is unavailable at launch")
            return []
        }
        XCTAssertEqual(pairing.host, "office.local")
        XCTAssertEqual(pairing.account, "192.168.6.100")
        XCTAssertEqual(route(saved: !pairing.account.isEmpty), .settings)
    }

    func testLegacyPairingRecoversAccountWhenOnlyAddressWasSaved() {
        let pairing = CompanionPairingSelection.restore(host: "office.local", account: nil) {
            ["192.168.6.100"]
        }
        XCTAssertEqual(pairing.host, "office.local")
        XCTAssertEqual(pairing.account, "192.168.6.100")
        XCTAssertEqual(route(saved: !pairing.account.isEmpty), .settings)
    }

    func testForgottenDisplayIsNotRestoredFromAStaleKeychainItem() {
        let pairing = CompanionPairingSelection.restore(host: "", account: nil) {
            XCTFail("An explicitly cleared display must not be recovered from Keychain")
            return ["office.local"]
        }
        XCTAssertEqual(pairing.host, "")
        XCTAssertEqual(pairing.account, "")
        XCTAssertEqual(route(saved: !pairing.account.isEmpty), .pairing)
    }

    private func route(saved: Bool, pairing: Bool = false, completed: Bool = false, help: Bool = false) -> CompanionSetupRoute {
        CompanionSetupRoute.resolve(completed: completed, showingHelp: help, hasSavedPairing: saved, pairingInProgress: pairing)
    }
}
