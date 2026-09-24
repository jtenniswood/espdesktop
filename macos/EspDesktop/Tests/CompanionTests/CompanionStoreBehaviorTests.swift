import XCTest
@testable import Companion

final class CompanionStoreBehaviorTests: XCTestCase {
    func testWebAppOpenDoesNotReportActivationBeforeBrowserFocusIsObserved() {
        XCTAssertEqual(
            CompanionStore.actionResultStatus(actionIdentifier: "webapp.google-docs", performed: true),
            "performed"
        )
        XCTAssertEqual(
            CompanionStore.actionResultStatus(actionIdentifier: "com.apple.Safari", performed: true),
            "activated"
        )
    }
}
