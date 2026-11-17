import Foundation
import XCTest
@testable import Companion

@MainActor
private final class StreamlabsFixture: StreamlabsRPC {
    var sceneID = "intro"
    var recording = false
    var toggleCount = 0
    var sceneRequests: [String] = []
    var closed = false

    func call(_ method: String, resource: String, args: [String]) async throws -> Any? {
        guard !closed else { throw StreamlabsRPCError.disconnected }
        switch (resource, method) {
        case ("TcpServerService", "auth"): return args == ["fixture-token"]
        case ("ScenesService", "activeSceneId"): return sceneID
        case ("ScenesService", "getScenes"):
            return [["id": "intro", "name": "Intro"], ["id": "desk", "name": "Desk"]]
        case ("ScenesService", "makeSceneActive"):
            guard let id = args.first else { return false }
            sceneRequests.append(id)
            sceneID = id
            return true
        case ("StreamingService", "getModel"): return ["recordingStatus": recording ? "recording" : "offline"]
        case ("StreamingService", "toggleRecording"):
            toggleCount += 1
            recording.toggle()
            return ["_type": "SUBSCRIPTION", "emitter": "PROMISE"]
        default: throw StreamlabsRPCError.rejected
        }
    }

    func close() { closed = true }
}

final class StreamlabsConnectionTests: XCTestCase {
    @MainActor
    func testRemoteCardsSwitchScenesAndSendRecordingIntentOnce() async throws {
        let fixture = StreamlabsFixture()
        let name = "StreamlabsConnectionTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        let connection = StreamlabsConnection(defaults: defaults, makeClient: { _ in fixture })
        defer {
            connection.stop()
            defaults.removePersistentDomain(forName: name)
        }

        let online = expectation(description: "initial Streamlabs snapshot")
        connection.onSnapshot = { _, state in if state.scenes.count == 2 { online.fulfill() } }
        connection.start(port: 59650, token: "fixture-token")
        await fulfillment(of: [online], timeout: 3)
        connection.onSnapshot = nil

        let desk = try XCTUnwrap(connection.snapshot.scenes.first(where: { $0.name == "Desk" }))
        let switched = await connection.perform(desk.actionID)
        XCTAssertTrue(switched)
        XCTAssertEqual(fixture.sceneRequests, ["desk"])
        let unknown = await connection.perform("streamlabs.scene.not-in-the-catalogue")
        XCTAssertFalse(unknown)
        XCTAssertEqual(fixture.sceneRequests, ["desk"])

        let recorded = await connection.perform(StreamlabsSnapshot.startRecordingAction)
        XCTAssertTrue(recorded)
        XCTAssertEqual(connection.snapshot.activeSceneActionID, desk.actionID)
        XCTAssertEqual(connection.snapshot.recording, true)
        let alreadyRecording = await connection.perform(StreamlabsSnapshot.startRecordingAction)
        XCTAssertTrue(alreadyRecording)
        XCTAssertEqual(fixture.toggleCount, 1)

        let offline = expectation(description: "disconnected controls cleared")
        connection.onSnapshot = { _, state in if state.actions.isEmpty { offline.fulfill() } }
        fixture.close()
        await fulfillment(of: [offline], timeout: 3)
        connection.onSnapshot = nil
    }
}
