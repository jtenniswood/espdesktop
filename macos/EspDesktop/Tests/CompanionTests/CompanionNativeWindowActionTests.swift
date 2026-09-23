import XCTest
@testable import Companion

final class CompanionNativeWindowActionTests: XCTestCase {
    @MainActor
    func testSplitViewMenuPathsIncludeOtherAppLanguagesAndEnglishFallbacks() {
        let paths = [
            ["Window", "Full Screen Tile", "Left of Screen"],
            ["Window", "Full-Screen Tile", "Left of Screen"],
        ]
        let translationsByLocalization = [
            "de": [
                "Window": "Fenster",
                "Full Screen Tile": "Vollbildkachel",
                "Full-Screen Tile": "Vollbildkachel",
                "Left of Screen": "Links vom Bildschirm",
            ],
            "fr": [
                "Window": "Fenêtre",
                "Full Screen Tile": "Occuper une moitié de l’écran",
                "Full-Screen Tile": "Occuper une moitié de l’écran",
                "Left of Screen": "Gauche de l’écran",
            ],
        ]

        let localizedPaths = CompanionNativeWindowAction.localizedMenuPaths(
            paths,
            translationsByLocalization: translationsByLocalization,
            preferredLocalizations: ["de"]
        )
        XCTAssertEqual(
            localizedPaths,
            [
                ["Fenster", "Vollbildkachel", "Links vom Bildschirm"],
                ["Fenêtre", "Occuper une moitié de l’écran", "Gauche de l’écran"],
                ["Window", "Full Screen Tile", "Left of Screen"],
                ["Window", "Full-Screen Tile", "Left of Screen"],
            ]
        )
    }
}
