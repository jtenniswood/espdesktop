import Foundation
import XCTest
@testable import Companion

@MainActor
private final class DisplayMetricsFixture: SystemMetricsProviding {
    var onSnapshot: ((CompanionSystemMetricsSnapshot) -> Void)?
    var starts = 0
    var stops = 0

    func start() { starts += 1 }
    func stop() { stops += 1 }
}

@MainActor
private final class DisplayMediaFixture: MediaControlling {
    var readValues: () -> [String: Int] = { [:] }
    func values() -> [String: Int] { readValues() }
    func setValue(_ value: Int, controlIdentifier: String) -> Bool { false }
    var coughStarts = 0
    var coughContinuations = 0
    var coughEnds = 0
    func beginCoughMute() -> Bool { coughStarts += 1; return true }
    func continueCoughMute() -> Bool { coughContinuations += 1; return false }
    func endCoughMute() -> Bool { coughEnds += 1; return true }
    func unavailableVolumeIDs(values: [String: Int], previousValues: [String: Int], force: Bool) -> Set<String> { [] }
}

final class CompanionDisplayTests: XCTestCase {
    @MainActor
    func testDisplayCanSwitchTransportsWithoutReplacingPairingOrOtherDisplays() {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let office = CompanionDisplayRecord(host: "office.local", name: "Office", account: "office")
        let desk = CompanionDisplayRecord(host: "desk.local", name: "Desk", account: "desk")
        let saved = CompanionSavedDisplays(defaults: defaults)
        saved.save([office, desk])
        defaults.set("office-pin", forKey: "companion.certificateFingerprint.office")
        let store = CompanionStore(mediaController: DisplayMediaFixture(), systemMetricsProvider: DisplayMetricsFixture(),
                                   defaults: defaults)
        let display = store.displays[0]
        let port = "/dev/cu.wchusbserial20130"
        display.panelHost = CompanionUSBPort.endpoint(for: port)

        XCTAssertTrue(display.usesUSB)
        XCTAssertTrue(store.isUSBPortInUse(port))
        XCTAssertFalse(store.isUSBPortInUse(port, except: display))
        XCTAssertEqual(display.record.host, office.host)
        XCTAssertEqual(display.certificateFingerprint, "office-pin")
        XCTAssertEqual(saved.load { [] }.first?.usbPort, port)
        XCTAssertEqual(saved.load { [] }.last, desk)

        display.panelHost = "office-new.local"
        XCTAssertFalse(display.usesUSB)
        XCTAssertEqual(display.record.usbPort, port)
        XCTAssertEqual(display.id, office.id)
        XCTAssertEqual(display.pairingAccount, office.account)
        XCTAssertEqual(saved.load { [] }.first?.host, "office-new.local")
        XCTAssertEqual(saved.load { [] }.last, desk)
    }

    func testUSBRelayRecoversFramingAfterBootNoiseAndAnOversizedFrame() {
        let payload: [UInt8] = [1, 0xc0, 0xdb, 0, 3]
        let data = CompanionUSBBridge.Frame.data.encode(payload[...])
        let oversized = [UInt8(0xc0), 2] + [UInt8](repeating: 7, count: 1025) + [0xc0]
        let stream = Array("ESP-ROM:esp32s3".utf8) + oversized + data + CompanionUSBBridge.Frame.close.encode()
        var decoder = CompanionUSBBridge.Decoder()
        let frames = stream.compactMap { decoder.append($0) }
        XCTAssertEqual(frames.map(\.0), [.data, .close])
        XCTAssertEqual(Array(frames[0].1), payload)
        XCTAssertTrue(frames[1].1.isEmpty)
        XCTAssertNil(CompanionUSBPort.path(from: "usb:/dev/../anything"))
    }

    @MainActor
    func testCoughReleaseWaitsForAllHoldsAndLateRenewalCannotMuteAgain() {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let media = DisplayMediaFixture()
        let store = CompanionStore(mediaController: media, systemMetricsProvider: DisplayMetricsFixture(),
                                   defaults: defaults)
        let first = NSObject(), second = NSObject()
        let a = ObjectIdentifier(first), b = ObjectIdentifier(second)

        XCTAssertFalse(store.setCoughButtonValue(50, from: a))
        XCTAssertEqual(media.coughContinuations, 0)
        XCTAssertTrue(store.setCoughButtonValue(100, from: a))
        XCTAssertTrue(store.setCoughButtonValue(50, from: a))
        XCTAssertEqual(media.coughContinuations, 1)
        XCTAssertTrue(store.setCoughButtonValue(100, from: b))
        XCTAssertEqual(media.coughStarts, 1)
        XCTAssertTrue(store.setCoughButtonValue(0, from: a))
        XCTAssertEqual(media.coughEnds, 0)
        XCTAssertFalse(store.setCoughButtonValue(50, from: a))
        XCTAssertTrue(store.setCoughButtonValue(0, from: b))
        XCTAssertEqual(media.coughEnds, 1)
        XCTAssertFalse(store.setCoughButtonValue(50, from: b))
    }

