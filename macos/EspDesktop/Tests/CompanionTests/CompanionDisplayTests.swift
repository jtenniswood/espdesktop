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
    func values() -> [String: Int] { [:] }
    func setValue(_ value: Int, controlIdentifier: String) -> Bool { false }
    func unavailableVolumeIDs(values: [String: Int], previousValues: [String: Int], force: Bool) -> Set<String> { [] }
}

final class CompanionDisplayTests: XCTestCase {
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
