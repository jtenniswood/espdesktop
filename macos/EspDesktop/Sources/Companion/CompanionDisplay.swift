import Foundation

struct CompanionDisplayRecord: Codable, Equatable, Identifiable {
    let id: UUID
    var host: String
    var name: String
    var account: String
    var connectAtLaunch: Bool

    init(id: UUID = UUID(), host: String = "", name: String = "", account: String = "", connectAtLaunch: Bool = true) {
        self.id = id
        self.host = host
        self.name = name
        self.account = account
        self.connectAtLaunch = connectAtLaunch
    }
}

@MainActor
struct CompanionSavedDisplays {
    private static let key = "companion.savedDisplays"
    let defaults: UserDefaults

    func load(readKeychainAccounts: () -> [String]) -> [CompanionDisplayRecord] {
        if let data = defaults.data(forKey: Self.key),
           let records = try? JSONDecoder().decode([CompanionDisplayRecord].self, from: data) {
            return records
        }
        let legacyHost = defaults.string(forKey: "panelHost")
        let legacy = CompanionPairingSelection.restore(
            host: legacyHost,
            account: defaults.string(forKey: "pairingAccount"),
            readKeychainAccounts: readKeychainAccounts
        )
        let records = legacy.account.isEmpty ? [] : [
            CompanionDisplayRecord(host: legacy.host, name: defaults.string(forKey: "panelDisplayName") ?? "",
                                   account: legacy.account)
        ]
        // A host without a saved account may still have a legacy Keychain entry.
        // Retry migration on a later launch if Keychain was unavailable this time.
        if !records.isEmpty || legacyHost == "" { save(records) }
        return records
    }

    func save(_ records: [CompanionDisplayRecord]) {
        guard let data = try? JSONEncoder().encode(records) else { return }
        defaults.set(data, forKey: Self.key)
    }
}

@MainActor
final class CompanionDisplay: CompanionSessionPreferences, Identifiable {
    var record: CompanionDisplayRecord { didSet { onRecordChange?() } }
    nonisolated let id: UUID
    var state: CompanionConnectionState = .disconnected
    var recoveryMessage = ""
    var supportsSystemMetrics = false
    var onRecordChange: (() -> Void)?
    var isNewCertificate: ((String) -> Bool)?
    private let defaults: UserDefaults
    private unowned let resources: any CompanionSessionResources
    lazy var connection = CompanionConnection(preferences: self, resources: resources)

    init(record: CompanionDisplayRecord, defaults: UserDefaults, resources: any CompanionSessionResources) {
        self.id = record.id
        self.record = record
        self.defaults = defaults
        self.resources = resources
    }

    var name: String { record.name.isEmpty ? record.host : record.name }
    var panelHost: String {
        get { record.host }
        set { record.host = newValue }
    }
    var pairingAccount: String { record.account }
    var hasSavedPairing: Bool { !pairingAccount.isEmpty }
    var newPairingAccount: String { hasSavedPairing ? pairingAccount : "display.\(id.uuidString.lowercased())" }
    var certificateFingerprint: String? {
        guard hasSavedPairing else { return nil }
        return stringPreference(forKey: "companion.certificateFingerprint.\(pairingAccount)")
    }

    func allowsPairing(certificateFingerprint: String) -> Bool {
        isNewCertificate?(certificateFingerprint) ?? true
    }

    func stringPreference(forKey key: String) -> String? {
        if key == "panelDisplayName" { return record.name }
        return defaults.string(forKey: key)
    }
    func integerPreference(forKey key: String) -> Int { defaults.integer(forKey: key) }
    func setPreference(_ value: Any, forKey key: String) {
        if key == "panelDisplayName", let name = value as? String {
            if record.name != name { record.name = name }
        } else {
            defaults.set(value, forKey: key)
        }
    }
    func removePreference(forKey key: String) { defaults.removeObject(forKey: key) }
    func rememberPairingAccount(_ account: String) { record.account = account }
}
