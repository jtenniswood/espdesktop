import XCTest
@testable import Companion

final class MacSessionLockMonitorTests: XCTestCase {
    @MainActor
    func testInitialLockUnlockAndUnavailableSnapshot() {
        var snapshot: Bool? = true
        var changes: [Bool] = []
        let monitor = MacSessionLockMonitor(readLock: { snapshot })
        monitor.onChange = { changes.append($0) }
        XCTAssertTrue(monitor.refresh())
        XCTAssertTrue(monitor.refresh())
        snapshot = nil
        XCTAssertTrue(monitor.refresh())
        snapshot = false
        XCTAssertFalse(monitor.refresh())
        XCTAssertEqual(changes, [true, false])
    }
}
