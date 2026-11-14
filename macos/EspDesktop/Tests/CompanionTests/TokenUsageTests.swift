import Foundation
import XCTest
@testable import Companion

final class TokenUsageTests: XCTestCase {
    func testClaudeAccountDistinguishesSubscriptionFromAPIKey() {
        XCTAssertEqual(TokenUsage.ClaudeAccount.from(loggedIn: true, method: "claude.ai"), .detected)
        XCTAssertEqual(TokenUsage.ClaudeAccount.from(loggedIn: true, method: "api_key"), .apiKey)
        XCTAssertEqual(TokenUsage.ClaudeAccount.from(loggedIn: true, method: "api_key_helper"), .apiKey)
        XCTAssertEqual(TokenUsage.ClaudeAccount.from(loggedIn: true, method: "third_party"), .otherProvider)
        XCTAssertEqual(TokenUsage.ClaudeAccount.from(loggedIn: false, method: "none"), .signedOut)
    }

    func testWeeklyReadingExpiresAfterFifteenMinutesOrAtReset() {
        let reading = WeeklyUsageReading(remainingPercent: 41, resetsAt: 2_000, observedAt: 1_000)
        XCTAssertTrue(reading.isCurrent(at: Date(timeIntervalSince1970: 1_899)))
        XCTAssertFalse(reading.isCurrent(at: Date(timeIntervalSince1970: 1_900)))

        let resetting = WeeklyUsageReading(remainingPercent: 41, resetsAt: 1_100, observedAt: 1_000)
        XCTAssertFalse(resetting.isCurrent(at: Date(timeIntervalSince1970: 1_100)))
    }

    func testReadsOnlyTheWeeklyCodexLimit() throws {
        let snapshot = #"{"id":2,"result":{"rateLimits":{"limitId":"codex","primary":{"usedPercent":10,"windowDurationMins":300,"resetsAt":1700003600},"secondary":{"usedPercent":59,"windowDurationMins":10080,"resetsAt":1700172800}}}}"#
        let reading = try XCTUnwrap(TokenUsage.parseCodex(Data(snapshot.utf8), observedAt: 1_700_000_000))
        XCTAssertEqual(reading.remainingPercent, 41)
        XCTAssertEqual(reading.resetsAt, 1_700_172_800)
    }

    func testMissingWeeklyLimitIsUnavailable() {
        let snapshot = #"{"id":2,"result":{"rateLimits":{"limitId":"codex","primary":{"usedPercent":10,"windowDurationMins":300,"resetsAt":1700003600}}}}"#
        XCTAssertNil(TokenUsage.parseCodex(Data(snapshot.utf8), observedAt: 1_700_000_000))
    }

    func testPrefersCanonicalCodexBucketWhenOtherBucketsExist() throws {
        let snapshot = #"{"id":2,"result":{"rateLimits":{"limitId":"codex_other","secondary":{"usedPercent":95,"windowDurationMins":10080,"resetsAt":1700172800}},"rateLimitsByLimitId":{"codex":{"limitId":"codex","secondary":{"usedPercent":0,"windowDurationMins":10080,"resetsAt":1700172800}}}}}"#
        let reading = try XCTUnwrap(TokenUsage.parseCodex(Data(snapshot.utf8), observedAt: 1_700_000_000))
        XCTAssertEqual(reading.remainingPercent, 100)
    }
}
