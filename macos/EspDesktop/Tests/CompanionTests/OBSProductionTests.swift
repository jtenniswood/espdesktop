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
    var programID = program
    var rejectProgramChange = false
    var rejectMuteCommand = false
    var breakRequests: [String] = []
    var afterMute: (() -> Void)?
    var transitionCursor = 1.0
    var replayActive = false
    var studioMode = true
    var streaming = true
    var streamReconnecting = true
    var recording = true
    var recordingPaused = true
    var recordStatusRead: (() -> Void)?
    var outputWrites: [String] = []
    var hasAudioInput = false
    var lastFaderWrite: OBSWebSocket.Fields?
    var muted = true
    var emitMuteEvents = true
    var muteWrites: [Bool] = []
    var meterSubscriptions: [Bool] = []
    var faderDb = -20.0
    var faderMultiplier = 0.1
    static let mic = "69da3f8f-7f62-4abe-a594-4e40dd579858"
    static let program = "bd73192e-4d59-4ff4-afab-c88777454f98"
    static let queued = "0b3d47f0-c796-44c1-9e63-1a8cb0519101"

    func setMeterEventsEnabled(_ enabled: Bool) { meterSubscriptions.append(enabled) }
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
        case "SetCurrentPreviewScene":
            preview = fields["sceneUuid"] as? String ?? ""
            onEvent?("CurrentPreviewSceneChanged", scene(preview))
            return [:]
        case "GetStreamStatus":
            return ["outputActive": streaming, "outputReconnecting": streamReconnecting]
        case "GetRecordStatus":
            recordStatusRead?()
            return ["outputActive": recording, "outputPaused": recordingPaused]
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
        case "SaveReplayBuffer": return [:]
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
                      meterExpiry: Duration = .seconds(1),
                      coughTouchTimeout: Duration = .seconds(1),
                      defaults: UserDefaults = .standard) async throws -> OBSConnection {
        let connection = OBSConnection(defaults: defaults, socket: transport, transitionProbeInterval: transitionProbeInterval,
                                       meterInterval: .milliseconds(5), meterExpiry: meterExpiry,
                                       coughTouchTimeout: coughTouchTimeout)
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
        XCTAssertTrue(OBSConnection.controlActions(connection.state).contains { $0.id == "obs.record.active" })
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

    @MainActor
    func testReplayShowsSuccessOnlyAfterOBSConfirmsAFile() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        let inactiveResult = await connection.saveReplay()
        XCTAssertFalse(inactiveResult)
        XCTAssertFalse(transport.requests.contains("SaveReplayBuffer"))

        transport.onEvent?("ReplayBufferStateChanged", ["outputActive": true])
        XCTAssertEqual(OBSConnection.productionActions(connection.state).last?.label, "Save Replay")
        let accepted = await connection.saveReplay()
        XCTAssertTrue(accepted)
        XCTAssertEqual(connection.state?.replaySave, .saving)
        let duplicate = await connection.saveReplay()
        XCTAssertFalse(duplicate)
        transport.onEvent?("ReplayBufferSaved", ["savedReplayPath": ""])
        XCTAssertEqual(connection.state?.replaySave, .saving)
        transport.onEvent?("ReplayBufferSaved", ["savedReplayPath": "/test/replay.mkv"])
        XCTAssertEqual(OBSConnection.productionActions(connection.state).last?.label, "Replay saved")
        XCTAssertEqual(transport.requests.filter { $0 == "SaveReplayBuffer" }.count, 1)
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
    func testMeterWatchesTheSelectedInputUsesPreFaderPeakAndExpires() async throws {
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        let connection = try await open(transport, meterExpiry: .milliseconds(80))
        let id = "obs.meter." + OBSPilotTransport.mic
        XCTAssertTrue(OBSConnection.controlActions(connection.state).contains { $0.id == id })
        let sample: OBSWebSocket.Fields = ["inputs": [
            ["inputUuid": OBSPilotTransport.mic, "inputLevelsMul": [[0.002, 0.01, 0.1], [0.0, 0.0, 0.5]]],
            ["inputUuid": OBSPilotTransport.program, "inputLevelsMul": [[1.0, 1.0, 1.0]]],
        ]]
        transport.onEvent?("InputVolumeMeters", sample)
        XCTAssertTrue(connection.meterValues.isEmpty)

        connection.setMeterInputs([id])
        XCTAssertEqual(transport.meterSubscriptions, [true])
        transport.onEvent?("InputVolumeMeters", sample)
        transport.onEvent?("InputVolumeMeters", ["inputs": [
            ["inputUuid": OBSPilotTransport.mic, "inputLevelsMul": [[0.001, 0.002, 0.01]]],
        ]])
        for _ in 0..<40 where connection.meterValues.isEmpty {
            try await Task.sleep(for: .milliseconds(1))
        }
        XCTAssertEqual(connection.meterValues, [id: 90])
        XCTAssertEqual(connection.state?.inputMutes[OBSPilotTransport.mic], true)

        for _ in 0..<200 where !connection.meterValues.isEmpty {
            try await Task.sleep(for: .milliseconds(1))
        }
        XCTAssertTrue(connection.meterValues.isEmpty)
        connection.setMeterInputs([])
        XCTAssertEqual(transport.meterSubscriptions, [true, false])
    }

    @MainActor
    func testCollectionChangeClearsMeterAndDiscardsBufferedSamples() async throws {
        let transport = OBSPilotTransport()
        transport.hasAudioInput = true
        let connection = try await open(transport)
        let id = "obs.meter." + OBSPilotTransport.mic
        connection.setMeterInputs([id])
        let sample: OBSWebSocket.Fields = ["inputs": [
            ["inputUuid": OBSPilotTransport.mic, "inputLevelsMul": [[0.001, 0.002, 1.0]]],
        ]]
        transport.onEvent?("InputVolumeMeters", sample)
        for _ in 0..<40 where connection.meterValues.isEmpty {
            try await Task.sleep(for: .milliseconds(1))
        }
        XCTAssertEqual(connection.meterValues, [id: 100])
        transport.onEvent?("CurrentSceneCollectionChanging", [:])
        XCTAssertTrue(connection.meterValues.isEmpty)
        transport.onEvent?("InputVolumeMeters", sample)
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertTrue(connection.meterValues.isEmpty)
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
    func testBreakCancelsResumeWhenOBSOperatorTakesOver() async throws {
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
        transport.updateProgram(OBSPilotTransport.program)
        transport.updateProgram(OBSPilotTransport.queued)
        let stale = await connection.performBreak(token: resume)
        XCTAssertFalse(stale)
        XCTAssertTrue(transport.muted)
        XCTAssertEqual(transport.breakRequests, ["mute", "scene:" + OBSPilotTransport.queued])
        XCTAssertTrue(connection.breakNeedsReview)
    }

    @MainActor
    func testStarterSceneRechecksStudioModeBeforeChoosingPreviewOrProgram() async throws {
        let transport = OBSPilotTransport()
        let connection = try await open(transport)
        let scene = try XCTUnwrap(UUID(uuidString: OBSPilotTransport.queued))
        let studioToken = try XCTUnwrap(connection.state?.adaptiveSceneToken)
        let preview = await connection.performAdaptiveScene(scene, token: studioToken) { true }
        XCTAssertTrue(preview)
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
