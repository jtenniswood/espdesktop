import XCTest
@testable import Companion

@MainActor
private final class OBSPilotTransport: OBSWebSocketTransport {
    var onReady: (() -> Void)?
    var onEvent: ((String, OBSWebSocket.Fields) -> Void)?
    var onClose: ((OBSWebSocket.Failure) -> Void)?
    var isReady = true
    var requests: [String] = []
    var projectorRequests: [OBSWebSocket.Fields] = []
    var preview = queued
    var programID = program
    var rejectProgramChange = false
    var rejectMuteCommand = false
    var breakRequests: [String] = []
    var afterMute: (() -> Void)?
    var transitionCursor = 1.0
    var sourceItems: [String: [OBSWebSocket.Fields]] = [:]
    var sourceWrites: [String] = []
    var transitionName = "Fade"
    var configuredTransitions = ["Fade", "Cut", "Slide"]
    var replayActive = false
    var studioMode = true
    var streaming = true
    var streamReconnecting = true
    var recording = true
    var recordingPaused = true
    var virtualCameraActive: Bool?
    var recordStatusRead: (() -> Void)?
    var outputWrites: [String] = []
    var hasAudioInput = false
    var lastFaderWrite: OBSWebSocket.Fields?
    var muted = true
    var emitMuteEvents = true
    var muteWrites: [Bool] = []
    var faderDb = -20.0
    var faderMultiplier = 0.1
    static let mic = "69da3f8f-7f62-4abe-a594-4e40dd579858"
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
                "currentProgramSceneUuid": programID,
                "currentPreviewSceneUuid": preview,
                "scenes": [scene(Self.program), scene(Self.queued)],
            ]
        case "GetCurrentProgramScene": return scene(programID)
        case "SetCurrentProgramScene":
            let target = fields["sceneUuid"] as? String ?? ""
            breakRequests.append("scene:" + target)
            if rejectProgramChange { throw OBSWebSocket.Failure.requestRejected(500) }
            updateProgram(target)
            return [:]
        case "GetSceneItemList":
            let id = fields["sceneUuid"] as? String ?? ""
            return ["sceneItems": sourceItems[id] ?? []]
        case "SetSceneItemEnabled":
            guard let scene = fields["sceneUuid"] as? String,
                  let id = fields["sceneItemId"] as? Int,
                  let enabled = fields["sceneItemEnabled"] as? Bool,
                  let index = sourceItems[scene]?.firstIndex(where: { $0["sceneItemId"] as? Int == id })
            else { throw OBSWebSocket.Failure.requestRejected(204) }
            sourceWrites.append("\(scene):\(id):\(enabled)")
            sourceItems[scene]?[index]["sceneItemEnabled"] = enabled
            onEvent?("SceneItemEnableStateChanged", ["sceneUuid": scene])
            return [:]
        case "GetInputList":
            let inputs = hasAudioInput ? [["inputUuid": Self.mic, "inputName": "Desk Mic"]] : []
            return ["inputs": inputs]
        case "GetInputMute": return ["inputMuted": muted]
        case "SetInputMute":
            guard fields["inputUuid"] as? String == Self.mic,
                  let muted = fields["inputMuted"] as? Bool else { throw OBSWebSocket.Failure.requestRejected(204) }
            breakRequests.append(muted ? "mute" : "unmute")
            if rejectMuteCommand { throw OBSWebSocket.Failure.requestRejected(500) }
            muteWrites.append(muted)
            updateMute(muted, emit: emitMuteEvents)
            if muted { afterMute?() }
            return [:]
        case "GetInputVolume": return ["inputVolumeDb": faderDb, "inputVolumeMul": faderMultiplier]
        case "SetInputVolume":
            lastFaderWrite = fields
            faderDb = fields["inputVolumeDb"] as? Double ?? -100
            faderMultiplier = fields["inputVolumeMul"] as? Double ?? pow(10, faderDb / 20)
            return [:]
        case "GetStudioModeEnabled": return ["studioModeEnabled": studioMode]
        case "GetCurrentSceneTransition": return ["transitionName": transitionName]
        case "GetSceneTransitionList":
            return ["currentSceneTransitionName": transitionName,
                    "transitions": configuredTransitions.map { ["transitionName": $0] }]
        case "SetCurrentSceneTransition":
            transitionName = fields["transitionName"] as? String ?? ""
            onEvent?("CurrentSceneTransitionChanged", ["transitionName": transitionName])
            return [:]
        case "SetStudioModeEnabled":
            studioMode = fields["studioModeEnabled"] as? Bool ?? false
            onEvent?("StudioModeStateChanged", ["studioModeEnabled": studioMode])
            return [:]
        case "SetCurrentPreviewScene":
            preview = fields["sceneUuid"] as? String ?? ""
            onEvent?("CurrentPreviewSceneChanged", scene(preview))
            return [:]
        case "GetStreamStatus":
            return ["outputActive": streaming, "outputReconnecting": streamReconnecting]
        case "GetRecordStatus":
            recordStatusRead?()
            return ["outputActive": recording, "outputPaused": recordingPaused]
        case "GetVirtualCamStatus":
            guard let virtualCameraActive else { throw OBSWebSocket.Failure.requestRejected(204) }
            return ["outputActive": virtualCameraActive]
        case "StartVirtualCam", "StopVirtualCam":
            outputWrites.append(type)
            virtualCameraActive = type == "StartVirtualCam"
            return [:]
        case "StartRecord", "StopRecord":
            outputWrites.append(type)
            recording = type == "StartRecord"
            recordingPaused = false
            onEvent?("RecordStateChanged", [
                "outputActive": recording, "outputState": recording ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED",
            ])
            return [:]
        case "StartStream", "StopStream":
            outputWrites.append(type)
            streaming = type == "StartStream"
            onEvent?("StreamStateChanged", [
                "outputActive": streaming, "outputState": streaming ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED",
            ])
            return [:]
        case "GetReplayBufferStatus": return ["outputActive": replayActive]
        case "StartReplayBuffer", "StopReplayBuffer":
            replayActive = type == "StartReplayBuffer"
            return [:]
        case "SaveReplayBuffer": return [:]
        case "OpenVideoMixProjector":
            projectorRequests.append(fields)
            return [:]
        case "GetCurrentSceneTransitionCursor": return ["transitionCursor": transitionCursor]
        case "GetCurrentPreviewScene": return scene(preview)
        case "TriggerStudioModeTransition":
            onEvent?("SceneTransitionStarted", [:])
            return [:]
        default: throw OBSWebSocket.Failure.requestRejected(204)
        }
    }

    func updateProgram(_ id: String) {
        programID = id
        onEvent?("CurrentProgramSceneChanged", scene(id))
    }

    func updateMute(_ muted: Bool, emit: Bool = true) {
        self.muted = muted
        if emit { onEvent?("InputMuteStateChanged", ["inputUuid": Self.mic, "inputMuted": muted]) }
    }

    func scene(_ id: String) -> OBSWebSocket.Fields {
        ["sceneUuid": id, "sceneName": id == Self.program ? "Gameplay" : "BRB"]
    }
}

