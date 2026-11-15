import Foundation

enum UsageProvider: String, CaseIterable, Identifiable, Sendable {
    case synthetic, openCodeGo = "opencode-go", openRouter = "openrouter", deepSeek = "deepseek"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .synthetic: "Synthetic"
        case .openCodeGo: "OpenCode Go"
        case .openRouter: "OpenRouter"
        case .deepSeek: "DeepSeek"
        }
    }

    var keyURL: URL {
        switch self {
        case .synthetic: URL(string: "https://synthetic.new/")!
        case .openCodeGo: URL(string: "https://opencode.ai/console")!
        case .openRouter: URL(string: "https://openrouter.ai/settings/keys")!
        case .deepSeek: URL(string: "https://platform.deepseek.com/api_keys")!
        }
    }

    private var usageURL: URL? {
        switch self {
        case .synthetic: URL(string: "https://api.synthetic.new/v2/quotas")!
        case .openCodeGo: nil
        case .openRouter: URL(string: "https://openrouter.ai/api/v1/key")!
        case .deepSeek: URL(string: "https://api.deepseek.com/user/balance")!
        }
    }

    enum Failure: Error, Equatable {
        case invalidKey, rejected, noUsage, unavailable
    }

    enum Reading: Equatable, Sendable {
        case card(ProviderCardReading)
        case openCodeGo(TokenUsage.OpenCodeGoUsage)
    }

    static func normalizedKey(_ input: String) -> String? {
        let key = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...4096).contains(key.utf8.count),
              key.utf8.allSatisfy({ (33...126).contains($0) }) else { return nil }
        return key
    }

    func fetch(key: String) async throws -> Reading {
        guard let key = Self.normalizedKey(key) else { throw Failure.invalidKey }
        guard let url = usageURL else {
            let (status, reading) = await TokenUsage.fetchOpenCodeGo(token: key, workspace: nil)
            if let reading { return .openCodeGo(reading) }
            switch status {
            case .rejected: throw Failure.rejected
            case .noSubscription: throw Failure.noUsage
            default: throw Failure.unavailable
            }
        }

        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.urlCredentialStorage = nil
        config.timeoutIntervalForResource = 15
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url, timeoutInterval: 12)
        request.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Stream with a size cap. Never surface the response body in errors or logs.
        let (stream, response) = try await session.bytes(for: request, delegate: TokenUsage.RejectUsageRedirects())
        guard let status = (response as? HTTPURLResponse)?.statusCode else { throw Failure.unavailable }
        if status == 401 || status == 403 { throw Failure.rejected }
        guard status == 200 else { throw Failure.unavailable }
        var data = Data()
        for try await byte in stream {
            guard data.count < 128 * 1024 else { throw Failure.unavailable }
            data.append(byte)
        }
        return .card(try parse(data))
    }

    func parse(_ data: Data, now: Date = .now) throws -> ProviderCardReading {
        let time = now.timeIntervalSince1970
        guard (1...Double(UInt32.max)).contains(time) else { throw Failure.noUsage }
        let observedAt = UInt32(time)
        let decoder = JSONDecoder()
        switch self {
        case .synthetic:
            let quota = try decoder.decode(SyntheticQuota.self, from: data).subscription
            guard let quota, quota.limit.isFinite, quota.limit > 0,
                  quota.requests.isFinite, quota.requests >= 0 else { throw Failure.noUsage }
            let remaining = (1 - min(1, quota.requests / quota.limit)) * 100
            let reset = quota.renewsAt.flatMap { value -> UInt32? in
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions.insert(.withFractionalSeconds)
                var date = formatter.date(from: value)
                if date == nil {
                    formatter.formatOptions.remove(.withFractionalSeconds)
                    date = formatter.date(from: value)
                }
                guard let timestamp = date?.timeIntervalSince1970,
                      timestamp.rounded(.down) > Double(observedAt),
                      timestamp <= Double(UInt32.max) else { return nil }
                return UInt32(timestamp)
            }
            return .init(metric: .percentLeft, unit: .percent, amountMinor: Int((remaining * 100).rounded()),
                         observedAt: observedAt, resetsAt: reset)
        case .openRouter:
            let key = try decoder.decode(OpenRouterKey.self, from: data).data
            if key.isManagementKey == true || key.isProvisioningKey == true { throw Failure.invalidKey }
            if let remaining = key.limitRemaining {
                return try .money(.keyBudget, unit: .usd, amount: remaining, observedAt: observedAt)
            }
            guard let usage = key.usage, usage >= 0 else { throw Failure.noUsage }
            return try .money(.keySpend, unit: .usd, amount: usage, observedAt: observedAt)
        case .deepSeek:
            let balances = try decoder.decode(DeepSeekBalances.self, from: data).balanceInfos
            // Keep currencies separate. Prefer USD if the account reports both.
            for unit in [ProviderCardReading.Unit.usd, .cny] {
                if let balance = balances.first(where: { $0.currency == unit.rawValue }),
                   let amount = Double(balance.totalBalance) {
                    return try .money(.balance, unit: unit, amount: amount, observedAt: observedAt)
                }
            }
            throw Failure.noUsage
        case .openCodeGo:
            throw Failure.noUsage
        }
    }

    private struct SyntheticQuota: Decodable {
        struct Subscription: Decodable {
            let limit: Double
            let requests: Double
            let renewsAt: String?
        }
        let subscription: Subscription?
    }

    private struct OpenRouterKey: Decodable {
        struct Info: Decodable {
            let limitRemaining: Double?
            let usage: Double?
            let isManagementKey: Bool?
            let isProvisioningKey: Bool?

            enum CodingKeys: String, CodingKey {
                case usage
                case limitRemaining = "limit_remaining"
                case isManagementKey = "is_management_key"
                case isProvisioningKey = "is_provisioning_key"
            }
        }
        let data: Info
    }

    private struct DeepSeekBalances: Decodable {
        struct Balance: Decodable {
            let currency: String
            let totalBalance: String

            enum CodingKeys: String, CodingKey {
                case currency
                case totalBalance = "total_balance"
            }
        }
        let balanceInfos: [Balance]

        enum CodingKeys: String, CodingKey { case balanceInfos = "balance_infos" }
    }
}

struct ProviderCardReading: Equatable, Sendable {
    enum Metric: String, Sendable {
        case balance
        case keySpend = "key_spend"
        case keyBudget = "key_budget"
        case percentLeft = "percent_left"
    }
    enum Unit: String, Sendable { case usd = "USD", cny = "CNY", percent }

    let metric: Metric
    let unit: Unit
    let amountMinor: Int
    let observedAt: UInt32
    let resetsAt: UInt32?

    static func money(_ metric: Metric, unit: Unit, amount: Double, observedAt: UInt32) throws -> Self {
        let minor = (amount * 100).rounded()
        guard (-1_000_000_000...1_000_000_000).contains(minor) else { throw UsageProvider.Failure.noUsage }
        return .init(metric: metric, unit: unit, amountMinor: Int(minor), observedAt: observedAt, resetsAt: nil)
    }

    func wireValue(service: UsageProvider) -> [String: Any] {
        ["service": service.rawValue, "metric": metric.rawValue, "unit": unit.rawValue,
         "amountMinor": amountMinor, "observedAt": observedAt, "resetsAt": resetsAt ?? 0]
    }
}
