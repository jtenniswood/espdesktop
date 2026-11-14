import Foundation

// The session owns transport state. Settings observe events and supply these
// replaceable ports; the transport never depends on SwiftUI or CompanionStore.
@MainActor
protocol CompanionSessionPreferences: AnyObject {
    var panelHost: String { get set }
    var pairingAccount: String { get }
    var hasSavedPairing: Bool { get }
    var newPairingAccount: String { get }
    func allowsPairing(certificateFingerprint: String) -> Bool
    func stringPreference(forKey key: String) -> String?
    func integerPreference(forKey key: String) -> Int
    func setPreference(_ value: Any, forKey key: String)
    func removePreference(forKey key: String)
    func rememberPairingAccount(_ account: String)
}

@MainActor
extension CompanionSessionPreferences {
    var newPairingAccount: String { panelHost }
    func allowsPairing(certificateFingerprint: String) -> Bool { true }
}

@MainActor
protocol CompanionSessionResources: AnyObject {
    var applicationCatalogueReady: Bool { get }
    func folderActions() -> [ApprovedFolder]
    func appleShortcutActions() -> [AppleShortcut]
    func launchableApps() -> [LaunchableApp]
    func appIconPixels(bundleIdentifier: String, pixelSide: Int) -> Data?
    func focusedCompanionActionIdentifier() async -> String
    func immediateFocusedApplicationIdentifier() -> String?
    func focusedCompanionActionIdentifiers(for targets: [(id: String, url: URL)]) async -> [String]
    func remoteCompanionCatalogues() -> RemoteCompanionCatalogues
    func performResultStatus(actionIdentifier: String, folderOpenBehavior: String, shortcutAppID: String?) async -> String
    func openURL(encodedURL: String, newWindow: Bool) async -> Bool
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
}

@MainActor
extension CompanionSessionResources {
    func immediateFocusedApplicationIdentifier() -> String? { nil }
    var applicationCatalogueReady: Bool { true }
    func appleShortcutActions() -> [AppleShortcut] { [] }
    func remoteCompanionCatalogues() -> RemoteCompanionCatalogues { .empty }
    func focusedCompanionActionIdentifiers(for targets: [(id: String, url: URL)]) async -> [String] {
        let identifier = await focusedCompanionActionIdentifier()
        return identifier.isEmpty ? [] : [identifier]
    }
}
