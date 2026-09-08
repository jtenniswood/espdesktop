import Foundation
import LocalAuthentication
import Security

enum KeychainStore {
    static let service = "io.espdesktop.app"
    // Keychain service names are persistent data identifiers. This remains as
    // a compatibility key so existing pairings survive the product rename.
    private static let previousService = "io.espcontrol.companion"

    // A pairing credential may be protected by an ACL that requires the user
    // to approve access. Keep this context alive for each Security operation
    // so macOS can present that prompt when the app needs the credential.
    private static func authenticationContext() -> LAContext {
        let context = LAContext()
        context.localizedReason = "access your saved display pairing"
        context.interactionNotAllowed = false
        return context
    }

    static func load(service: String, account: String) -> Data? {
        if let data = loadExact(service: service, account: account) { return data }
        guard service == self.service,
              let data = loadExact(service: previousService, account: account) else { return nil }
        _ = save(data, service: service, account: account)
        return data
    }

    private static func loadExact(service: String, account: String) -> Data? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        query[kSecUseAuthenticationContext as String] = authenticationContext()
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    @discardableResult
    static func save(_ data: Data, service: String, account: String) -> Bool {
        var identity: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        identity[kSecUseAuthenticationContext as String] = authenticationContext()
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(identity as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return true }
        guard updateStatus == errSecItemNotFound else { return false }
        var item = identity
        update.forEach { item[$0.key] = $0.value }
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    static func remove(service: String, account: String) {
        removeExact(service: service, account: account)
        if service == self.service {
            removeExact(service: previousService, account: account)
        }
    }

    private static func removeExact(service: String, account: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
    }

    static func accounts(service: String) -> [String] {
        var result = Set(accountsExact(service: service))
        if service == self.service {
            result.formUnion(accountsExact(service: previousService))
        }
        return result.sorted()
    }

    private static func accountsExact(service: String) -> [String] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
        ]
        var items: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &items) == errSecSuccess,
              let attributes = items as? [[String: Any]] else { return [] }
        return attributes.compactMap { $0[kSecAttrAccount as String] as? String }
    }
}
