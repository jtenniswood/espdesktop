import CoreAudio
import XCTest
@testable import Companion

@MainActor
final class SystemMediaControllerTests: XCTestCase {
    func testForcedSnapshotMarksEveryMissingControlUnavailable() {
        let unavailable = SystemMediaController.unavailableVolumeIDs(
            values: [SystemMediaController.outputVolumeID: 45],
            previousValues: [:],
            force: true
        )

        XCTAssertEqual(unavailable, [SystemMediaController.inputVolumeID, SystemMediaController.inputMuteID, SystemMediaController.outputMuteID])
    }

    func testIncrementalSnapshotOnlyRemovesPreviouslyPublishedControls() {
        let unavailable = SystemMediaController.unavailableVolumeIDs(
            values: [:],
            previousValues: [SystemMediaController.outputVolumeID: 45],
            force: false
        )

        XCTAssertEqual(unavailable, [SystemMediaController.outputVolumeID])
    }

    @MainActor
    private final class AudioFixture {
        var output: AudioDeviceID = 1
        var input: AudioDeviceID = 2
        var levels: [AudioDeviceID: Float32] = [1: 0.7345, 2: 0.4187, 3: 0.25]
        var nativeMutes: [AudioDeviceID: Bool] = [:]
        var writeSucceeds = true
        var writes = 0
        func controller() -> SystemMediaController {
            SystemMediaController(
                defaultDevice: { scope in scope == kAudioDevicePropertyScopeInput ? self.input : self.output },
                volume: { device, _ in self.levels[device] },
                setVolume: { level, device, _ in
                    self.writes += 1
                    guard self.writeSucceeds else { return false }
                    self.levels[device] = level
                    return true
                },
                mute: { device, _ in self.nativeMutes[device] },
                setMute: { muted, device, _ in
                    guard self.writeSucceeds else { return false }
                    self.nativeMutes[device] = muted
                    return true
                }
            )
        }
    }

    func testMuteAndRestoreExactInputAndOutputLevels() {
        let audio = AudioFixture(), controller = audio.controller()
        for (id, device) in [(SystemMediaController.inputMuteID, AudioDeviceID(2)),
                             (SystemMediaController.outputMuteID, AudioDeviceID(1))] {
            let original = audio.levels[device]
            XCTAssertTrue(controller.setValue(100, controlIdentifier: id))
            XCTAssertEqual(audio.levels[device], 0)
            XCTAssertEqual(controller.values()[id], 100)
            // Repeated mute requests must not replace the original with zero.
            XCTAssertTrue(controller.setValue(100, controlIdentifier: id))
            XCTAssertTrue(controller.setValue(0, controlIdentifier: id))
            XCTAssertEqual(audio.levels[device], original)
            XCTAssertEqual(controller.values()[id], 0)
        }
    }

    func testDeviceChangesDoNotRestoreAnotherDevicesLevel() {
        let audio = AudioFixture(), controller = audio.controller()
        XCTAssertTrue(controller.setValue(100, controlIdentifier: SystemMediaController.outputMuteID))
        audio.output = 3
        XCTAssertTrue(controller.setValue(0, controlIdentifier: SystemMediaController.outputMuteID))
        XCTAssertEqual(audio.levels[3], 0.25)
        audio.output = 1
        XCTAssertTrue(controller.setValue(0, controlIdentifier: SystemMediaController.outputMuteID))
        XCTAssertEqual(audio.levels[1], 0.7345)
    }

    func testFailuresKeepRestoreLevelAndUnknownZeroDoesNotGuess() {
        let audio = AudioFixture(), controller = audio.controller()
        audio.writeSucceeds = false
        XCTAssertFalse(controller.setValue(100, controlIdentifier: SystemMediaController.inputMuteID))
        XCTAssertEqual(audio.levels[2], 0.4187)
        audio.writeSucceeds = true
        XCTAssertTrue(controller.setValue(100, controlIdentifier: SystemMediaController.inputMuteID))
        audio.writeSucceeds = false
        XCTAssertFalse(controller.setValue(0, controlIdentifier: SystemMediaController.inputMuteID))
        audio.writeSucceeds = true
        XCTAssertTrue(controller.setValue(0, controlIdentifier: SystemMediaController.inputMuteID))
        XCTAssertEqual(audio.levels[2], 0.4187)
        audio.levels[1] = 0
        XCTAssertNil(controller.values()[SystemMediaController.outputMuteID])
        XCTAssertFalse(controller.setValue(0, controlIdentifier: SystemMediaController.outputMuteID))
        XCTAssertFalse(controller.setValue(50, controlIdentifier: SystemMediaController.outputMuteID))
    }

