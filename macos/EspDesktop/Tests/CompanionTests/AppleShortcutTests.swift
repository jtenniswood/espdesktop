import XCTest
@testable import Companion

final class AppleShortcutTests: XCTestCase {
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
