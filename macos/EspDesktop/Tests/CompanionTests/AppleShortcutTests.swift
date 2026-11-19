import XCTest
@testable import Companion

final class AppleShortcutTests: XCTestCase {
    @MainActor
    func testAllShortcutsAreAllowedByDefaultAndCustomSelectionPersists() {
        let suite = "AppleShortcutTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let selected = AppleShortcut(id: UUID(), name: "Open Project")
        let otherID = UUID()
        let store = makeStore(defaults: defaults)

        XCTAssertTrue(store.allAppleShortcutsApproved)
        XCTAssertTrue(store.appleShortcutIsApproved(selected.id))
        XCTAssertTrue(store.appleShortcutIsApproved(otherID))

        store.setAllAppleShortcuts(approved: false)
        XCTAssertFalse(store.appleShortcutIsApproved(selected.id))
        store.setAppleShortcut(selected, approved: true)
        XCTAssertTrue(store.appleShortcutIsApproved(selected.id))
        XCTAssertFalse(store.appleShortcutIsApproved(otherID))

        store.setAllAppleShortcuts(approved: true)
        let reopenedStore = makeStore(defaults: defaults)
        XCTAssertTrue(reopenedStore.allAppleShortcutsApproved)
        XCTAssertTrue(reopenedStore.appleShortcutIsApproved(otherID))

        reopenedStore.setAllAppleShortcuts(approved: false)
        let customStore = makeStore(defaults: defaults)
        XCTAssertFalse(customStore.allAppleShortcutsApproved)
        XCTAssertTrue(customStore.appleShortcutIsApproved(selected.id))
        XCTAssertFalse(customStore.appleShortcutIsApproved(otherID))
    }

    @MainActor
    func testExistingCustomShortcutApprovalsArePreserved() {
        let suite = "AppleShortcutTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let approvedID = UUID()
        defaults.set([approvedID.uuidString], forKey: "approvedAppleShortcuts")
        let store = makeStore(defaults: defaults)

        XCTAssertFalse(store.allAppleShortcutsApproved)
        XCTAssertTrue(store.appleShortcutIsApproved(approvedID))
        XCTAssertFalse(store.appleShortcutIsApproved(UUID()))
    }

    @MainActor
    private func makeStore(defaults: UserDefaults) -> CompanionStore {
        CompanionStore(
            mediaController: SystemMediaController(),
            systemMetricsProvider: SystemMetricsProvider(),
            defaults: defaults
        )
    }

    func testCatalogueKeepsDistinctIdentifiersAndParsesNamesWithParentheses() {
        let shortcuts = AppleShortcut.parseCatalogue("""
        Open Project (Design) (727ED9BF-DE97-42ED-B661-8967497B122C)
        Open Project (Design) (74E95DC0-0244-410F-B466-07AA47B8F1E5)
        Duplicate row (727ED9BF-DE97-42ED-B661-8967497B122C)
        Invalid row (not-a-uuid)
        """)
        XCTAssertEqual(shortcuts.map(\.name), Array(repeating: "Open Project (Design)", count: 2))
        XCTAssertEqual(Set(shortcuts.map(\.id)).count, 2)
        for shortcut in shortcuts {
            XCTAssertEqual(AppleShortcut.identifier(from: shortcut.actionIdentifier), shortcut.id)
        }
        XCTAssertNil(AppleShortcut.identifier(from: "appleshortcut.not-a-uuid"))
    }
}
