import XCTest
@testable import Companion

final class MacSessionLockMonitorTests: XCTestCase {
    @MainActor
    private final class Snapshot {
        var locked: Bool? = true
    }

    @MainActor
    func testInitialLockUnlockAndUnavailableSnapshot() {
        let snapshot = Snapshot()
        var changes: [Bool] = []
        let monitor = MacSessionLockMonitor(readLock: { snapshot.locked })
        monitor.onChange = { changes.append($0) }
        XCTAssertTrue(monitor.refresh())
        XCTAssertTrue(monitor.refresh())
        snapshot.locked = nil
        XCTAssertTrue(monitor.refresh())
        snapshot.locked = false
        XCTAssertFalse(monitor.refresh())
        XCTAssertEqual(changes, [true, false])
    }
}
