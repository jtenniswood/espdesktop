import XCTest
@testable import Companion

final class CompanionPairingInputTests: XCTestCase {
    func testPastedCodeAcceptsLowercaseAndSurroundingWhitespace() {
        XCTAssertTrue(CompanionPairingInput.isValid(host: " display.local ", code: " abcdEFgh\n"))
        XCTAssertEqual(CompanionPairingInput.normalizedCode(" abcdEFgh\n"), "ABCD-EFGH")
        XCTAssertEqual(CompanionPairingInput.normalizedCode(" abcd-efgh\n"), "ABCD-EFGH")
        XCTAssertTrue(CompanionPairingInput.isValid(host: "display.local", code: "ABCD-EFGH"))
    }

    func testDiscoveredEndpointAndSmartDashCanPair() {
        for host in ["display.local:8443", "display.local:9443", "192.168.6.100:8443", "wss://display.local:8443", "[fd00::1]:8443"] {
            for dash in ["-", "‐", "‑", "–", "—", "−"] {
                let code = "ABCD" + dash + "EFGH"
                XCTAssertTrue(CompanionPairingInput.isValid(host: host, code: code), host)
                XCTAssertEqual(CompanionPairingInput.normalizedCode(code), "ABCD-EFGH")
            }
        }
        let discovered = DiscoveredDisplay(id: String(repeating: "a", count: 64), name: "Desk", hostname: "desk.local", port: 9443)
        XCTAssertTrue(CompanionPairingInput.isValid(host: discovered.endpoint, code: "ABCD–EFGH"))
    }

    func testPairingStillRejectsPublicOrMalformedEndpoints() {
        for host in ["example.com:8443", "https://example.com", "display.local:0", "display.local:65536", "display.local:invalid", "wss://user@display.local:8443", "ftp://display.local", ""] {
            XCTAssertFalse(CompanionPairingInput.isValid(host: host, code: "ABCD-EFGH"), host)
        }
        for code in ["ABCD––EFGH", "ABC–DEFGH", "ABCD EFGH", "ÄBCD–EFGH"] {
            XCTAssertNil(CompanionPairingInput.normalizedCode(code))
        }
    }

    func testIncompleteOrNonASCIIInputCannotSubmitPairing() {
        for code in ["", "ABC", "ABCDEFGHI", "ABCD1234", "ABCD EFG", "ÄBCDEFGH", "ßabcdef", "ABC-DEFGH", "ABCD--EFGH"] {
            XCTAssertFalse(CompanionPairingInput.isValid(host: "192.168.1.20", code: code), code)
        }
        XCTAssertFalse(CompanionPairingInput.isValid(host: " \n", code: "ABCDEFGH"))
    }
}
