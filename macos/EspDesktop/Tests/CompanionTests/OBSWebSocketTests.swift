import XCTest
@testable import Companion

final class OBSWebSocketTests: XCTestCase {
    @MainActor
    func testPasswordChallengeUsesOBSWebSocketV5Authentication() async {
        XCTAssertEqual(
            OBSWebSocket.authentication(password: "test-password", salt: "test-salt", challenge: "test-challenge"),
            "zBIloly70ANx+T9nUkQVuTCqTUuHtfrqEdn8XDQ3m/s="
        )
    }

    @MainActor
    func testCloseCodesDistinguishCredentialsUnsupportedVersionAndManualRevocation() async {
        XCTAssertEqual(OBSWebSocket.failure(forCloseCode: 4009), .authenticationRejected)
        XCTAssertEqual(OBSWebSocket.failure(forCloseCode: 4010), .unsupportedProtocol)
        XCTAssertEqual(OBSWebSocket.failure(forCloseCode: 4011), .sessionRevoked)
        XCTAssertNil(OBSWebSocket.failure(forCloseCode: 1000))
    }

    @MainActor
    func testOfflineRequestIsRejectedWithoutBeingQueued() async {
        let socket = OBSWebSocket()
        do {
            _ = try await socket.request("SetInputMute", fields: ["inputUuid": "mic", "inputMuted": true])
            XCTFail("Expected an offline request to fail")
        } catch {
            XCTAssertEqual(error as? OBSWebSocket.Failure, .disconnected)
        }
    }

    @MainActor
    func testOBSTargetRequiresStableIdentity() async {
        XCTAssertNil(OBSConnection.Target(fields: ["inputName": "Mic"], kind: "input"))
        let target = OBSConnection.Target(fields: ["inputName": "Mic", "inputUuid": "stable-id"], kind: "input")
        XCTAssertEqual(target?.id, "stable-id")
        XCTAssertEqual(target?.name, "Mic")
    }
}