final class OBSProductionTests: XCTestCase {
    @MainActor
    private func open(_ transport: OBSPilotTransport,
                      transitionProbeInterval: Duration = .seconds(1),
                      coughTouchTimeout: Duration = .seconds(1),
                      defaults: UserDefaults = .standard,
                      raiseMultiview: @escaping () async -> OBSMultiviewWindow.Result = { .missing }) async throws -> OBSConnection {
        let connection = OBSConnection(defaults: defaults, socket: transport, transitionProbeInterval: transitionProbeInterval,
                                       coughTouchTimeout: coughTouchTimeout, raiseMultiview: raiseMultiview)
        transport.onReady?()
        for _ in 0..<100 {
            if connection.state != nil { return connection }
            try await Task.sleep(for: .milliseconds(1))
        }
        _ = try XCTUnwrap(connection.state)
        return connection
    }

    @MainActor
    func testMultiviewOpensFullScreenWithStudioModeOff() async throws {
        let transport = OBSPilotTransport()
        transport.studioMode = false
        let connection = try await open(transport)
        XCTAssertTrue(OBSConnection.controlCatalogue(connection.state).contains { $0.id == OBSConnection.multiviewID })
        let opened = await connection.openMultiview()
        XCTAssertTrue(opened)
        let fields = try XCTUnwrap(transport.projectorRequests.first)
        XCTAssertEqual(fields["videoMixType"] as? String, "OBS_WEBSOCKET_VIDEO_MIX_TYPE_MULTIVIEW")
        XCTAssertEqual(fields["monitorIndex"] as? Int, 0)
        transport.onEvent?("CurrentSceneCollectionChanging", [:])
        let unavailable = await connection.openMultiview()
        XCTAssertFalse(unavailable)
        XCTAssertEqual(transport.projectorRequests.count, 1)
    }

    @MainActor
    func testMultiviewReusesTheExistingProjectorAndReopensAfterClose() async throws {
        let transport = OBSPilotTransport()
        var window = OBSMultiviewWindow.Result.missing
        let connection = try await open(transport, raiseMultiview: { window })
        let opened = await connection.openMultiview()
        XCTAssertTrue(opened)
        XCTAssertEqual(transport.projectorRequests.count, 1)

        window = .raised
        let reused = await connection.openMultiview()
        XCTAssertTrue(reused)
        XCTAssertEqual(transport.projectorRequests.count, 1)

        window = .unavailable
        let unavailable = await connection.openMultiview()
        XCTAssertFalse(unavailable)
        XCTAssertEqual(transport.projectorRequests.count, 1)

        window = .missing
        let reopened = await connection.openMultiview()
        XCTAssertTrue(reopened)
        XCTAssertEqual(transport.projectorRequests.count, 2)
    }

    @MainActor
    func testVirtualCameraTracksOBSAndRejectsAStaleStart() async throws {
        let transport = OBSPilotTransport()
        transport.virtualCameraActive = false
        let connection = try await open(transport)
        let start = try XCTUnwrap(connection.state?.outputTokens[.virtualcam])
        XCTAssertTrue(OBSConnection.outputActions(connection.state).contains { $0.label == "Start Virtual Camera" })

        transport.virtualCameraActive = true
        let stale = await connection.performOutput(.virtualcam, token: start)
        XCTAssertFalse(stale)
        XCTAssertTrue(transport.outputWrites.isEmpty)
        XCTAssertEqual(connection.state?.outputPresentation(.virtualcam), .outputActive)

        let stop = try XCTUnwrap(connection.state?.outputTokens[.virtualcam])
        let stopped = await connection.performOutput(.virtualcam, token: stop)
        XCTAssertTrue(stopped)
        let restart = try XCTUnwrap(connection.state?.outputTokens[.virtualcam])
        let restarted = await connection.performOutput(.virtualcam, token: restart)
        XCTAssertTrue(restarted)
        XCTAssertEqual(transport.outputWrites, ["StopVirtualCam", "StartVirtualCam"])

        transport.onEvent?("VirtualcamStateChanged", ["outputActive": false, "outputState": "OBS_WEBSOCKET_OUTPUT_STOPPED"])
        let status = OBSConnection.controlCatalogue(connection.state).first { $0.id == "obs.status.virtualcam" }
        XCTAssertEqual(status?.state, .outputIdle)
    }

