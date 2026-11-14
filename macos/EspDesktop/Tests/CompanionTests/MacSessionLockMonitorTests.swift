import XCTest
@testable import Companion

final class MacSessionLockMonitorTests: XCTestCase {
    @MainActor
    private final class Snapshot {
        var locked: Bool? = true
        var displayAwake: Bool? = true
    }

    @MainActor
    func testInitialLockUnlockAndUnavailableSnapshot() {
        let snapshot = Snapshot()
        var lockChanges: [Bool] = []
        var displayChanges: [Bool?] = []
        let monitor = MacSessionLockMonitor(
            readLock: { snapshot.locked },
            readDisplayAwake: { snapshot.displayAwake }
        )
        monitor.onChange = { locked, displayAwake in
            lockChanges.append(locked)
            displayChanges.append(displayAwake)
        }
        XCTAssertTrue(monitor.refresh())
        XCTAssertTrue(monitor.refresh())
        snapshot.displayAwake = false
        XCTAssertTrue(monitor.refresh())
        snapshot.locked = nil
        snapshot.displayAwake = nil
        XCTAssertTrue(monitor.refresh())
        XCTAssertEqual(monitor.displayAwake, false)
        snapshot.displayAwake = true
        XCTAssertTrue(monitor.refresh())
        snapshot.locked = false
        XCTAssertFalse(monitor.refresh())
        XCTAssertNil(monitor.displayAwake)
        XCTAssertEqual(lockChanges, [true, true, true, false])
        XCTAssertEqual(displayChanges, [true, false, true, nil])
    }
}
