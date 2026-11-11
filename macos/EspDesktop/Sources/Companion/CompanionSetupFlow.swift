/// Pair first, then customize. A previously paired display opens Settings directly.
enum CompanionSetupRoute: Equatable {
    case settings, pairing, preferences

    static func resolve(completed: Bool, showingHelp: Bool, hasSavedPairing: Bool, pairingInProgress: Bool, pairingConnected: Bool = false) -> Self {
        if completed || showingHelp || (hasSavedPairing && !pairingInProgress) { return .settings }
        return hasSavedPairing && pairingConnected ? .preferences : .pairing
    }
}

struct CompanionPairingSelection: Equatable {
    let host: String
    let account: String

    static func restore(host: String?, account: String?, readKeychainAccounts: () -> [String]) -> Self {
        if let account, !account.isEmpty {
            return Self(host: host ?? account, account: account)
        }
        // Forgetting a display explicitly clears the host. Only recover legacy
        // Keychain entries when the user has not cleared their selection.
        guard host != "" else { return Self(host: "", account: "") }

        let accounts = readKeychainAccounts()
        let host = host ?? accounts.first ?? ""
        let account = accounts.contains(host) ? host : (accounts.count == 1 ? accounts[0] : "")
        return Self(host: host, account: account)
    }
}