    @MainActor
    func testCoughRechecksMicrophoneBeforeThePeriodicRefresh() async {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        CompanionSavedDisplays(defaults: defaults).save([
            CompanionDisplayRecord(host: "office.local", account: "office")
        ])
        let media = DisplayMediaFixture()
        let store = CompanionStore(mediaController: media, systemMetricsProvider: DisplayMetricsFixture(),
                                   defaults: defaults)
        let display = store.displays[0]
        display.connection.onEvent?(.connection(message: "Connected", state: .connected, recovery: nil))
        defer { store.setConnection(false, for: display) }
        let refreshed = expectation(description: "Reads the confirmed mute before the next regular snapshot")
        var reads = 0
        media.readValues = {
            reads += 1
            if reads == 2 { refreshed.fulfill() }
            return [SystemMediaController.coughID: reads > 1 ? 100 : 0]
        }

        XCTAssertTrue(store.setCoughButtonValue(100, from: ObjectIdentifier(display.connection)))
        XCTAssertEqual(reads, 1)
        await fulfillment(of: [refreshed], timeout: 0.75)
    }

    @MainActor
    func testPreparingAndCancellingRePairingKeepsTheExistingDisplay() {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let record = CompanionDisplayRecord(host: "office.local", name: "Office", account: "office")
        let saved = CompanionSavedDisplays(defaults: defaults)
        saved.save([record])
        defaults.set("office-pin", forKey: "companion.certificateFingerprint.office")
        let store = CompanionStore(mediaController: DisplayMediaFixture(), systemMetricsProvider: DisplayMetricsFixture(),
                                   defaults: defaults)
        let display = store.displays[0]
        XCTAssertFalse(store.prepareRePairing(display))
        display.connection.onEvent?(.connection(message: "Pairing reset", state: .needsPairing, recovery: nil))
        XCTAssertTrue(store.prepareRePairing(display))
        XCTAssertTrue(store.isRePairing)
        XCTAssertEqual(store.panelHost, record.host)
        XCTAssertEqual(store.panelDisplayName, record.name)
        store.resetPairing()
        XCTAssertFalse(store.isRePairing)
        XCTAssertEqual(display.state, .needsPairing)
        XCTAssertEqual(saved.load { [] }, [record])
        XCTAssertEqual(display.certificateFingerprint, "office-pin")
    }

    @MainActor
    func testUpgradeKeepsPairingAccountAndDoesNotRestoreForgottenDisplay() {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("office.local:8443", forKey: "panelHost")
        defaults.set("Office", forKey: "panelDisplayName")
        defaults.set("192.168.6.100", forKey: "pairingAccount")
        defaults.set("office-fingerprint", forKey: "companion.certificateFingerprint.192.168.6.100")
        defaults.set(17, forKey: "companion.authenticationSequence.192.168.6.100")

        let saved = CompanionSavedDisplays(defaults: defaults)
        let migrated = saved.load {
            XCTFail("A known legacy account should be kept even when Keychain is unavailable")
            return []
        }
        XCTAssertEqual(migrated.map(\.host), ["office.local:8443"])
        XCTAssertEqual(migrated.map(\.name), ["Office"])
        XCTAssertEqual(migrated.map(\.account), ["192.168.6.100"])
        XCTAssertEqual(saved.load { [] }, migrated)
        XCTAssertEqual(defaults.string(forKey: "companion.certificateFingerprint.192.168.6.100"), "office-fingerprint")
        XCTAssertEqual(defaults.integer(forKey: "companion.authenticationSequence.192.168.6.100"), 17)

        saved.save([])
        XCTAssertTrue(saved.load { ["192.168.6.100"] }.isEmpty)
    }

    @MainActor
    func testLegacyMigrationCanRetryWhenKeychainIsInitiallyUnavailable() {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("office.local", forKey: "panelHost")
        let saved = CompanionSavedDisplays(defaults: defaults)
        XCTAssertTrue(saved.load { [] }.isEmpty)
        XCTAssertEqual(saved.load { ["office.local"] }.map(\.account), ["office.local"])
    }

