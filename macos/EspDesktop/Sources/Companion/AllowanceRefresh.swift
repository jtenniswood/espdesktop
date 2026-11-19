import Foundation

enum AllowanceResult: Sendable {
    case readings([AllowanceReading])
    case signInRequired
    case unsupported
    case unavailable

    var retryDelay: Duration {
        switch self {
        case .readings, .unsupported: .seconds(300)
        case .signInRequired, .unavailable: .seconds(60)
        }
    }
}

extension AllowanceProvider {
    func read() async -> AllowanceResult {
        switch self {
        case .codex:
            return await TokenUsage.readCodex().map { .readings([$0]) } ?? .unavailable
        case .claude:
            let (account, reading) = await TokenUsage.readClaude()
            if let reading { return .readings([reading]) }
            switch account {
            case .missingCLI, .signedOut: return .signInRequired
            case .apiKey, .otherProvider: return .unsupported
            case .checking, .detected, .unknown: return .unavailable
            }
        case .openCodeGo:
            let (status, usage) = await TokenUsage.readOpenCodeGo()
            if let usage { return .readings([usage.weekly, usage.monthly].compactMap { $0 }) }
            switch status {
            case .missingLogin, .rejected: return .signInRequired
            case .noSubscription: return .unsupported
            case .checking, .unavailable, .available: return .unavailable
            }
        case .cursor:
            return await TokenUsage.readCursor().map { .readings([$0]) } ?? .unavailable
        case .antigravity:
            return await TokenUsage.readAntigravity().map { .readings([$0]) } ?? .unavailable
        }
    }
}

@MainActor
final class AllowanceRefresh {
    private let read: @Sendable (AllowanceProvider) async -> AllowanceResult
    private let changed: @MainActor () -> Void
    private var workers: [AllowanceProvider: Task<Void, Never>] = [:]
    private var requested: Set<AllowanceProvider> = []
    private(set) var readings: [AllowanceProvider: [AllowanceReading]] = [:]

    init(read: @escaping @Sendable (AllowanceProvider) async -> AllowanceResult = { await $0.read() },
         changed: @escaping @MainActor () -> Void) {
        self.read = read
        self.changed = changed
    }

    func request(_ providers: Set<AllowanceProvider>) {
        requested = providers
        for provider in workers.keys where !providers.contains(provider) {
            workers[provider]?.cancel()
        }
        for provider in providers where workers[provider] == nil { start(provider) }
    }

    private func start(_ provider: AllowanceProvider) {
        workers[provider] = Task { [weak self, read] in
            while !Task.isCancelled {
                let result = await read(provider)
                guard !Task.isCancelled else { break }
                self?.accept(result, from: provider)
                try? await Task.sleep(for: result.retryDelay)
            }
            self?.finished(provider)
        }
    }

    private func accept(_ result: AllowanceResult, from provider: AllowanceProvider) {
        let previous = readings[provider]
        switch result {
        case .readings(let values): readings[provider] = values
        case .signInRequired, .unsupported: readings[provider] = nil
        case .unavailable: break
        }
        if previous != readings[provider] { changed() }
    }

    private func finished(_ provider: AllowanceProvider) {
        workers[provider] = nil
        if requested.contains(provider) { start(provider) }
    }
}
