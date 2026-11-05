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

    @MainActor
    func testAppSwitchDuringQueryRetriesInsteadOfPublishingEmptyFocus() async {
        var currentApplication: pid_t? = 1
        var queries = 0
        let result = await CompanionFocusQuery.readStable(
            currentApplication: { currentApplication },
            query: {
                queries += 1
                if queries == 1 {
                    await Task.yield()
                    currentApplication = 2
                    // The browser/Finder reader rejects its obsolete result.
                    return []
                }
                return ["com.apple.TextEdit"]
            }
        )
        XCTAssertEqual(queries, 2)
        XCTAssertEqual(result, ["com.apple.TextEdit"])
    }

}
