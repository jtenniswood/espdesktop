import Foundation

// The session owns transport state. Settings observe events and supply these
// replaceable ports; the transport never depends on SwiftUI or CompanionStore.
@MainActor
protocol CompanionSessionPreferences: AnyObject {
    var panelHost: String { get set }
    var pairingAccount: String { get }
    var hasSavedPairing: Bool { get }
    func stringPreference(forKey key: String) -> String?
    func integerPreference(forKey key: String) -> Int
    func setPreference(_ value: Any, forKey key: String)
    func removePreference(forKey key: String)
    func rememberPairingAccount(_ account: String)
}

@MainActor
protocol CompanionSessionResources: AnyObject {
    func folderActions() -> [ApprovedFolder]
    func launchableApps() -> [LaunchableApp]
    func focusedCompanionActionIdentifier() -> String
    func focusedCompanionActionIdentifiers() -> [String]
    func setCompanionFocusRegistrations(_ targets: [(id: String, url: URL)], webAppIDs: [String])
    func remoteCompanionCatalogues() -> RemoteCompanionCatalogues
    func configuredWebAppIDs() -> [String]
    func performResultStatus(actionIdentifier: String, folderOpenBehavior: String) async -> String
    func openURL(encodedURL: String, bundleIdentifier: String) async -> Bool
    func setMediaControlValue(_ value: Int, controlIdentifier: String) -> Bool
}

@MainActor
protocol CompanionSessionCredentials {
    func load(account: String) -> Data?
    func save(_ credential: Data, account: String) -> Bool
}

struct CompanionKeychainCredentials: CompanionSessionCredentials {
    func load(account: String) -> Data? {
        KeychainStore.load(service: KeychainStore.service, account: account)
    }
    func save(_ credential: Data, account: String) -> Bool {
        KeychainStore.save(credential, service: KeychainStore.service, account: account)
    }
}

enum CompanionSessionEvent {
    case connection(message: String, state: CompanionConnectionState, recovery: String?)
    case status(String)
    case capabilities(systemMetrics: Bool)
    case publishCurrentState
    case artworkRequested(UInt32)
}

@MainActor
extension CompanionSessionResources {
    func remoteCompanionCatalogues() -> RemoteCompanionCatalogues { .empty }
    func configuredWebAppIDs() -> [String] { [] }
    func focusedCompanionActionIdentifiers() -> [String] {
        let identifier = focusedCompanionActionIdentifier()
        return identifier.isEmpty ? [] : [identifier]
    }
    func setCompanionFocusRegistrations(_ targets: [(id: String, url: URL)], webAppIDs: [String]) {}
}
