import XCTest
@testable import Companion

@MainActor
private final class OBSPilotTransport: OBSWebSocketTransport {
    var onReady: (() -> Void)?
    var onEvent: ((String, OBSWebSocket.Fields) -> Void)?
    var onClose: ((OBSWebSocket.Failure) -> Void)?
    var isReady = true
    var requests: [String] = []
    var preview = queued
    static let program = "bd73192e-4d59-4ff4-afab-c88777454f98"
    static let queued = "0b3d47f0-c796-44c1-9e63-1a8cb0519101"

    func connect(port: UInt16, password: String?) {}
    func close(_ failure: OBSWebSocket.Failure?) { isReady = false }

    func request(_ type: String, fields: OBSWebSocket.Fields) async throws -> OBSWebSocket.Fields {
        requests.append(type)
        switch type {
        case "GetSceneCollectionList": return ["currentSceneCollectionName": "Show"]
        case "GetSceneList":
            return [
                "currentProgramSceneUuid": Self.program,
                "currentPreviewSceneUuid": preview,
                "scenes": [scene(Self.program), scene(Self.queued)],
            ]
        case "GetInputList": return ["inputs": []]
        case "GetStudioModeEnabled": return ["studioModeEnabled": true]
        case "GetStreamStatus": return ["outputActive": true, "outputReconnecting": true]
        case "GetRecordStatus": return ["outputActive": true, "outputPaused": true]
        case "GetCurrentSceneTransitionCursor": return ["transitionCursor": 1.0]
        case "GetCurrentPreviewScene": return scene(preview)
        case "TriggerStudioModeTransition":
            onEvent?("SceneTransitionStarted", [:])
            return [:]
        default: throw OBSWebSocket.Failure.requestRejected(204)
        }
    }

    func scene(_ id: String) -> OBSWebSocket.Fields {
        ["sceneUuid": id, "sceneName": id == Self.program ? "Gameplay" : "BRB"]
    }
}

final class OBSProductionTests: XCTestCase {
    @MainActor
    private func open(_ transport: OBSPilotTransport) async throws -> OBSConnection {
        let connection = OBSConnection(socket: transport)
        transport.onReady?()
        for _ in 0..<100 {
            if connection.state != nil { return connection }
            try await Task.sleep(for: .milliseconds(1))
        }
        _ = try XCTUnwrap(connection.state)
        return connection
    }

    @MainActor
    func testStatusReportsReconnectionAndPausedRecording() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        XCTAssertEqual(OBSConnection.productionActions(connection.state).map(\.label), [
            "Program · Gameplay", "Stream · Reconnecting", "Recording · Paused", "Take Live · BRB",
        ])
        transport.onEvent?("CurrentSceneCollectionChanging", [:])
        XCTAssertTrue(OBSConnection.productionActions(connection.state).isEmpty)
    }

    @MainActor
    func testTakeRejectsStaleTokensAndRechecksPreviewBeforeCommand() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        let token = try XCTUnwrap(connection.state).takeToken

        let invalidTokenResult = await connection.takeLive(token: UUID())
        XCTAssertFalse(invalidTokenResult)
        transport.preview = OBSPilotTransport.program
        let changedPreviewResult = await connection.takeLive(token: token)
        XCTAssertFalse(changedPreviewResult)
        XCTAssertFalse(transport.requests.contains("TriggerStudioModeTransition"))

        transport.preview = OBSPilotTransport.queued
        let currentPreviewResult = await connection.takeLive(token: token)
        XCTAssertTrue(currentPreviewResult)
        let duplicateResult = await connection.takeLive(token: token)
        XCTAssertFalse(duplicateResult)
        XCTAssertEqual(transport.requests.filter { $0 == "TriggerStudioModeTransition" }.count, 1)
    }
}
