import XCTest
@testable import Companion

final class PairingCodeEntryTests: XCTestCase {
    func testTypingAndDeletionPreservePositions() {
        var entry = PairingCodeEntry()
        XCTAssertEqual(entry.replace(at: 0, with: "a"), 1)
        XCTAssertEqual(entry.replace(at: 1, with: "b"), 2)
        XCTAssertEqual(entry.replace(at: 0, with: ""), 0)
        XCTAssertEqual(entry.letters[0], "")
        XCTAssertEqual(entry.letters[1], "B")
        XCTAssertNil(CompanionPairingInput.normalizedCode(entry.code))
    }

    func testFullCodePasteFromAnyBox() {
        for index in 0..<8 {
            for code in ["abcdefgh", "ABCD-EFGH", "abcd–efgh", " ABCD-EFGH\n"] {
                var entry = PairingCodeEntry()
                XCTAssertEqual(entry.replace(at: index, with: code), 7)
                XCTAssertEqual(entry.code, "ABCDEFGH")
                XCTAssertEqual(CompanionPairingInput.normalizedCode(entry.code), "ABCD-EFGH")
            }
        }
    }

    func testShortCodePasteAndIncompleteFallbackEntry() {
        var short = PairingCodeEntry(letterCount: 4)
        XCTAssertEqual(short.replace(at: 3, with: " abcd\n"), 3)
        XCTAssertEqual(short.letters.count, 4)
        XCTAssertEqual(short.code, "ABCD")

        var fallback = PairingCodeEntry(letterCount: nil)
        _ = fallback.replace(at: 0, with: "ABCDEFGH")
        for index in 2...5 { _ = fallback.replace(at: index, with: "") }
        XCTAssertEqual(fallback.code, "")
        _ = fallback.replace(at: 0, with: "abcd")
        XCTAssertEqual(fallback.code, "ABCD")
        XCTAssertTrue(fallback.letters.suffix(4).allSatisfy(\.isEmpty))
    }

    func testInvalidPasteDoesNotAlterCode() {
        var entry = PairingCodeEntry()
        _ = entry.replace(at: 0, with: "ABCD-EFGH")
        for invalid in ["1234", "ABCD!EFGH", "Ä", "ABCDEFGHI"] {
            _ = entry.replace(at: 0, with: invalid)
            XCTAssertEqual(entry.code, "ABCDEFGH")
        }
        _ = entry.replace(at: 7, with: "ab")
        XCTAssertEqual(entry.code, "ABCDEFGH")
    }
}
