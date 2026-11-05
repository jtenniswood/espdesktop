import XCTest
@testable import Companion

final class CompanionFocusScriptTests: XCTestCase {
    func testReadsScriptResult() async {
        let result = await CompanionFocusScript.read("return \"https://example.com/a?b=c\"")
        XCTAssertEqual(result, "https://example.com/a?b=c")
    }

    func testScriptFailureDoesNotProduceFocus() async {
        let result = await CompanionFocusScript.read("error \"unavailable\"")
        XCTAssertNil(result)
    }

    @MainActor
    func testSlowFocusQueryDoesNotBlockShortcutHandlingAndTimesOut() async {
        let query = Task { await CompanionFocusScript.read("delay 10\nreturn \"stale\"", timeout: 0.5) }
        let start = ContinuousClock.now
        try? await Task.sleep(for: .milliseconds(50))
        // This main-actor work must run while the focus query is still waiting.
        XCTAssertLessThan(start.duration(to: .now), .milliseconds(400))
        let result = await query.value
        XCTAssertNil(result)
        XCTAssertLessThan(start.duration(to: .now), .seconds(3))
    }
}
