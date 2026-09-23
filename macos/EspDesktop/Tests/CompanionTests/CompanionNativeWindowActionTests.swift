import XCTest
@testable import Companion

final class CompanionNativeWindowActionTests: XCTestCase {
    func testSplitViewMenuPathsUseLocalizedTitlesAndKeepEnglishFallbacks() {
        let paths = [
            ["Window", "Full Screen Tile", "Left of Screen"],
            ["Window", "Full-Screen Tile", "Left of Screen"],
        ]
        let translations = [
            "Window": "Fenster",
            "Full Screen Tile": "Vollbildkachel",
            "Full-Screen Tile": "Vollbildkachel",
            "Left of Screen": "Links vom Bildschirm",
        ]

        XCTAssertEqual(
            CompanionNativeWindowAction.localizedMenuPaths(paths, translations: translations),
            [
                ["Fenster", "Vollbildkachel", "Links vom Bildschirm"],
                ["Fenster", "Vollbildkachel", "Links vom Bildschirm"],
                ["Window", "Full Screen Tile", "Left of Screen"],
                ["Window", "Full-Screen Tile", "Left of Screen"],
            ]
        )
    }
}