    @MainActor
    func testStatusReportsReconnectionAndPausedRecording() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        XCTAssertEqual(OBSConnection.productionActions(connection.state).map(\.label), [
            "Program · Gameplay", "Stream · Reconnecting", "Recording · Paused", "On", "Take Live · BRB", "Off",
        ])
        XCTAssertTrue(OBSConnection.controlActions(connection.state).contains { $0.id == "obs.record.active" })
        transport.onEvent?("CurrentSceneCollectionChanging", [:])
        XCTAssertTrue(OBSConnection.productionActions(connection.state).isEmpty)
    }

    @MainActor
    func testStudioModeButtonTracksOBSAndRejectsStaleTaps() async throws {
        let transport = OBSPilotTransport()
        transport.studioMode = false
        let connection = try await open(transport)
        func publishedMode() throws -> (UUID, String) {
            let action = try XCTUnwrap(OBSConnection.controlActions(connection.state)
                .first { OBSConnection.controlToken($0.id, for: OBSConnection.studioModeID) != nil })
            return (try XCTUnwrap(OBSConnection.controlToken(action.id, for: OBSConnection.studioModeID)), action.label)
        }
        let (disabledToken, off) = try publishedMode()
        XCTAssertEqual(off, "Off")
        let accepted = await connection.toggleStudioMode(token: disabledToken) { true }
        XCTAssertTrue(accepted)
        for _ in 0..<40 where connection.state?.studioMode != true {
            try await Task.sleep(for: .milliseconds(5))
        }
        let (enabledToken, on) = try publishedMode()
        XCTAssertEqual(on, "On")
        XCTAssertNotEqual(enabledToken, disabledToken)
        let stale = await connection.toggleStudioMode(token: disabledToken) { true }
        XCTAssertFalse(stale)
        XCTAssertEqual(transport.programID, OBSPilotTransport.program)

        // The operator changes mode before OBS delivers the event.
        transport.studioMode = false
        let superseded = await connection.toggleStudioMode(token: enabledToken) { true }
        XCTAssertFalse(superseded)
        XCTAssertEqual(transport.requests.filter { $0 == "SetStudioModeEnabled" }.count, 1)
        for _ in 0..<40 where connection.state?.studioMode != false {
            try await Task.sleep(for: .milliseconds(5))
        }
        XCTAssertEqual(try publishedMode().1, "Off")
    }

    @MainActor
    func testTransitionCyclesConfiguredNamesAndFollowsOBSWithoutTakingLive() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        for (selected, next) in [("Fade", "Cut"), ("Cut", "Slide"), ("Slide", "Fade")] {
            let shown = try XCTUnwrap(connection.state)
            XCTAssertEqual(shown.selectedTransition, selected)
            let changed = await connection.cycleTransition(token: shown.transitionToken) { true }
            XCTAssertTrue(changed)
            XCTAssertEqual(connection.state?.selectedTransition, next)
            let repeated = await connection.cycleTransition(token: shown.transitionToken) { true }
            XCTAssertFalse(repeated)
        }
        let token = try XCTUnwrap(connection.state?.transitionToken)
        transport.transitionName = "Cut"
        transport.onEvent?("CurrentSceneTransitionChanged", ["transitionName": transport.transitionName])
        XCTAssertEqual(connection.state?.selectedTransition, "Cut")
        XCTAssertNotEqual(connection.state?.transitionToken, token)
        XCTAssertEqual(transport.programID, OBSPilotTransport.program)
        XCTAssertEqual(transport.preview, OBSPilotTransport.queued)
        XCTAssertFalse(transport.requests.contains("TriggerStudioModeTransition"))
    }

    @MainActor
    func testSourcesFollowPreviewAndRejectStaleSceneOrVisibility() async throws {
        let transport = OBSPilotTransport()
        let program = OBSPilotTransport.program
        let preview = OBSPilotTransport.queued
        transport.sourceItems = [
            preview: [["sceneItemId": 1, "sourceName": "Camera", "sceneItemEnabled": false]],
            program: [["sceneItemId": 1, "sourceName": "Overlay", "sceneItemEnabled": true]],
        ]
        let connection = try await open(transport)
        func publishedSource(named name: String) async throws -> String {
            for _ in 0..<100 {
                if let action = OBSConnection.controlActions(connection.state).first(where: {
                    $0.id.hasPrefix(OBSConnection.sourcePrefix) &&
                        !$0.id.hasPrefix("obs.source.visible.") && $0.label == name
                }) { return action.id }
                try await Task.sleep(for: .milliseconds(5))
            }
            return try XCTUnwrap(nil as String?, "Source catalogue did not arrive for \(name)")
        }
        let camera = try await publishedSource(named: "Camera")
        transport.preview = program
        let wrongScene = await connection.toggleSource(actionID: camera) { true }
        XCTAssertFalse(wrongScene)
        transport.preview = preview
        let changed = await connection.toggleSource(actionID: camera) { true }
        XCTAssertTrue(changed)
        let staleVisibility = await connection.toggleSource(actionID: camera) { true }
        XCTAssertFalse(staleVisibility)
        XCTAssertEqual(transport.sourceWrites, ["\(preview):1:true"])
        transport.studioMode = false
        transport.onEvent?("StudioModeStateChanged", ["studioModeEnabled": false])
        let overlay = try await publishedSource(named: "Overlay")
        XCTAssertNotEqual(camera, overlay)
        XCTAssertTrue(OBSConnection.controlActions(connection.state).contains {
            $0.id.hasPrefix("obs.source.visible.") && $0.label == "Overlay"
        })
    }

    @MainActor
    func testDedicatedTransitionSelectsOnlyItsConfiguredTarget() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        let cut = OBSConnection.transitionSelectionID("Cut")
        let fade = OBSConnection.transitionSelectionID("Fade")
        let initial = OBSConnection.controlActions(connection.state)
        let cutAction = try XCTUnwrap(initial.first { $0.id.hasPrefix(cut + ".") })
        XCTAssertEqual(cutAction.label, "Cut")
        let selected = await connection.selectTransition(actionID: cutAction.id) { true }
        XCTAssertTrue(selected)
        XCTAssertEqual(transport.transitionName, "Cut")
        XCTAssertTrue(OBSConnection.controlActions(connection.state)
            .contains { $0.id == "obs.transition.selected" && $0.label == cut })
        let stale = await connection.selectTransition(actionID: cutAction.id) { true }
        XCTAssertFalse(stale)
        let fadeAction = try XCTUnwrap(OBSConnection.controlActions(connection.state)
            .first { $0.id.hasPrefix(fade + ".") })
        transport.configuredTransitions = ["Cut", "Slide"]
        let removed = await connection.selectTransition(actionID: fadeAction.id) { true }
        XCTAssertFalse(removed)
        XCTAssertEqual(transport.requests.filter { $0 == "SetCurrentSceneTransition" }.count, 1)
        XCTAssertFalse(transport.requests.contains("TriggerStudioModeTransition"))
        XCTAssertEqual(transport.programID, OBSPilotTransport.program)
    }

    @MainActor
    func testScenePresentationSharesProgramPreviewAndTakeState() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        func entry(_ prefix: String) -> OBSConnection.CatalogueEntry? {
            OBSConnection.controlCatalogue(connection.state).first { $0.id.hasPrefix(prefix) }
        }

        XCTAssertEqual(entry("obs.target." + OBSPilotTransport.program)?.state, .sceneProgram)
        XCTAssertEqual(entry("obs.target." + OBSPilotTransport.queued)?.state, .scenePreview)
        XCTAssertEqual(entry("obs.take")?.state, .takeReady)
        XCTAssertEqual(entry("obs.take")?.detail, "BRB")
        XCTAssertEqual(entry("obs.take")?.available, true)

        transport.updateProgram(OBSPilotTransport.queued)
        XCTAssertEqual(entry("obs.target." + OBSPilotTransport.queued)?.state, .sceneProgramPreview)
        XCTAssertEqual(entry("obs.take")?.state, .takeSameScene)
        XCTAssertEqual(entry("obs.take")?.id, "obs.take")
        XCTAssertEqual(entry("obs.take")?.available, false)

        transport.onEvent?("CurrentSceneCollectionChanging", [:])
        XCTAssertTrue(OBSConnection.controlCatalogue(connection.state).isEmpty)
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
        var validityChecks = 0
        let lostSession = await connection.takeLive(token: token) {
            validityChecks += 1
            return validityChecks == 1
        }
        XCTAssertFalse(lostSession)
        XCTAssertFalse(transport.requests.contains("TriggerStudioModeTransition"))
        let currentPreviewResult = await connection.takeLive(token: token)
        XCTAssertTrue(currentPreviewResult)
        let duplicateResult = await connection.takeLive(token: token)
        XCTAssertFalse(duplicateResult)
        XCTAssertEqual(transport.requests.filter { $0 == "TriggerStudioModeTransition" }.count, 1)
    }

    @MainActor
    func testReplayBufferToggleTracksOBSAndRejectsStaleTaps() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        func control() -> (id: String, label: String)? {
            OBSConnection.productionActions(connection.state).first { $0.id.hasPrefix(OBSConnection.replayBufferID + ".") }
        }
        let off = try XCTUnwrap(control())
        XCTAssertEqual(off.label, "Off")
        let offToken = try XCTUnwrap(OBSConnection.controlToken(off.id, for: OBSConnection.replayBufferID))
        let started = await connection.toggleReplayBuffer(token: offToken, isValid: { true })
        XCTAssertTrue(started)
        let on = try XCTUnwrap(control())
        XCTAssertEqual(on.label, "On")
        XCTAssertTrue(OBSConnection.productionActions(connection.state).contains { $0.id == "obs.replay" })
        let stale = await connection.toggleReplayBuffer(token: offToken, isValid: { true })
        XCTAssertFalse(stale)
        let onToken = try XCTUnwrap(OBSConnection.controlToken(on.id, for: OBSConnection.replayBufferID))
        let stopped = await connection.toggleReplayBuffer(token: onToken, isValid: { true })
        XCTAssertTrue(stopped)
        XCTAssertEqual(control()?.label, "Off")
        XCTAssertFalse(OBSConnection.productionActions(connection.state).contains { $0.id == "obs.replay" })
        XCTAssertEqual(transport.requests.filter { ["StartReplayBuffer", "StopReplayBuffer"].contains($0) },
                       ["StartReplayBuffer", "StopReplayBuffer"])
        transport.onEvent?("ReplayBufferStateChanged", ["outputActive": true])
        XCTAssertEqual(control()?.label, "On")
    }

    @MainActor
    func testReplayShowsSuccessOnlyAfterOBSConfirmsAFile() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        func replayPresentation() -> OBSCardState? {
            OBSConnection.controlCatalogue(connection.state).first { $0.id == "obs.replay" }?.state
        }
        let inactiveResult = await connection.saveReplay()
        XCTAssertFalse(inactiveResult)
        XCTAssertNil(replayPresentation())
        XCTAssertFalse(transport.requests.contains("SaveReplayBuffer"))

        transport.onEvent?("ReplayBufferStateChanged", ["outputActive": true])
        XCTAssertEqual(OBSConnection.productionActions(connection.state).last?.label, "Ready")
        XCTAssertEqual(replayPresentation(), .replayReady)
        let accepted = await connection.saveReplay()
        XCTAssertTrue(accepted)
        XCTAssertEqual(connection.state?.replaySave, .saving)
        XCTAssertEqual(OBSConnection.productionActions(connection.state).last?.label, "Saving")
        XCTAssertEqual(replayPresentation(), .replaySaving)
        let duplicate = await connection.saveReplay()
        XCTAssertFalse(duplicate)
        transport.onEvent?("ReplayBufferSaved", ["savedReplayPath": ""])
        XCTAssertEqual(connection.state?.replaySave, .saving)
        let confirmedAt = ContinuousClock.now
        transport.onEvent?("ReplayBufferSaved", ["savedReplayPath": "/test/replay.mkv"])
        XCTAssertEqual(OBSConnection.productionActions(connection.state).last?.label, "Saved")
        XCTAssertEqual(replayPresentation(), .replaySaved)
        XCTAssertEqual(transport.requests.filter { $0 == "SaveReplayBuffer" }.count, 1)
        try await Task.sleep(for: .seconds(4))
        XCTAssertEqual(connection.state?.replaySave, .saved)
        while connection.state?.replaySave == .saved && ContinuousClock.now - confirmedAt < .seconds(7) {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertGreaterThanOrEqual(ContinuousClock.now - confirmedAt, .seconds(5))
        XCTAssertEqual(OBSConnection.productionActions(connection.state).last?.label, "Ready")
        XCTAssertEqual(replayPresentation(), .replayReady)
    }

    @MainActor
    func testFaderSetsOnlyTheNamedOBSInputAndPreservesMute() async throws {
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        let connection = try await open(transport)
        let id = "obs.level." + OBSPilotTransport.mic
        XCTAssertEqual(OBSConnection.faderActions(connection.state).first?.id, id)
        XCTAssertEqual(OBSConnection.faderValues(connection.state)[id], 64)
        let unknown = await connection.setFader(
            controlID: "obs.level.bd73192e-4d59-4ff4-afab-c88777454f98", value: 80)
        XCTAssertFalse(unknown)
        let unity = await connection.setFader(controlID: id, value: 80)
        XCTAssertTrue(unity)
        XCTAssertEqual(transport.lastFaderWrite?["inputUuid"] as? String, OBSPilotTransport.mic)
        XCTAssertEqual(transport.lastFaderWrite?["inputVolumeDb"] as? Double, 0)
        XCTAssertEqual(connection.state?.inputMutes[OBSPilotTransport.mic], true)
        let silent = await connection.setFader(controlID: id, value: 0)
        XCTAssertTrue(silent)
        XCTAssertEqual(transport.lastFaderWrite?["inputVolumeMul"] as? Double, 0)
        XCTAssertFalse(transport.requests.contains("SetInputMute"))
        XCTAssertEqual(OBSConnection.faderValues(connection.state)[id], 0)

        transport.onEvent?("InputVolumeChanged", [
            "inputUuid": OBSPilotTransport.mic, "inputVolumeDb": 13.0, "inputVolumeMul": 4.47,
        ])
        XCTAssertEqual(OBSConnection.faderValues(connection.state)[id], 90)
        transport.onEvent?("CurrentSceneCollectionChanging", [:])
        XCTAssertTrue(OBSConnection.faderValues(connection.state).isEmpty)
        let offline = await connection.setFader(controlID: id, value: 80)
        XCTAssertFalse(offline)
    }

    @MainActor
    func testOBSCoughRestoresOnlyTheHoldThatMutedTheInput() async throws {
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        transport.muted = false
        let connection = try await open(transport)
        let id = "obs.cough." + OBSPilotTransport.mic
        let holder = NSObject()
        let other = NSObject()
        let session = ObjectIdentifier(holder)
        XCTAssertTrue(OBSConnection.controlActions(connection.state).contains { $0.id == id })
        let began = await connection.setCough(100, controlID: id, from: session)
        XCTAssertTrue(began)
        XCTAssertEqual(OBSConnection.audioValues(connection.state)[id], 100)
        let refreshed = await connection.setCough(50, controlID: id, from: session)
        XCTAssertTrue(refreshed)
        let foreignRelease = await connection.setCough(0, controlID: id, from: ObjectIdentifier(other))
        XCTAssertFalse(foreignRelease)
        let released = await connection.setCough(0, controlID: id, from: session)
        XCTAssertTrue(released)
        XCTAssertEqual(transport.muteWrites, [true, false])
        XCTAssertEqual(OBSConnection.audioValues(connection.state)[id], 0)

        transport.updateMute(true)
        let beganMuted = await connection.setCough(100, controlID: id, from: session)
        let releasedMuted = await connection.setCough(0, controlID: id, from: session)
        XCTAssertTrue(beganMuted)
        XCTAssertTrue(releasedMuted)
        XCTAssertEqual(transport.muteWrites, [true, false])
        XCTAssertTrue(transport.muted)
    }

    @MainActor
    func testOBSCoughAbandonsRestoreWhenMuteOwnershipIsLost() async throws {
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        transport.muted = false
        let connection = try await open(transport, coughTouchTimeout: .milliseconds(120))
        let id = "obs.cough." + OBSPilotTransport.mic
        let holder = NSObject()
        let session = ObjectIdentifier(holder)

        let began = await connection.setCough(100, controlID: id, from: session)
        XCTAssertTrue(began)
        transport.updateMute(false)
        transport.updateMute(true)
        let releasedAfterOverride = await connection.setCough(0, controlID: id, from: session)
        XCTAssertFalse(releasedAfterOverride)
        XCTAssertTrue(transport.muted)

        transport.updateMute(false)
        let beganAgain = await connection.setCough(100, controlID: id, from: session)
        XCTAssertTrue(beganAgain)
        connection.abandonCoughHolds(from: session)
        let releasedAfterDisconnect = await connection.setCough(0, controlID: id, from: session)
        XCTAssertFalse(releasedAfterDisconnect)
        XCTAssertTrue(transport.muted)

        transport.updateMute(false)
        let beganForExpiry = await connection.setCough(100, controlID: id, from: session)
        XCTAssertTrue(beganForExpiry)
        try await Task.sleep(for: .milliseconds(150))
        let releasedAfterExpiry = await connection.setCough(0, controlID: id, from: session)
        XCTAssertFalse(releasedAfterExpiry)
        XCTAssertTrue(transport.muted)

        transport.updateMute(false)
        transport.emitMuteEvents = false
        let beganWithoutEvent = await connection.setCough(100, controlID: id, from: session)
        XCTAssertTrue(beganWithoutEvent)
        let releasedWithoutEvent = await connection.setCough(0, controlID: id, from: session)
        XCTAssertFalse(releasedWithoutEvent)
        XCTAssertTrue(transport.muted)
        XCTAssertEqual(transport.muteWrites, [true, true, true, true])
    }

    @MainActor
    func testGuardedOutputRequiresTheDisplayedStateAndFreshOBSConfirmation() async throws {
        let transport = OBSPilotTransport()
        transport.recording = false
        transport.recordingPaused = false
        let connection = try await open(transport)
        func showsRecording() -> Bool {
            OBSConnection.controlActions(connection.state).contains { $0.id == "obs.record.active" }
        }
        XCTAssertFalse(showsRecording())
        let start = try XCTUnwrap(OBSConnection.outputActions(connection.state).first)
        XCTAssertEqual(start.label, "Start Recording")
        let token = try XCTUnwrap(OBSConnection.Output.command(start.id)?.1)

        let started = await connection.performOutput(.record, token: token)
        XCTAssertTrue(started)
        XCTAssertEqual(transport.outputWrites, ["StartRecord"])
        XCTAssertEqual(connection.state?.recordStatus, "Recording · Active")
        XCTAssertTrue(showsRecording())
        let oldPrompt = await connection.performOutput(.record, token: token)
        XCTAssertFalse(oldPrompt)

        let stop = try XCTUnwrap(OBSConnection.outputActions(connection.state).first)
        XCTAssertEqual(stop.label, "Stop Recording")
        let stopToken = try XCTUnwrap(OBSConnection.Output.command(stop.id)?.1)
        transport.recording = false // OBS event deliberately withheld.
        let stale = await connection.performOutput(.record, token: stopToken)
        XCTAssertFalse(stale)
        XCTAssertEqual(transport.outputWrites, ["StartRecord"])
        XCTAssertEqual(connection.state?.recordStatus, "Recording · Idle")
        XCTAssertFalse(showsRecording())
    }

    @MainActor
    func testPausedRecordingStaysLitAndCanBeStopped() async throws {
        let transport = OBSPilotTransport()
        transport.recording = false
        transport.recordingPaused = true
        let connection = try await open(transport)
        func showsRecording() -> Bool {
            OBSConnection.controlActions(connection.state).contains { $0.id == "obs.record.active" }
        }
        XCTAssertTrue(showsRecording(), "Initial paused snapshot is active")
        transport.onEvent?("RecordStateChanged", [
            "outputActive": true, "outputState": "OBS_WEBSOCKET_OUTPUT_RESUMED",
        ])
        XCTAssertEqual(connection.state?.recordStatus, "Recording · Active")
        transport.onEvent?("RecordStateChanged", [
            "outputActive": false, "outputState": "OBS_WEBSOCKET_OUTPUT_PAUSED",
        ])
        XCTAssertEqual(connection.state?.recordStatus, "Recording · Paused")
        XCTAssertTrue(showsRecording())
        let stop = try XCTUnwrap(OBSConnection.outputActions(connection.state).first)
        XCTAssertEqual(stop.label, "Stop Recording")
        let token = try XCTUnwrap(OBSConnection.Output.command(stop.id)?.1)
        var confirmedAfterEvent = false
        transport.recordStatusRead = {
            guard transport.outputWrites.last == "StopRecord" else { return }
            let actions = OBSConnection.controlActions(connection.state)
            XCTAssertTrue(actions.contains { $0.id == "obs.output.record" && $0.label == "Stopping" })
            XCTAssertTrue(showsRecording())
            confirmedAfterEvent = true
        }
        let stopped = await connection.performOutput(.record, token: token)
        XCTAssertTrue(stopped)
        XCTAssertTrue(confirmedAfterEvent)
        XCTAssertEqual(transport.outputWrites, ["StopRecord"])
        XCTAssertFalse(showsRecording())
    }

    @MainActor
    func testStoppingRecordingPublishesFeedbackWithoutAnotherStopAction() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        transport.onEvent?("RecordStateChanged", [
            "outputActive": false, "outputState": "OBS_WEBSOCKET_OUTPUT_STOPPING",
        ])
        let stopping = Dictionary(uniqueKeysWithValues: OBSConnection.controlActions(connection.state))
        XCTAssertEqual(stopping["obs.output.record"], "Stopping")
        XCTAssertEqual(stopping["obs.record.active"], "Recording")
        XCTAssertFalse(stopping.keys.contains { $0.hasPrefix("obs.output.record.") })
        transport.onEvent?("RecordStateChanged", [
            "outputActive": false, "outputState": "OBS_WEBSOCKET_OUTPUT_STOPPED",
        ])
        let stopped = Dictionary(uniqueKeysWithValues: OBSConnection.controlActions(connection.state))
        XCTAssertNil(stopped["obs.output.record"])
        XCTAssertNil(stopped["obs.record.active"])
        XCTAssertTrue(stopped.contains { $0.key.hasPrefix("obs.output.record.") && $0.value == "Start Recording" })
    }

    @MainActor
    func testGuardedOutputCancelsIfTheDisplayLeavesDuringTheStatusCheck() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        let token = try XCTUnwrap(connection.state?.outputTokens[.record])
        var connected = true
        transport.recordStatusRead = { connected = false }
        let stopped = await connection.performOutput(.record, token: token) { connected }
        XCTAssertFalse(stopped)
        XCTAssertTrue(transport.outputWrites.isEmpty)
    }

    @MainActor
    func testGuardedStreamCancelsWhenTheOutputChangesAfterShowingTheAction() async throws {
        let transport = OBSPilotTransport()
        transport.streaming = false
        transport.streamReconnecting = false
        let connection = try await open(transport)
        let token = try XCTUnwrap(connection.state?.outputTokens[.stream])
        transport.onEvent?("StreamStateChanged", [
            "outputActive": false, "outputState": "OBS_WEBSOCKET_OUTPUT_STARTING",
        ])
        let stale = await connection.performOutput(.stream, token: token)
        XCTAssertFalse(stale)
        XCTAssertTrue(transport.outputWrites.isEmpty)

        transport.onEvent?("StreamStateChanged", [
            "outputActive": false, "outputState": "OBS_WEBSOCKET_OUTPUT_STOPPED",
        ])
        let fresh = try XCTUnwrap(connection.state?.outputTokens[.stream])
        let started = await connection.performOutput(.stream, token: fresh)
        XCTAssertTrue(started)
        XCTAssertEqual(transport.outputWrites, ["StartStream"])
        XCTAssertEqual(connection.state?.streamStatus, "Stream · Live")
        let stop = try XCTUnwrap(connection.state?.outputTokens[.stream])
        let stopped = await connection.performOutput(.stream, token: stop)
        XCTAssertTrue(stopped)
        XCTAssertEqual(transport.outputWrites, ["StartStream", "StopStream"])
        XCTAssertEqual(connection.state?.streamStatus, "Stream · Idle")
    }

    @MainActor
    func testBreakMutesBeforeSwitchingAndRestoresOnlyAfterReturning() async throws {
        let domain = "EspDesktop.OBSBreak." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        transport.muted = false
        let connection = try await open(transport, defaults: defaults)
        connection.configureBreak(sceneID: OBSPilotTransport.queued, micID: OBSPilotTransport.mic)
        let enter = try XCTUnwrap(connection.state?.breakCard?.token)
        let away = await connection.performBreak(token: enter)
        XCTAssertTrue(away)
        XCTAssertEqual(transport.breakRequests, ["mute", "scene:" + OBSPilotTransport.queued])
        XCTAssertTrue(transport.muted)
        XCTAssertEqual(connection.state?.breakCard?.label, "Resume")
        let resume = try XCTUnwrap(connection.state?.breakCard?.token)
        let resumed = await connection.performBreak(token: resume)
        XCTAssertTrue(resumed)
        XCTAssertEqual(transport.breakRequests, ["mute", "scene:" + OBSPilotTransport.queued,
                                                  "scene:" + OBSPilotTransport.program, "unmute"])
        XCTAssertFalse(transport.muted)
        XCTAssertEqual(connection.state?.breakCard?.label, "BRB · BRB")

        transport.updateMute(true)
        let ready = try XCTUnwrap(connection.state?.breakCard?.token)
        let awayMuted = await connection.performBreak(token: ready)
        XCTAssertTrue(awayMuted)
        let again = try XCTUnwrap(connection.state?.breakCard?.token)
        let resumedMuted = await connection.performBreak(token: again)
        XCTAssertTrue(resumedMuted)
        XCTAssertTrue(transport.muted)
        XCTAssertEqual(transport.muteWrites, [true, false])
    }

    @MainActor
    func testBreakLeavesTheMicMutedAndExplainsAPartialFailure() async throws {
        let domain = "EspDesktop.OBSBreak." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        transport.muted = false
        transport.rejectProgramChange = true
        let connection = try await open(transport, defaults: defaults)
        connection.configureBreak(sceneID: OBSPilotTransport.queued, micID: OBSPilotTransport.mic)
        let enter = try XCTUnwrap(connection.state?.breakCard?.token)
        let failed = await connection.performBreak(token: enter)
        XCTAssertFalse(failed)
        XCTAssertTrue(transport.muted)
        XCTAssertEqual(transport.programID, OBSPilotTransport.program)
        XCTAssertNil(connection.state?.breakCard?.token)
        XCTAssertEqual(connection.state?.breakCard?.label, "BRB · Check OBS")
        let restarted = try await open(transport, defaults: defaults)
        XCTAssertTrue(restarted.breakNeedsReview)
        XCTAssertEqual(restarted.breakConfiguration?.micID, OBSPilotTransport.mic)
    }

    @MainActor
    func testBreakDoesNotSwitchAfterRejectedMuteOrDisplayDisconnect() async throws {
        let domain = "EspDesktop.OBSBreak." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        transport.muted = false
        let connection = try await open(transport, defaults: defaults)
        connection.configureBreak(sceneID: OBSPilotTransport.queued, micID: OBSPilotTransport.mic)
        let enter = try XCTUnwrap(connection.state?.breakCard?.token)
        transport.rejectMuteCommand = true
        let rejected = await connection.performBreak(token: enter)
        XCTAssertFalse(rejected)
        XCTAssertFalse(transport.muted)
        XCTAssertEqual(transport.breakRequests, ["mute"])

        connection.acknowledgeBreakReview()
        let retry = try XCTUnwrap(connection.state?.breakCard?.token)
        transport.rejectMuteCommand = false
        var connected = true
        transport.afterMute = { connected = false }
        let disconnected = await connection.performBreak(token: retry) { connected }
        XCTAssertFalse(disconnected)
        XCTAssertTrue(transport.muted)
        XCTAssertEqual(transport.breakRequests, ["mute", "mute"])
    }

    @MainActor
    func testBreakCanStartAgainAfterTakingAnotherSceneLive() async throws {
        let domain = "EspDesktop.OBSBreak." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        transport.muted = false
        let connection = try await open(transport, defaults: defaults)
        connection.configureBreak(sceneID: OBSPilotTransport.queued, micID: OBSPilotTransport.mic)
        let enter = try XCTUnwrap(connection.state?.breakCard?.token)
        let away = await connection.performBreak(token: enter)
        XCTAssertTrue(away)
        let resume = try XCTUnwrap(connection.state?.breakCard?.token)
        transport.preview = OBSPilotTransport.program
        transport.onEvent?("CurrentPreviewSceneChanged", transport.scene(transport.preview))
        let take = try XCTUnwrap(connection.state?.takeToken)
        let taken = await connection.takeLive(token: take)
        XCTAssertTrue(taken)
        transport.updateProgram(OBSPilotTransport.program)
        XCTAssertNil(connection.state?.breakCard?.token)
        transport.onEvent?("SceneTransitionEnded", [:])
        XCTAssertNil(defaults.object(forKey: "obs.breakRecovery"))
        XCTAssertFalse(connection.breakNeedsReview)
        let startAgain = try XCTUnwrap(connection.state?.breakCard?.token)
        XCTAssertEqual(connection.state?.breakCard?.label, "BRB · BRB")
        let stale = await connection.performBreak(token: resume)
        XCTAssertFalse(stale)
        XCTAssertTrue(transport.muted)
        XCTAssertEqual(transport.breakRequests, ["mute", "scene:" + OBSPilotTransport.queued])
        let secondBreak = await connection.performBreak(token: startAgain)
        XCTAssertTrue(secondBreak)
        let secondResume = try XCTUnwrap(connection.state?.breakCard?.token)
        let returned = await connection.performBreak(token: secondResume)
        XCTAssertTrue(returned)
        XCTAssertTrue(transport.muted, "A new break preserves the mic state it started with")
    }

    @MainActor
    func testStarterSceneRechecksStudioModeBeforeChoosingPreviewOrProgram() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        let scene = try XCTUnwrap(UUID(uuidString: OBSPilotTransport.queued))
        let studioToken = try XCTUnwrap(connection.state?.adaptiveSceneToken)
        let preview = await connection.performAdaptiveScene(scene, token: studioToken) { true }
        XCTAssertTrue(preview)
        let studioActions = OBSConnection.controlActions(connection.state).map(\.id)
        XCTAssertTrue(studioActions.contains("obs.selected." + OBSPilotTransport.queued))
        XCTAssertTrue(studioActions.contains("obs.program." + OBSPilotTransport.program))
        XCTAssertEqual(transport.requests.filter { $0 == "SetCurrentPreviewScene" }.count, 1)
        XCTAssertFalse(transport.requests.contains("SetCurrentProgramScene"))

        transport.studioMode = false
        let stale = await connection.performAdaptiveScene(scene, token: studioToken) { true }
        XCTAssertFalse(stale)
        XCTAssertFalse(transport.requests.contains("SetCurrentProgramScene"))
        transport.onEvent?("StudioModeStateChanged", ["studioModeEnabled": false])
        for _ in 0..<40 where connection.state?.studioMode != false {
            try await Task.sleep(for: .milliseconds(10))
        }
        let programToken = try XCTUnwrap(connection.state?.adaptiveSceneToken)
        XCTAssertNotEqual(studioToken, programToken)
        let normalActions = OBSConnection.controlActions(connection.state).map(\.id)
        XCTAssertTrue(normalActions.contains("obs.selected." + OBSPilotTransport.program))
        XCTAssertFalse(normalActions.contains { $0.hasPrefix("obs.program.") })
        let program = await connection.performAdaptiveScene(scene, token: programToken) { true }
        XCTAssertTrue(program)
        XCTAssertEqual(transport.programID, OBSPilotTransport.queued)
    }

    @MainActor
    func testInterruptedTransitionReenablesTakeWithoutEndEvent() async throws {
        let transport = OBSPilotTransport()
        let domain = "EspDesktop.OBSBreak." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let connection = try await open(transport, transitionProbeInterval: .milliseconds(1), defaults: defaults)
        connection.configureBreak(sceneID: OBSPilotTransport.queued, micID: nil)
        XCTAssertNotNil(connection.state?.breakCard?.token)
        transport.transitionCursor = 0.5
        transport.onEvent?("SceneTransitionStarted", [:])
        XCTAssertFalse(connection.state?.canTakePreview ?? true)
        XCTAssertNil(connection.state?.breakCard?.token)
        XCTAssertEqual(OBSConnection.controlActions(connection.state).first { $0.id == "obs.take" }?.label,
                       "Take Live · Transitioning")
        transport.transitionCursor = 1
        for _ in 0..<100 where connection.state?.canTakePreview != true {
            try await Task.sleep(for: .milliseconds(1))
        }
        XCTAssertEqual(connection.state?.canTakePreview, true)
        XCTAssertNotNil(connection.state?.breakCard?.token)
        XCTAssertTrue(transport.requests.contains("GetCurrentSceneTransitionCursor"))
    }

    @MainActor
    func testProgramChangeChecksTransitionWithoutWaitingForFallback() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport, transitionProbeInterval: .seconds(30))
        transport.transitionCursor = 0.5
        transport.onEvent?("SceneTransitionStarted", [:])
        XCTAssertEqual(connection.state?.takePresentation, .takeTransitioning)

        transport.transitionCursor = 1
        transport.updateProgram(OBSPilotTransport.queued)
        transport.onEvent?("CurrentPreviewSceneChanged", transport.scene(OBSPilotTransport.program))
        for _ in 0..<100 where connection.state?.canTakePreview != true {
            try await Task.sleep(for: .milliseconds(1))
        }
        XCTAssertEqual(connection.state?.takePresentation, .takeReady)
        XCTAssertEqual(transport.requests.filter { $0 == "GetCurrentSceneTransitionCursor" }.count, 1)
    }

    @MainActor
    func testVideoEndRetriesTakeReadinessWhenTheCursorHasNotSettled() async throws {
        let transport = OBSPilotTransport()
        transport.transitionName = "Cut"
        let connection = try await open(transport, transitionProbeInterval: .seconds(30))
        transport.transitionCursor = 0.5
        transport.onEvent?("SceneTransitionStarted", [:])
        transport.updateProgram(OBSPilotTransport.queued)
        transport.onEvent?("CurrentPreviewSceneChanged", transport.scene(OBSPilotTransport.program))
        transport.onEvent?("SceneTransitionVideoEnded", [:])

        for _ in 0..<100 where !transport.requests.contains("GetCurrentSceneTransitionCursor") {
            try await Task.sleep(for: .milliseconds(1))
        }
        XCTAssertTrue(transport.requests.contains("GetCurrentSceneTransitionCursor"))
        XCTAssertEqual(connection.state?.takePresentation, .takeTransitioning)
        transport.transitionCursor = 1
        for _ in 0..<200 where connection.state?.canTakePreview != true {
            try await Task.sleep(for: .milliseconds(1))
        }
        XCTAssertEqual(connection.state?.takePresentation, .takeReady)
        XCTAssertGreaterThanOrEqual(transport.requests.filter { $0 == "GetCurrentSceneTransitionCursor" }.count, 2)
    }

    @MainActor
    func testInterruptedNormalModeTransitionReenablesBreakAndResume() async throws {
        let domain = "EspDesktop.OBSBreak." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let transport = OBSPilotTransport()
        transport.studioMode = false
        let connection = try await open(transport, transitionProbeInterval: .milliseconds(1), defaults: defaults)
        connection.configureBreak(sceneID: OBSPilotTransport.queued, micID: nil)
        XCTAssertEqual(OBSConnection.controlActions(connection.state).first { $0.id == "obs.take" }?.label,
                       "Take Live · Enable Studio Mode")

        func recoverAfterInterruptedTransition() async throws -> UUID {
            let original = try XCTUnwrap(connection.state?.breakCard?.token)
            transport.transitionCursor = 0.5
            transport.onEvent?("SceneTransitionStarted", [:])
            XCTAssertNil(connection.state?.breakCard?.token)
            transport.transitionCursor = 1
            for _ in 0..<100 where connection.state?.breakCard?.token == nil {
                try await Task.sleep(for: .milliseconds(1))
            }
            let recovered = try XCTUnwrap(connection.state?.breakCard?.token)
            XCTAssertNotEqual(original, recovered)
            XCTAssertFalse(connection.state?.canTakePreview ?? true)
            return recovered
        }

        let enter = try await recoverAfterInterruptedTransition()
        let didEnter = await connection.performBreak(token: enter)
        XCTAssertTrue(didEnter)
        XCTAssertEqual(connection.state?.breakCard?.label, "Resume")

        let resume = try await recoverAfterInterruptedTransition()
        let didResume = await connection.performBreak(token: resume)
        XCTAssertTrue(didResume)
        XCTAssertEqual(transport.programID, OBSPilotTransport.program)
    }
}
