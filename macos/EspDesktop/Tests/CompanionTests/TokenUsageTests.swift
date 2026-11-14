import Foundation
import XCTest
@testable import Companion

final class TokenUsageTests: XCTestCase {
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
