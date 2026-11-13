import Foundation
import XCTest
@testable import Companion

@MainActor
private final class SessionFixture: CompanionSessionPreferences, CompanionSessionResources, CompanionSessionCredentials {
    var panelHost = ""
    var pairingAccount = "test-account"
    var hasSavedPairing = false
    var values: [String: Any] = [:]
    var credentialReads = 0
    func stringPreference(forKey key: String) -> String? { values[key] as? String }
    func integerPreference(forKey key: String) -> Int { values[key] as? Int ?? 0 }
    func setPreference(_ value: Any, forKey key: String) { values[key] = value }
    func removePreference(forKey key: String) { values.removeValue(forKey: key) }
    func rememberPairingAccount(_ account: String) { pairingAccount = account }
    func folderActions() -> [ApprovedFolder] { [] }
    func launchableApps() -> [LaunchableApp] { [] }
    func appIconPixels(bundleIdentifier: String, pixelSide: Int) -> Data? { nil }
    func focusedCompanionActionIdentifier() -> String { "" }
    func performResultStatus(actionIdentifier: String, folderOpenBehavior: String) async -> String { "not_allowed" }
    func openURL(encodedURL: String, newWindow: Bool) async -> Bool { false }
    func setMediaControlValue(_ value: Int, controlIdentifier: String) -> Bool { false }
    func load(account: String) -> Data? { credentialReads += 1; return nil }
    func save(_ credential: Data, account: String) -> Bool { false }
}

final class CompanionSessionTests: XCTestCase {
    func testOnlyPairingErrorsChangeTheSavedDisplayToPairingRequired() {
        XCTAssertTrue(CompanionConnection.requiresNewPairing(errorCode: "pairing_reset", authenticated: true, authenticating: false))
        XCTAssertTrue(CompanionConnection.requiresNewPairing(errorCode: "pairing_reset", authenticated: false, authenticating: true))
        XCTAssertTrue(CompanionConnection.requiresNewPairing(errorCode: "authentication_failed", authenticated: false, authenticating: true))
        XCTAssertFalse(CompanionConnection.requiresNewPairing(errorCode: "authentication_storage_failed", authenticated: false, authenticating: true))
        XCTAssertFalse(CompanionConnection.requiresNewPairing(errorCode: "authentication_sequence", authenticated: false, authenticating: true))
        XCTAssertFalse(CompanionConnection.requiresNewPairing(errorCode: "authentication_failed", authenticated: false, authenticating: false))
    }

    @MainActor
    func testIndependentSessionsAndInvalidEndpointNeedNoSystemServices() {
        let firstPorts = SessionFixture(), secondPorts = SessionFixture()
        let first = CompanionConnection(preferences: firstPorts, resources: firstPorts, credentials: firstPorts)
        let second = CompanionConnection(preferences: secondPorts, resources: secondPorts, credentials: secondPorts)
        var firstStates: [CompanionConnectionState] = [], secondStates: [CompanionConnectionState] = []
        first.onEvent = { if case let .connection(_, state, _) = $0 { firstStates.append(state) } }
        second.onEvent = { if case let .connection(_, state, _) = $0 { secondStates.append(state) } }
        first.connect(mode: .authenticate)
        XCTAssertEqual(firstStates, [.failed])
        XCTAssertTrue(secondStates.isEmpty)
        first.disconnect()
        second.disconnect()
        XCTAssertEqual(firstStates, [.failed, .disconnected])
        XCTAssertEqual(secondStates, [.disconnected])
        XCTAssertEqual(firstPorts.credentialReads, 0)
        XCTAssertEqual(secondPorts.credentialReads, 0)
    }
}
