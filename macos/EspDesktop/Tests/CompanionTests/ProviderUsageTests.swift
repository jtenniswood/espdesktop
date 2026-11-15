import Foundation
import XCTest
@testable import Companion

final class ProviderUsageTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    func testSyntheticConvertsProviderQuotaAndDoesNotInventReset() throws {
        let sample = Data(#"{"subscription":{"limit":100,"requests":59,"renewsAt":"2023-11-15T02:00:00.000Z"}}"#.utf8)
        let reading = try UsageProvider.synthetic.parse(sample, now: now)
        XCTAssertEqual(reading.metric, .percentLeft)
        XCTAssertEqual(reading.amountMinor, 4100)
        XCTAssertNotNil(reading.resetsAt)
        let absentReset = Data(#"{"subscription":{"limit":100,"requests":107}}"#.utf8)
        let exhausted = try UsageProvider.synthetic.parse(absentReset, now: now)
        XCTAssertEqual(exhausted.amountMinor, 0)
        XCTAssertNil(exhausted.resetsAt)
    }

    func testOpenRouterUsesTheConnectedKeysBudgetOrSpendAndRejectsManagementKeys() throws {
        let budget = Data(#"{"data":{"label":"Private key name","limit_remaining":12.40,"usage":6.11}}"#.utf8)
        let reading = try UsageProvider.openRouter.parse(budget, now: now)
        XCTAssertEqual(reading.metric, .keyBudget)
        XCTAssertEqual(reading.amountMinor, 1240)
        let wire = reading.wireValue(service: .openRouter)
        XCTAssertEqual(Set(wire.keys), ["service", "metric", "unit", "amountMinor", "observedAt", "resetsAt"])
        let spend = Data(#"{"data":{"limit_remaining":null,"usage":6.11}}"#.utf8)
        XCTAssertEqual(try UsageProvider.openRouter.parse(spend, now: now).metric, .keySpend)
        let management = Data(#"{"data":{"is_management_key":true,"usage":6.11}}"#.utf8)
        XCTAssertThrowsError(try UsageProvider.openRouter.parse(management, now: now))
    }

    func testDeepSeekBalanceKeepsSignAndCurrency() throws {
        let currencies = Data(#"{"balance_infos":[{"currency":"CNY","total_balance":"-1.05"}]}"#.utf8)
        let reading = try UsageProvider.deepSeek.parse(currencies, now: now)
        XCTAssertEqual(reading.metric, .balance)
        XCTAssertEqual(reading.unit, .cny)
        XCTAssertEqual(reading.amountMinor, -105)
        let unknown = Data(#"{"balance_infos":[{"currency":"EUR","total_balance":"2.00"}]}"#.utf8)
        XCTAssertThrowsError(try UsageProvider.deepSeek.parse(unknown, now: now))
    }

    func testKeyValidationAllowsPasteWhitespaceButRejectsHeaderInjection() {
        XCTAssertEqual(UsageProvider.normalizedKey(" key_example\n"), "key_example")
        XCTAssertNil(UsageProvider.normalizedKey("key\r\nAuthorization: bad"))
        XCTAssertNil(UsageProvider.normalizedKey(String(repeating: "x", count: 4097)))
    }
}
