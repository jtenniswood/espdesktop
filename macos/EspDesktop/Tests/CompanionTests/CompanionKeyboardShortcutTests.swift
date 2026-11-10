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

    func testClaudeScopedShortcutsUseTheDocumentedKeys() throws {
        let expected: [(String, CGKeyCode, CGEventFlags)] = [
            ("f6", 97, []), ("shift+f6", 97, [.maskShift]), ("claude-escape", 53, []),
            ("escape-twice", 53, []), ("up", 126, []), ("down", 125, []), ("1", 18, []), ("9", 25, []),
        ]
        for (keys, keyCode, flags) in expected {
            XCTAssertTrue(CompanionKeyboardShortcut.isClaudeScopedShortcut(keys))
            let shortcut = try XCTUnwrap(CompanionKeyboardShortcut(actionIdentifier: "shortcut." + keys))
            XCTAssertEqual(shortcut.keyCode, keyCode)
            XCTAssertEqual(shortcut.flags, flags)
        }
        for keys in ["0", "a", "enter", "escape-thrice", "shift+f7", "command++f6"] {
            XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: "shortcut." + keys), keys)
        }
    }

    func testSafariUnmodifiedKeysAndApplicationScope() throws {
        let expected: [(String, CGKeyCode)] = [("tab", 48), ("escape", 53)]
        for (keys, keyCode) in expected {
            let shortcut = try XCTUnwrap(CompanionKeyboardShortcut(actionIdentifier: "shortcut." + keys))
            XCTAssertEqual(shortcut.keyCode, keyCode)
            XCTAssertTrue(shortcut.flags.isEmpty)
        }
        for keys in ["enter", "a", "shift+tab", "+tab", "command++tab"] {
            XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: "shortcut." + keys), keys)
        }
        XCTAssertTrue(CompanionKeyboardShortcut.isSafariApplication("com.apple.Safari"))
        XCTAssertTrue(CompanionKeyboardShortcut.isSafariApplication(
            "com.apple.Safari.WebApp.01234567-89AB-CDEF-0123-456789abcdef"
        ))
        XCTAssertFalse(CompanionKeyboardShortcut.isSafariApplication("com.apple.Safari.WebApp"))
        XCTAssertFalse(CompanionKeyboardShortcut.isSafariApplication("com.apple.Safari.WebApp.invalid"))
        XCTAssertFalse(CompanionKeyboardShortcut.isSafariApplication("com.apple.finder"))
    }

    func testInstalledWebAppShortcutRequiresTheExactApprovedInstallation() throws {
        let athena = "com.apple.Safari.WebApp." + UUID().uuidString
        let otherInstallation = "com.apple.Safari.WebApp." + UUID().uuidString
        let action = "shortcut.@\(athena):control+command+n"
        let approved: Set<String> = [athena, otherInstallation, "com.apple.Safari"]
        XCTAssertNotNil(CompanionKeyboardShortcut.installedWebAppShortcut(
            action, frontmostBundleIdentifier: athena, approvedBundleIdentifiers: approved))
        for frontmost in [otherInstallation, "com.apple.Safari", "com.example.Other"] {
            XCTAssertNil(CompanionKeyboardShortcut.installedWebAppShortcut(
                action, frontmostBundleIdentifier: frontmost, approvedBundleIdentifiers: approved))
        }
        XCTAssertNil(CompanionKeyboardShortcut.installedWebAppShortcut(
            action, frontmostBundleIdentifier: athena, approvedBundleIdentifiers: [otherInstallation]))
        XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: action))
    }

    func testBooksExtendedShortcutsReplayOnlyTheirExactKeys() throws {
        let expected: [(String, CGKeyCode, CGEventFlags)] = [
            ("left", 123, []), ("right", 124, []), ("space", 49, []),
            ("function+f", 3, [.maskSecondaryFn]),
        ]
        for (keys, keyCode, flags) in expected {
            let shortcut = try XCTUnwrap(CompanionKeyboardShortcut(actionIdentifier: "shortcut." + keys))
            XCTAssertEqual(shortcut.keyCode, keyCode)
            XCTAssertEqual(shortcut.flags, flags)
        }
        for keys in ["a", "shift+right", "function+g", "command++f", "+space"] {
            XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: "shortcut." + keys), keys)
        }
    }

    func testChatGPTClearUnreadsUsesShiftEscape() throws {
        let shortcut = try XCTUnwrap(CompanionKeyboardShortcut(actionIdentifier: "shortcut.shift+escape"))
        XCTAssertEqual(shortcut.keyCode, 53)
        XCTAssertEqual(shortcut.flags, [.maskShift])
        XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: "shortcut.shift+tab"))
    }

}