    func testSliderAndExternalChangesEstablishTheNextRestoreLevel() {
        let audio = AudioFixture(), controller = audio.controller()
        let mute = SystemMediaController.outputMuteID
        XCTAssertTrue(controller.setValue(100, controlIdentifier: mute))
        XCTAssertTrue(controller.setValue(36, controlIdentifier: SystemMediaController.outputVolumeID))
        XCTAssertEqual(controller.values()[mute], 0)
        XCTAssertTrue(controller.setValue(100, controlIdentifier: mute))
        XCTAssertTrue(controller.setValue(0, controlIdentifier: mute))
        XCTAssertEqual(audio.levels[1], 0.36)
        XCTAssertTrue(controller.setValue(100, controlIdentifier: mute))
        audio.levels[1] = 0.6123
        XCTAssertEqual(controller.values()[mute], 0)
        XCTAssertTrue(controller.setValue(100, controlIdentifier: mute))
        XCTAssertTrue(controller.setValue(0, controlIdentifier: mute))
        XCTAssertEqual(audio.levels[1], 0.6123)
    }

    func testNativeMutePreservesLevelsAndInputOutputAreIndependent() {
        let audio = AudioFixture()
        audio.nativeMutes = [1: false, 2: false]
        let controller = audio.controller()
        XCTAssertTrue(controller.setValue(100, controlIdentifier: SystemMediaController.inputMuteID))
        XCTAssertTrue(controller.setValue(100, controlIdentifier: SystemMediaController.outputMuteID))
        XCTAssertEqual(audio.levels[1], 0.7345)
        XCTAssertEqual(audio.levels[2], 0.4187)
        XCTAssertEqual(controller.values()[SystemMediaController.inputMuteID], 100)
        XCTAssertTrue(controller.setValue(0, controlIdentifier: SystemMediaController.inputMuteID))
        XCTAssertEqual(audio.nativeMutes[1], true)
        XCTAssertEqual(audio.nativeMutes[2], false)
        // Native mute remains understandable to a fresh app controller.
        XCTAssertTrue(audio.controller().setValue(0, controlIdentifier: SystemMediaController.outputMuteID))
        XCTAssertEqual(audio.levels[1], 0.7345)
        XCTAssertEqual(audio.nativeMutes[1], false)
        XCTAssertTrue(controller.setValue(100, controlIdentifier: SystemMediaController.outputMuteID))
        XCTAssertTrue(controller.setValue(28, controlIdentifier: SystemMediaController.outputVolumeID))
        XCTAssertEqual(audio.levels[1], 0.28)
        XCTAssertEqual(audio.nativeMutes[1], false)
    }

    func testNativeMuteWorksWithoutAdjustableVolume() {
        let audio = AudioFixture()
        audio.levels.removeAll()
        audio.nativeMutes = [1: false, 2: false]
        let controller = audio.controller()
        XCTAssertNil(controller.values()[SystemMediaController.outputVolumeID])
        XCTAssertNil(controller.values()[SystemMediaController.inputVolumeID])
        for (control, device) in [(SystemMediaController.outputMuteID, AudioDeviceID(1)),
                                  (SystemMediaController.inputMuteID, AudioDeviceID(2))] {
            XCTAssertEqual(controller.values()[control], 0)
            XCTAssertTrue(controller.setValue(100, controlIdentifier: control))
            XCTAssertEqual(audio.nativeMutes[device], true)
            XCTAssertEqual(controller.values()[control], 100)
            XCTAssertTrue(controller.setValue(0, controlIdentifier: control))
            XCTAssertEqual(audio.nativeMutes[device], false)
        }
        XCTAssertEqual(audio.writes, 0)
        audio.nativeMutes.removeAll()
        XCTAssertTrue(controller.values().isEmpty)
        XCTAssertFalse(controller.setValue(100, controlIdentifier: SystemMediaController.inputMuteID))
    }

}
