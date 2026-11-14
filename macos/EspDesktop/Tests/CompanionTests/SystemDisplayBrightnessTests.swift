import XCTest
@testable import Companion

final class SystemDisplayBrightnessTests: XCTestCase {
    @MainActor
    func testUnavailableOrInvalidBrightnessIsNotPublished() {
        XCTAssertNil(SystemDisplayBrightness(readBrightness: nil, writeBrightness: nil).value())
        let failed = SystemDisplayBrightness(readBrightness: { _, _ in -1 }, writeBrightness: { _, _ in 0 })
        XCTAssertNil(failed.value())
        XCTAssertFalse(failed.setValue(50))
        let invalid = SystemDisplayBrightness(readBrightness: { _, value in value.pointee = .nan; return 0 }, writeBrightness: { _, _ in 0 })
        XCTAssertNil(invalid.value())
    }

    @MainActor
    func testBrightnessConversionAndBounds() {
        let brightness = SystemDisplayBrightness(
            readBrightness: { _, value in value.pointee = 0.42; return 0 },
            writeBrightness: { _, value in (0...1).contains(value) ? 0 : -1 }
        )
        XCTAssertEqual(brightness.value(), 42)
        XCTAssertTrue(brightness.setValue(-50))
        XCTAssertTrue(brightness.setValue(150))
        let failed = SystemDisplayBrightness(readBrightness: { _, value in value.pointee = 0.5; return 0 }, writeBrightness: { _, _ in -1 })
        XCTAssertFalse(failed.setValue(70))
    }
}
