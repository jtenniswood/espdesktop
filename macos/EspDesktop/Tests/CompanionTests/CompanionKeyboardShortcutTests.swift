import XCTest
@testable import Companion

final class CompanionKeyboardShortcutTests: XCTestCase {

    @MainActor
    func testExplicitAccessRequestsAlwaysOpenSettings() {
        var prompts = 0
        var opens = 0
        var trusted = false
        let authorizer = CompanionAccessibilityAuthorizer(
            isProcessTrusted: { trusted },
            openSettings: { opens += 1 },
            requestPrompt: { prompts += 1 }
        )
        authorizer.requestAccess()
        authorizer.requestAccess()
        XCTAssertEqual(prompts, 1)
        XCTAssertEqual(opens, 2)
        trusted = true
        authorizer.requestAccess()
        XCTAssertEqual(prompts, 1)
        XCTAssertEqual(opens, 3)
        XCTAssertTrue(authorizer.hasAccess)
    }

    @MainActor
    func testAccessibilityPromptIsRequestedOnlyOnceWhileUntrusted() {
        var promptCount = 0
        let authorizer = CompanionAccessibilityAuthorizer(
            isProcessTrusted: { false },
            requestPrompt: { promptCount += 1 }
        )

        XCTAssertFalse(authorizer.isTrusted())
        XCTAssertFalse(authorizer.isTrusted())
        XCTAssertEqual(promptCount, 1)
    }

    @MainActor
    func testAccessibilityTrustDoesNotPrompt() {
        var promptCount = 0
        let authorizer = CompanionAccessibilityAuthorizer(
            isProcessTrusted: { true },
            requestPrompt: { promptCount += 1 }
        )

        XCTAssertTrue(authorizer.isTrusted())
        XCTAssertEqual(promptCount, 0)
    }

    @MainActor
    func testReadingPermissionStatusNeverPromptsAndReflectsChanges() {
        var trusted = false
        var promptCount = 0
        let authorizer = CompanionAccessibilityAuthorizer(
            isProcessTrusted: { trusted },
            requestPrompt: { promptCount += 1 }
        )
        XCTAssertFalse(authorizer.hasAccess)
        trusted = true
        XCTAssertTrue(authorizer.hasAccess)
        trusted = false
        XCTAssertFalse(authorizer.hasAccess)
        XCTAssertEqual(promptCount, 0)
    }

    func testRejectsLegacyWindowActionsAndFreeFormFn() {
        XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: "window.close"))
        XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: "window.left"))
        XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: "shortcut.fn+control+f"))
    }

}
