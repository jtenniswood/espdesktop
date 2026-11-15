import Foundation
import XCTest
@testable import Companion

final class HealthchecksServiceTests: XCTestCase {
    func testCheckDecodesReadOnlyIdentityAndStatus() throws {
        let check = try JSONDecoder().decode(HealthchecksCheck.self, from: Data("""
            {
                "unique_key": "0123456789abcdef0123456789abcdef01234567",
                "name": "Database backup",
                "slug": "database-backup",
                "status": "down",
                "started": true
            }
            """.utf8))
        XCTAssertEqual(check.id, "0123456789abcdef0123456789abcdef01234567")
        XCTAssertEqual(check.name, "Database backup")
        XCTAssertEqual(check.status, .down)
        XCTAssertTrue(check.started)
    }

    func testUnnamedCheckAndUnknownStatus() throws {
        let check = try JSONDecoder().decode(HealthchecksCheck.self, from: Data("""
            {
                "unique_key": "0123456789abcdef0123456789abcdef01234567",
                "name": "",
                "slug": "website",
                "status": "future-status"
            }
            """.utf8))
        XCTAssertEqual(check.name, "website")
        XCTAssertEqual(check.status, .unknown)
        XCTAssertFalse(check.started)
    }
}
