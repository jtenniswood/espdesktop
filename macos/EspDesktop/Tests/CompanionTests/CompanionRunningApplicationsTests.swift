import XCTest
@testable import Companion

final class CompanionRunningApplicationsTests: XCTestCase {
    func testWholeAppProcessIsIndependentOfWindowsAndApprovalIsRespected() {
        let result = CompanionRunningApplications.identifiers(
            in: [("windowless.app", false), ("hidden.app", false),
                 ("quit.app", true), ("unapproved.app", false),
                 (nil, false), ("windowless.app", false)],
            approved: ["windowless.app", "hidden.app", "quit.app"]
        )
        XCTAssertEqual(result, ["hidden.app", "windowless.app"])
    }

    @MainActor
    func testLaunchAndQuitPublishButIdenticalReorderedSnapshotsDoNot() {
        var publisher = CompanionRunningApplicationsPublisher()
        var sent: [[String]] = []
        publisher.publish([]) { sent.append($0) }
        publisher.publish(["B", "A", "A"]) { sent.append($0) }
        publisher.publish(["A", "B"]) { sent.append($0) }
        publisher.publish(["B"]) { sent.append($0) }
        publisher.publish([]) { sent.append($0) }
        XCTAssertEqual(sent, [[], ["A", "B"], ["B"], []])
    }

    @MainActor
    func testReconnectResendsEvenAnEmptySnapshot() {
        var publisher = CompanionRunningApplicationsPublisher()
        var sent: [[String]] = []
        publisher.publish([]) { sent.append($0) }
        publisher.reset()
        publisher.publish([]) { sent.append($0) }
        XCTAssertEqual(sent, [[], []])
    }

    @MainActor
    func testRunningSnapshotFitsProtocolLimit() {
        var publisher = CompanionRunningApplicationsPublisher()
        var values: [String] = []
        publisher.publish((0..<140).map { "app.\($0)" }) { values = $0 }
        XCTAssertEqual(values.count, 128)
        XCTAssertEqual(values, values.sorted())
    }
}
