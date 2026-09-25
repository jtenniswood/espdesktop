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

    func testWebAppActivationRequiresTheRequestedTabToBeFocused() {
        XCTAssertTrue(CompanionStore.webAppActivationObserved(
            actionIdentifier: "webapp.google-docs",
            focusedActionIdentifiers: ["org.mozilla.firefox", "webapp.google-docs"]
        ))
        XCTAssertFalse(CompanionStore.webAppActivationObserved(
            actionIdentifier: "webapp.google-docs",
            focusedActionIdentifiers: ["org.mozilla.firefox"]
        ))
    }
}
