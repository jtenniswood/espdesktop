import XCTest
@testable import Companion

final class CompanionFocusScriptTests: XCTestCase {
    @MainActor
    func testActivationWaitsForNewFrontmostApplicationBeforeQuerying() async {
        var checks = 0
        var confirmed: [String] = []
        let ready = await CompanionFocusQuery.waitForApplication {
            checks += 1
            return checks >= 3
        }
        if ready { confirmed = ["new.app"] }
        XCTAssertEqual(checks, 3)
        XCTAssertEqual(confirmed, ["new.app"])
    }

    @MainActor
    func testActivationWaitIsBoundedAndCancellationStopsIt() async {
        let start = ContinuousClock.now
        let ready = await CompanionFocusQuery.waitForApplication { false }
        XCTAssertFalse(ready)
        XCTAssertLessThan(start.duration(to: .now), .seconds(1))
        let pending = Task { await CompanionFocusQuery.waitForApplication { false } }
        await Task.yield()
        pending.cancel()
        let cancelled = await pending.value
        XCTAssertFalse(cancelled)
    }

    @MainActor
    func testRapidReturnToAppRepublishesDetailedFocus() {
        var publisher = CompanionApplicationFocusPublisher()
        var details: [[String]] = []
        publisher.publish("A") { _ in }
        publisher.publishDetails(["A"]) { details.append($0) }
        publisher.publish("B") { _ in }
        publisher.publish("A") { _ in }
        publisher.publishDetails(["A"]) { details.append($0) }
        publisher.publishDetails(["A"]) { details.append($0) }
        XCTAssertEqual(details, [["A"], ["A"]])
    }

    @MainActor
    func testApplicationHighlightPublishesWithoutWaitingForSlowDetails() async {
        let slowDetails = Task {
            await CompanionAppleScript.run("delay 10\nreturn \"old-folder\"", timeout: 0.5)
        }
        await Task.yield()
        var publisher = CompanionApplicationFocusPublisher()
        var sent: [String] = []
        let start = ContinuousClock.now
        publisher.publish("com.apple.finder") { sent.append($0) }
        publisher.publish("com.apple.TextEdit") { sent.append($0) }
        XCTAssertEqual(sent, ["com.apple.finder", "com.apple.TextEdit"])
        XCTAssertLessThan(start.duration(to: .now), .milliseconds(20))
        publisher.publish("com.apple.TextEdit") { sent.append($0) }
        XCTAssertEqual(sent.count, 2)
        publisher.publish("") { sent.append($0) }
        XCTAssertEqual(sent.last, "")
        publisher.reset()
        publisher.publish("") { sent.append($0) }
        XCTAssertEqual(sent.count, 4)
        let details = await slowDetails.value
        XCTAssertNil(details)
    }

    func testReadsScriptResult() async {
        let result = await CompanionAppleScript.run("return \"https://example.com/a?b=c\"")
        XCTAssertEqual(result, "https://example.com/a?b=c")
    }

    func testScriptFailureDoesNotProduceFocus() async {
        let result = await CompanionAppleScript.run("error \"unavailable\"")
        XCTAssertNil(result)
    }

    @MainActor
    func testSlowFocusQueryDoesNotBlockShortcutHandlingAndTimesOut() async {
        let query = Task { await CompanionAppleScript.run("delay 10\nreturn \"stale\"", timeout: 0.5) }
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

    @MainActor
    func testNewWindowIsRecognizedBeforeBackgroundPoll() async {
        var checks = 0
        let start = ContinuousClock.now
        let result = await CompanionFocusQuery.waitForVisibleWindow(
            isCurrentApplication: { true },
            hasVisibleWindow: {
                checks += 1
                return checks == 3
            }
        )
        XCTAssertTrue(result)
        XCTAssertEqual(checks, 3)
        XCTAssertLessThan(start.duration(to: .now), .seconds(1))
    }

    @MainActor
    func testWindowRetryStopsWhenAnotherAppBecomesCurrent() async {
        var current = true
        var checks = 0
        let result = await CompanionFocusQuery.waitForVisibleWindow(
            isCurrentApplication: { current },
            hasVisibleWindow: {
                checks += 1
                current = false
                return false
            }
        )
        XCTAssertFalse(result)
        XCTAssertEqual(checks, 1)
    }

    @MainActor
    func testWindowRetryIsBoundedForAppsWithoutWindows() async {
        var checks = 0
        let result = await CompanionFocusQuery.waitForVisibleWindow(
            isCurrentApplication: { true },
            hasVisibleWindow: { checks += 1; return false }
        )
        XCTAssertFalse(result)
        XCTAssertEqual(checks, 6)
    }

    @MainActor
    func testCancelledWindowQueryCannotReportFocus() async {
        let query = Task {
            await CompanionFocusQuery.waitForVisibleWindow(
                isCurrentApplication: { true },
                hasVisibleWindow: { false }
            )
        }
        await Task.yield()
        query.cancel()
        let result = await query.value
        XCTAssertFalse(result)
    }

}
