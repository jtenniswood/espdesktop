import XCTest
@testable import Companion

final class CompanionNativeWindowActionTests: XCTestCase {
    struct Item {
        var title: String
        var enabled = true
        var children: [Item] = []
    }

    func resolve(_ paths: [[String]], _ roots: [Item]) -> Item? {
        CompanionNativeWindowAction.resolve(paths: paths, roots: roots,
            title: { $0.title }, children: { $0.children }, enabled: { $0.enabled })
    }

    func testLayoutIsScopedToWindowMenuAndIgnoresDisabledSectionHeading() {
        let roots = [Item(title: "Edit", children: [Item(title: "Quarters")]),
            Item(title: "Window", children: [Item(title: "Move & Resize", children: [
                Item(title: "Quarters", enabled: false), Item(title: "Quarters")])])]
        XCTAssertEqual(resolve([["Window", "Move & Resize", "Quarters"]], roots)?.title, "Quarters")
        XCTAssertNil(resolve([["Window", "Quarters"]], roots))
    }

    func testUnavailableOrAmbiguousCommandsFailClosed() {
        XCTAssertNil(resolve([["Window", "Left"]], [Item(title: "Window", children: [Item(title: "Left", enabled: false)])]))
        XCTAssertNil(resolve([["Window", "Left"]], [Item(title: "Window", children: [Item(title: "Left"), Item(title: "Left")])]))
        XCTAssertNil(resolve([["Window", "Left"]], [Item(title: "Window", enabled: false, children: [Item(title: "Left")])]))
        XCTAssertNil(resolve([["Window", "Left"]], []))
    }

    func testBritishEnglishMenuAliasesAndMissingActions() {
        let roots = [Item(title: "Window", children: [Item(title: "Centre"),
            Item(title: "Full-Screen Tile", children: [Item(title: "Left of Screen")])])]
        XCTAssertEqual(resolve(CompanionCapabilities.windowActions["window.center"]!.menuPaths, roots)?.title, "Centre")
        XCTAssertEqual(resolve(CompanionCapabilities.windowActions["window.split.left"]!.menuPaths, roots)?.title, "Left of Screen")
        XCTAssertNil(resolve(CompanionCapabilities.windowActions["window.top-left"]!.menuPaths, roots))
    }

    func testMenuOnlyActionsDoNotInventKeyboardShortcuts() {
        for id in ["window.top-left", "window.top-right", "window.bottom-left", "window.bottom-right", "window.arrange.quarters", "window.split.left", "window.split.right"] {
            XCTAssertNotNil(CompanionCapabilities.windowActions[id])
            XCTAssertFalse(CompanionCapabilities.windowActions[id]!.menuPaths.isEmpty)
            XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: id))
        }
    }
}
