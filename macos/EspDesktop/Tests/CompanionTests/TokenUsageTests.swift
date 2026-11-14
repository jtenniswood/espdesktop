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

    func testClaudeBackgroundUsageUsesOnlyTheAllModelsWeek() throws {
        let output = """
        Current session: 25% used · resets Dec 31 at 11pm (Europe/London)
        Current week (all models): 59% used · resets Jan 2 at 4:30pm (Europe/London)
        Current week (Fable): 91% used · resets Jan 2 at 4:30pm (Europe/London)
        """
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2025-12-31T18:00:00Z"))
        let reading = try XCTUnwrap(TokenUsage.parseClaude(claudeUsageReply(output), observedAt: now))
        XCTAssertEqual(reading.remainingPercent, 41)
        XCTAssertEqual(reading.resetsAt, 1_767_371_400)
    }

    func testClaudeIgnoresModelSpecificLimitsAndRejectsModelOutput() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2025-08-10T18:00:00Z"))
        let limit = "Current week (all models): 100% used, resets Aug 13, 7:59am (Asia/Seoul)"
        let reading = try XCTUnwrap(TokenUsage.parseClaude(claudeUsageReply(limit), observedAt: now))
        XCTAssertEqual(reading.remainingPercent, 0)
        XCTAssertNil(TokenUsage.parseClaude(try claudeUsageReply(limit, turns: 1), observedAt: now))
        let modelLimit = limit.replacingOccurrences(of: "all models", with: "Fable")
        XCTAssertNil(TokenUsage.parseClaude(try claudeUsageReply(modelLimit), observedAt: now))
        XCTAssertNil(TokenUsage.parseClaude(try claudeUsageReply("Total cost: $0.0000"), observedAt: now))
    }

    private func claudeUsageReply(_ result: String, turns: Int = 0) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "result": result, "num_turns": turns, "is_error": false, "local_command": "usage",
        ])
    }

    func testWeeklyReadingExpiresAfterFifteenMinutesOrAtReset() {
        let reading = WeeklyUsageReading(remainingPercent: 41, resetsAt: 2_000, observedAt: 1_000)
        XCTAssertTrue(reading.isCurrent(at: Date(timeIntervalSince1970: 1_899)))
        XCTAssertFalse(reading.isCurrent(at: Date(timeIntervalSince1970: 1_900)))

        let resetting = WeeklyUsageReading(remainingPercent: 41, resetsAt: 1_100, observedAt: 1_000)
        XCTAssertFalse(resetting.isCurrent(at: Date(timeIntervalSince1970: 1_100)))
    }

    func testOpenCodeGoReadsOnlyTheWeeklyPercentage() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2025-08-10T18:00:00Z"))
        let output = #"{"usage":{"rolling":{"percent":75},"weekly":{"percent":1,"resetsAt":"2025-08-13T07:59:23.880Z"},"monthly":{"percent":93}}}"#
        let reading = try XCTUnwrap(TokenUsage.parseOpenCodeGo(Data(output.utf8), observedAt: now))
        XCTAssertEqual(reading.remainingPercent, 99)
        XCTAssertEqual(reading.resetsAt, 1_755_071_963)
        XCTAssertNil(TokenUsage.parseOpenCodeGo(Data(#"{"usage":{"rolling":{"percent":75}}}"#.utf8), observedAt: now))
        let expired = output.replacingOccurrences(of: "2025-08-13", with: "2025-08-09")
        XCTAssertNil(TokenUsage.parseOpenCodeGo(Data(expired.utf8), observedAt: now))
    }

    func testOpenCodeGoUsesOnlyTheSavedGoProviderKey() {
        let setup = #"{"opencode":{"type":"api","key":"zen-only"},"opencode-go":{"type":"api","key":"go-key"},"other":42}"#
        XCTAssertEqual(TokenUsage.openCodeGoKey(from: Data(setup.utf8)), "go-key")
        let zenOnly = #"{"opencode":{"type":"api","key":"zen-only"}}"#
        XCTAssertNil(TokenUsage.openCodeGoKey(from: Data(zenOnly.utf8)))
    }

    func testEnterpriseSpendSumsFractionalCentsBeforeRounding() throws {
        let first = #"{"data":[{"cost":{"amount":"100.250000","currency":"USD"}}],"data_refreshed_at":"2025-06-15T12:00:00Z","has_more":true,"next_page":"next"}"#
        let last = #"{"data":[{"cost":{"amount":"23.250000","currency":"USD"}}],"data_refreshed_at":"2025-06-15T12:00:00Z","has_more":false}"#
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        let reading = try XCTUnwrap(TokenUsage.parseEnterpriseSpend([Data(first.utf8), Data(last.utf8)], observedAt: now))
        XCTAssertEqual(reading.cents, 124)
        XCTAssertEqual(reading.formatted, "$1.24")
        XCTAssertNil(TokenUsage.parseEnterpriseSpend([Data(first.utf8)], observedAt: now))
    }

    func testEnterpriseSpendDistinguishesZeroFromInvalidData() {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        let empty = #"{"data":[],"data_refreshed_at":"2025-06-15T12:00:00Z","has_more":false}"#
        XCTAssertEqual(TokenUsage.parseEnterpriseSpend([Data(empty.utf8)], observedAt: now)?.formatted, "$0.00")
        let noExport = #"{"data":[],"data_refreshed_at":null,"has_more":false}"#
        XCTAssertNil(TokenUsage.parseEnterpriseSpend([Data(noExport.utf8)], observedAt: now))
        let invalid = #"{"data":[{"cost":{"amount":"190","currency":"GBP"}}],"data_refreshed_at":"2025-06-15T12:00:00Z","has_more":false}"#
        XCTAssertNil(TokenUsage.parseEnterpriseSpend([Data(invalid.utf8)], observedAt: now))
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
