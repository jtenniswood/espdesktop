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

    func testAntigravityUsesOnlyTheGeminiWeeklyBucket() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-08-10T00:00:00Z"))
        let report = #"""
        {"status":"SUCCESS","num_turns":0,"command":{"name":"usage","data":{"groups":[
            {"buckets":[{"id":"3p-weekly","window":"weekly","remaining_fraction":0.04}]},
            {"buckets":[
                {"id":"gemini-5h","window":"5h","remaining_fraction":0.25},
                {"id":"gemini-weekly","window":"weekly","remaining_fraction":0.61,
                 "reset_time":"2026-08-13T12:00:00.000Z"}
            ]}
        ]}}}
        """#
        let reading = try XCTUnwrap(TokenUsage.parseAntigravity(Data(report.utf8), observedAt: now))
        XCTAssertEqual(reading.remainingPercent, 61)
        XCTAssertEqual(reading.resetsAt, UInt32(now.timeIntervalSince1970) + 84 * 3600)
        for (original, replacement) in [("gemini-weekly", "gemini-argon-wtu-weekly"), ("SUCCESS", "ERROR"),
                                        (#""num_turns":0"#, #""num_turns":1"#), ("0.61", "1.5")] {
            let invalid = report.replacingOccurrences(of: original, with: replacement)
            XCTAssertNil(TokenUsage.parseAntigravity(Data(invalid.utf8), observedAt: now))
        }
    }

    func testAntigravityShowsRemainingQuotaWhenNoResetIsAvailable() throws {
        let report = #"""
        {"status":"SUCCESS","num_turns":0,"command":{"name":"usage","data":{"groups":[
            {"buckets":[{"id":"gemini-weekly","window":"weekly","remaining_fraction":1.0}]}
        ]}}}
        """#
        let reading = try XCTUnwrap(TokenUsage.parseAntigravity(Data(report.utf8)))
        XCTAssertEqual(reading.remainingPercent, 100)
        XCTAssertNil(reading.resetsAt)
        let disabled = report.replacingOccurrences(of: #""remaining_fraction":1.0"#,
                                                   with: #""remaining_fraction":1.0,"disabled":true"#)
        XCTAssertNil(TokenUsage.parseAntigravity(Data(disabled.utf8)))
    }

    func testCursorChoosesSharedWeeklyAllowanceOverOldMonthlyUsage() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-08-10T00:00:00Z"))
        let monthly = Data(#"{"billingCycleEnd":"2026-09-01T00:00:00Z","individualUsage":{"plan":{"totalPercentUsed":0.36,"used":73,"limit":100}}}"#.utf8)
        let weekly = Data(#"{"isUnified":true,"usagePercent":59,"nextResetTimestampUtc":"2026-08-13T00:00:00.000Z"}"#.utf8)
        let reading = try XCTUnwrap(TokenUsage.parseCursor(monthly: monthly, weekly: weekly, observedAt: now))
        XCTAssertEqual(reading.remainingPercent, 41)
        XCTAssertEqual(reading.resetsAt, UInt32(now.timeIntervalSince1970) + 3 * 86400)

        let separate = Data(#"{"isUnified":false,"usagePercent":99,"nextResetTimestampUtc":"2026-08-13T00:00:00Z"}"#.utf8)
        let monthlyReading = TokenUsage.parseCursor(monthly: monthly, weekly: separate, observedAt: now)
        XCTAssertEqual(monthlyReading?.remainingPercent, 100, "0.36 is a percentage, not a fraction")
        let missingWeekly = Data(#"{"isUnified":true,"usagePercent":59}"#.utf8)
        XCTAssertNil(TokenUsage.parseCursor(monthly: monthly, weekly: missingWeekly, observedAt: now))
    }

    func testCursorDoesNotInventAnAllowanceFromSpendOrExpiredData() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-08-10T00:00:00Z"))
        func summary(reset: String, plan: String) -> Data {
            Data("""
            {"billingCycleEnd":"\(reset)","individualUsage":{"plan":\(plan),"onDemand":{"used":1800}}}
            """.utf8)
        }
        let reset = "2026-09-01T00:00:00Z"
        XCTAssertEqual(TokenUsage.parseCursor(monthly: summary(reset: reset, plan: #"{"used":350,"limit":1000}"#),
                                               weekly: nil, observedAt: now)?.remainingPercent, 65)
        XCTAssertNil(TokenUsage.parseCursor(monthly: summary(reset: reset, plan: #"{"used":350,"limit":0}"#),
                                            weekly: nil, observedAt: now))
        XCTAssertNil(TokenUsage.parseCursor(monthly: summary(reset: "2026-08-01T00:00:00Z", plan: #"{"totalPercentUsed":30}"#),
                                            weekly: nil, observedAt: now))
    }

    func testCursorCookieUsesTheCliAccountAndRejectsAnExpiredOrMalformedLogin() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        func token(subject: String, expiration: Int) throws -> String {
            let identity = try JSONSerialization.data(withJSONObject: ["sub": subject, "exp": expiration])
            let payload = identity.base64EncodedString().replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            return "header.\(payload).signature"
        }
        let login = try token(subject: "auth0|user_example", expiration: 1_800_000_600)
        func auth(_ token: String) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["accessToken": token])
        }
        XCTAssertEqual(TokenUsage.cursorSessionCookie(from: try auth(login), now: now),
                       "WorkosCursorSessionToken=user_example%3A%3A\(login)")
        let expired = try token(subject: "user_example", expiration: 1_799_999_999)
        let malformed = try token(subject: "user_example;other=value", expiration: 1_800_000_600)
        XCTAssertNil(TokenUsage.cursorSessionCookie(from: try auth(expired), now: now))
        XCTAssertNil(TokenUsage.cursorSessionCookie(from: try auth(malformed), now: now))
    }

    func testOpenCodeGoReadsWeeklyAndMonthlyPercentUsed() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2025-08-10T18:00:00Z"))
        let output = #"{"usage":{"rolling":{"percent":75},"weekly":{"percent":1,"resetsAt":"2025-08-13T07:59:23.880Z"},"monthly":{"percent":93,"resetsAt":"2025-09-01T00:00:00Z"}}}"#
        let reading = try XCTUnwrap(TokenUsage.parseOpenCodeGo(Data(output.utf8), observedAt: now))
        XCTAssertEqual(reading.weekly?.remainingPercent, 99)
        XCTAssertEqual(reading.weekly?.resetsAt, 1_755_071_963)
        XCTAssertEqual(reading.monthly?.remainingPercent, 7)
        XCTAssertNotEqual(reading.weekly?.resetsAt, reading.monthly?.resetsAt)
        XCTAssertNil(TokenUsage.parseOpenCodeGo(Data(#"{"usage":{"rolling":{"percent":75}}}"#.utf8), observedAt: now))
        let expired = output.replacingOccurrences(of: "2025-08-13", with: "2025-08-09")
        let monthlyOnly = try XCTUnwrap(TokenUsage.parseOpenCodeGo(Data(expired.utf8), observedAt: now))
        XCTAssertNil(monthlyOnly.weekly)
        XCTAssertEqual(monthlyOnly.monthly?.remainingPercent, 7)
    }

    func testOpenCodeGoUsesOnlyTheSavedGoProviderKey() {
        let setup = #"{"opencode":{"type":"api","key":"zen-only"},"opencode-go":{"type":"api","key":"go-key"},"other":42}"#
        XCTAssertEqual(TokenUsage.openCodeGoKey(from: Data(setup.utf8)), "go-key")
        let zenOnly = #"{"opencode":{"type":"api","key":"zen-only"}}"#
        XCTAssertNil(TokenUsage.openCodeGoKey(from: Data(zenOnly.utf8)))
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


private actor AllowanceReadProbe {
    private var called: Set<AllowanceProvider> = []

    func read(_ provider: AllowanceProvider) async -> AllowanceResult {
        called.insert(provider)
        if provider == .cursor {
            try? await Task.sleep(for: .seconds(30))
            return .unavailable
        }
        return .readings([AllowanceReading(remainingPercent: 41, resetsAt: nil, observedAt: 1750000000)])
    }

    func providers() -> Set<AllowanceProvider> { called }
}

extension TokenUsageTests {
    @MainActor
    func testRequestedProvidersRefreshIndependently() async throws {
        let probe = AllowanceReadProbe()
        let codexUpdated = expectation(description: "Codex refreshed despite stalled Cursor")
        let refresh = AllowanceRefresh(read: { await probe.read($0) }) { codexUpdated.fulfill() }
        refresh.request([.codex, .cursor])
        defer { refresh.request([]) }

        await fulfillment(of: [codexUpdated], timeout: 2)
        for _ in 0..<100 {
            if await probe.providers().contains(.cursor) { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let called = await probe.providers()
        XCTAssertEqual(called, [.codex, .cursor])
        XCTAssertEqual(refresh.readings[.codex]?.first?.remainingPercent, 41)
        XCTAssertNil(refresh.readings[.cursor])
    }
}