    @MainActor
    func testLegacyOBSPasswordDoesNotCreateAPairedDisplay() {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let saved = CompanionSavedDisplays(defaults: defaults)
        XCTAssertTrue(saved.load { [OBSConnection.legacyCredentialAccount] }.isEmpty)
        XCTAssertEqual(saved.load {
            [OBSConnection.legacyCredentialAccount, "studio.local"]
        }.map(\.account), ["studio.local"])

        let display = CompanionDisplayRecord(host: "studio.local", account: "studio.local")
        saved.save([display, CompanionDisplayRecord(account: OBSConnection.legacyCredentialAccount)])
        XCTAssertEqual(saved.load { [] }, [display])
    }

    @MainActor
    func testDisplayFailureDoesNotStopMetricsForOtherDisplay() {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let saved = CompanionSavedDisplays(defaults: defaults)
        saved.save([
            CompanionDisplayRecord(host: "office.local", account: "office", connectAtLaunch: true),
            CompanionDisplayRecord(host: "desk.local", account: "desk", connectAtLaunch: true),
        ])
        defaults.set("office-pin", forKey: "companion.certificateFingerprint.office")
        defaults.set("desk-pin", forKey: "companion.certificateFingerprint.desk")
        let metrics = DisplayMetricsFixture()
        let store = CompanionStore(mediaController: DisplayMediaFixture(), systemMetricsProvider: metrics,
                                   defaults: defaults)
        let first = store.displays[0]
        let second = store.displays[1]
        XCTAssertFalse(first.allowsPairing(certificateFingerprint: "desk-pin"))
        XCTAssertFalse(second.allowsPairing(certificateFingerprint: "office-pin"))
        XCTAssertTrue(second.allowsPairing(certificateFingerprint: "new-pin"))
        XCTAssertTrue(store.isSavedDisplay(fingerprint: "desk-pin"))

        first.connection.onEvent?(.connection(message: "Connected", state: .connected, recovery: nil))
        first.connection.onEvent?(.capabilities(systemMetrics: true))
        second.connection.onEvent?(.connection(message: "Connected", state: .connected, recovery: nil))
        second.connection.onEvent?(.capabilities(systemMetrics: true))
        XCTAssertEqual(store.connectedDisplayCount, 2)
        XCTAssertEqual(metrics.starts, 1)

        second.connection.onEvent?(.connection(message: "Lost connection", state: .reconnecting, recovery: nil))
        XCTAssertEqual(store.connectedDisplayCount, 1)
        XCTAssertEqual(first.state, .connected)
        XCTAssertEqual(metrics.stops, 0)

        store.setConnection(false, for: second)
        XCTAssertEqual(saved.load { [] }.map(\.connectAtLaunch), [true, false])
        store.setConnection(false, for: first)
        XCTAssertEqual(store.connectedDisplayCount, 0)
        XCTAssertEqual(metrics.stops, 1)
    }

    @MainActor
    func testForgettingDisplayPreservesOtherActivePairing() async {
        let suite = "CompanionDisplayTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let saved = CompanionSavedDisplays(defaults: defaults)
        let first = CompanionDisplayRecord(host: "office.local", account: "\(suite).office")
        let second = CompanionDisplayRecord(host: "desk.local", account: "\(suite).desk")
        saved.save([first, second])
        let firstPin = "companion.certificateFingerprint.\(first.account)"
        let secondPin = "companion.certificateFingerprint.\(second.account)"
        let secondSequence = "companion.authenticationSequence.\(second.account)"
        defaults.set("office-pin", forKey: firstPin)
        defaults.set("desk-pin", forKey: secondPin)
        defaults.set(9, forKey: secondSequence)

        let metrics = DisplayMetricsFixture()
        let store = CompanionStore(mediaController: DisplayMediaFixture(), systemMetricsProvider: metrics,
                                   defaults: defaults)
        for display in store.displays {
            display.connection.onEvent?(.connection(message: "Connected", state: .connected, recovery: nil))
            display.connection.onEvent?(.capabilities(systemMetrics: true))
        }
        XCTAssertEqual(store.connectedDisplayCount, 2)
        XCTAssertEqual(metrics.starts, 1)

        await store.forgetDisplay(store.displays[1])

        XCTAssertEqual(store.connectedDisplayCount, 1)
        XCTAssertEqual(store.displays.map(\.state), [.connected])
        XCTAssertEqual(metrics.stops, 0)
        XCTAssertEqual(saved.load { [second.account] }, [first])
        XCTAssertEqual(defaults.string(forKey: firstPin), "office-pin")
        XCTAssertNil(defaults.object(forKey: secondPin))
        XCTAssertNil(defaults.object(forKey: secondSequence))
        store.setConnection(false, for: store.displays[0])
    }
}
