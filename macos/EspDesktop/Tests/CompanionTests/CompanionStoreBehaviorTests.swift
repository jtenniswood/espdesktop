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

    func testWebAppActivationAllowsTheDefaultBrowserWhenTabFocusCannotBeRead() {
        XCTAssertTrue(CompanionStore.webAppActivationObserved(
            actionIdentifier: "webapp.google-docs",
            frontmostBundleIdentifier: "org.mozilla.firefox",
            expectedBrowserBundleIdentifier: "org.mozilla.firefox",
            focusedActionIdentifiers: ["org.mozilla.firefox"]
        ))
        XCTAssertFalse(CompanionStore.webAppActivationObserved(
            actionIdentifier: "webapp.google-docs",
            frontmostBundleIdentifier: "com.apple.finder",
            expectedBrowserBundleIdentifier: "org.mozilla.firefox",
            focusedActionIdentifiers: ["com.apple.finder"]
        ))
    }
}
