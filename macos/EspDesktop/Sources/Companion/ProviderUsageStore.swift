import Foundation
import LocalAuthentication
import Security
import SwiftUI

/// Separate from pairing credentials. The Login Keychain's default app ACL
/// restricts access to EspDesktop's signing identity.
enum ProviderKeychain {
    private static let service = "io.espdesktop.app.usage-provider"

    private static func query(_ provider: UsageProvider) -> [String: Any] {
        let context = LAContext()
        context.interactionNotAllowed = true
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: provider.rawValue,
            kSecUseAuthenticationContext as String: context,
        ]
    }

    static func load(_ provider: UsageProvider) -> (OSStatus, String?) {
        var request = query(provider)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        let key = (result as? Data).flatMap { String(data: $0, encoding: .utf8) }
        return (status, key)
    }

    static func save(_ key: String, for provider: UsageProvider) -> Bool {
        let match = query(provider)
        let update = [kSecValueData as String: Data(key.utf8)]
        let status = SecItemUpdate(match as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var item = match
        item[kSecValueData as String] = Data(key.utf8)
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    static func remove(_ provider: UsageProvider) -> Bool {
        let status = SecItemDelete(query(provider) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

@MainActor
final class ProviderUsageStore: ObservableObject {
    enum Status {
        case checking, connected, saved, rejected, unavailable, keychainUnavailable

        var label: String {
            switch self {
            case .checking: "Checking…"
            case .connected: "Connected"
            case .saved: "Key saved"
            case .rejected: "Key rejected"
            case .unavailable: "Usage unavailable"
            case .keychainUnavailable: "Keychain unavailable"
            }
        }
    }

    @Published private(set) var statuses: [UsageProvider: Status] = [:]
    private(set) var readings: [UsageProvider: UsageProvider.Reading] = [:]
    var onChange: (() -> Void)?

    // Remember intent separately from Keychain availability so a locked Keychain
    // never changes which OpenCode account is shown.
    private let defaults: UserDefaults
    private let configuredKey = "usageProviders.configured"
    private var configured: Set<UsageProvider>
    private var revisions: [UsageProvider: Int] = [:]
    private var nextRefresh = Date.distantPast
    private var refreshTask: Task<Void, Never>?
    private var refreshGeneration = 0

    init(defaults: UserDefaults) {
        self.defaults = defaults
        configured = Set((defaults.stringArray(forKey: configuredKey) ?? []).compactMap(UsageProvider.init(rawValue:)))
        statuses = Dictionary(uniqueKeysWithValues: configured.map { ($0, .saved) })
    }

    func hasConfiguredKey(_ provider: UsageProvider) -> Bool { configured.contains(provider) }

    private func saveConfigured() {
        defaults.set(configured.map(\.rawValue).sorted(), forKey: configuredKey)
    }

    func connect(_ provider: UsageProvider, input: String) async -> String? {
        guard let key = UsageProvider.normalizedKey(input) else { return "Enter a valid API key." }
        let revision = advance(provider)
        let previous = statuses[provider]
        statuses[provider] = .checking
        do {
            let reading = try await provider.fetch(key: key)
            guard revisions[provider] == revision, !Task.isCancelled else {
                if revisions[provider] == revision { statuses[provider] = previous }
                return "Connection cancelled."
            }
            guard ProviderKeychain.save(key, for: provider) else {
                statuses[provider] = previous
                return "EspDesktop could not save the key. Unlock your login Keychain and try again."
            }
            configured.insert(provider)
            saveConfigured()
            readings[provider] = reading
            statuses[provider] = .connected
            onChange?()
            return nil
        } catch {
            if revisions[provider] == revision { statuses[provider] = previous }
            switch error as? UsageProvider.Failure {
            case .rejected: return "The provider rejected this key."
            case .invalidKey: return "Use a personal API key for this provider."
            case .noUsage: return "This account did not return usage data."
            default: return "Could not read usage. Try again in a moment."
            }
        }
    }

    func remove(_ provider: UsageProvider) -> Bool {
        guard ProviderKeychain.remove(provider) else { return false }
        _ = advance(provider)
        configured.remove(provider)
        saveConfigured()
        statuses[provider] = nil
        readings[provider] = nil
        onChange?()
        return true
    }

    func test(_ provider: UsageProvider) async {
        guard configured.contains(provider), statuses[provider] != .checking else { return }
        let revision = advance(provider)
        await refresh(provider, revision: revision)
    }

    func pause() {
        refreshGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        nextRefresh = .distantPast
    }

    func refreshIfNeeded() {
        guard !configured.isEmpty, refreshTask == nil, Date() >= nextRefresh else { return }
        nextRefresh = Date().addingTimeInterval(300)
        refreshGeneration += 1
        let generation = refreshGeneration
        let pending = configured.filter { statuses[$0] != .checking }.map { ($0, advance($0)) }
        refreshTask = Task { [weak self] in
            await withTaskGroup(of: Void.self) { group in
                for (provider, revision) in pending {
                    group.addTask { [weak self] in
                        await self?.refresh(provider, revision: revision)
                    }
                }
            }
            if let self, self.refreshGeneration == generation { self.refreshTask = nil }
        }
    }

    private func advance(_ provider: UsageProvider) -> Int {
        revisions[provider, default: 0] += 1
        return revisions[provider]!
    }

    private func refresh(_ provider: UsageProvider, revision: Int) async {
        guard !Task.isCancelled, revisions[provider] == revision else { return }
        let (status, key) = ProviderKeychain.load(provider)
        var result: UsageProvider.Reading?
        let nextStatus: Status
        if status == errSecSuccess, let key {
            do {
                result = try await provider.fetch(key: key)
                nextStatus = .connected
            } catch UsageProvider.Failure.rejected {
                nextStatus = .rejected
            } catch {
                nextStatus = .unavailable
            }
        } else {
            nextStatus = status == errSecItemNotFound ? .unavailable : .keychainUnavailable
        }
        guard !Task.isCancelled, revisions[provider] == revision else { return }
        statuses[provider] = nextStatus
        readings[provider] = result
        onChange?()
    }
}
