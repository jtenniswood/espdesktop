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

    @MainActor
    func testSceneCatalogueSeparatesProgramFromStudioPreview() async throws {
        let uuid = UUID(uuidString: "a51e30ff-0c88-418f-ac5a-fd2e33963c2b")!
        let scene = try XCTUnwrap(OBSConnection.Target(fields: [
            "sceneName": "Gameplay", "sceneUuid": uuid.uuidString,
        ], kind: "scene"))
        let breakID = UUID(uuidString: "191ede4a-93f9-4517-a306-089f1c0281bb")!
        let breakScene = try XCTUnwrap(OBSConnection.Target(fields: [
            "sceneName": "Break", "sceneUuid": breakID.uuidString,
        ], kind: "scene"))
        func selected(_ state: OBSConnection.State) -> [String] {
            OBSConnection.controlActions(state).map(\.id).filter { $0.hasPrefix("obs.selected.") }
        }
        var state = OBSConnection.State(collection: "Show", scenes: [scene, breakScene], inputs: [],
                                        program: scene, preview: nil, studioMode: false,
                                        streaming: true, streamReconnecting: false, recording: true)
        let program = try XCTUnwrap(OBSConnection.sceneActions(state).first)
        XCTAssertEqual(OBSConnection.SceneAction(id: program.id), .program(uuid))
        XCTAssertEqual(program.label, "On air · Gameplay")
        XCTAssertEqual(selected(state), ["obs.selected." + uuid.uuidString.lowercased()])

        state.studioMode = true
        XCTAssertTrue(selected(state).isEmpty)
        state.preview = breakScene
        let preview = try XCTUnwrap(OBSConnection.sceneActions(state).last)
        XCTAssertEqual(OBSConnection.SceneAction(id: preview.id), .preview(breakID))
        XCTAssertEqual(preview.label, "Preview · Break")
        XCTAssertEqual(selected(state), ["obs.selected." + breakID.uuidString.lowercased()])
        XCTAssertNotEqual(program.id, preview.id)
        XCTAssertTrue(OBSConnection.sceneActions(nil).isEmpty)
        XCTAssertNil(OBSConnection.SceneAction(id: "obs.scene.Gameplay"))
    }

    @MainActor
    func testMuteCatalogueShowsConfirmedStatesForAudioInputsOnly() async throws {
        let mic = try XCTUnwrap(OBSConnection.Target(fields: [
            "inputName": "Desk Mic", "inputUuid": "69da3f8f-7f62-4abe-a594-4e40dd579858",
        ], kind: "input"))
        let video = try XCTUnwrap(OBSConnection.Target(fields: [
            "inputName": "Camera", "inputUuid": "9e7fb755-e834-445b-a33e-e96e02acaba0",
        ], kind: "input"))
        var state = OBSConnection.State(collection: "Show", scenes: [], inputs: [mic, video],
                                        program: nil, preview: nil, studioMode: true,
                                        streaming: false, streamReconnecting: false, recording: false,
                                        inputMutes: [mic.id: true])
        XCTAssertEqual(OBSConnection.audioActions(state).map(\.id), ["obs.mute." + mic.id])
        XCTAssertEqual(OBSConnection.audioActions(state).map(\.label), ["Muted · Desk Mic"])
        state.inputMutes[mic.id] = false
        XCTAssertEqual(OBSConnection.audioActions(state).map(\.label), ["Unmuted · Desk Mic"])
        XCTAssertTrue(OBSConnection.audioActions(nil).isEmpty)
    }
}
