import Foundation

/// Connection progress is independent of diagnostic text and action errors.
enum CompanionConnectionState: Equatable {
    case disconnected, connecting, reconnecting, connected, needsPairing, failed

    var isBusy: Bool { self == .connecting || self == .reconnecting }
    var title: String {
        switch self {
        case .disconnected: return "Not Connected"
        case .connecting: return "Connecting…"
        case .reconnecting: return "Reconnecting…"
        case .connected: return "Connected"
        case .needsPairing: return "Pairing Required"
        case .failed: return "Connection Needs Attention"
        }
    }
    var symbol: String {
        switch self {
        case .connected: return "checkmark.circle"
        case .needsPairing, .failed: return "exclamationmark.triangle"
        default: return "display"
        }
    }
}

enum CompanionPairingInput {
    static let shortLength = 4
    static let legacyLength = 8

    static func normalizedCode(_ code: String, letterCount: Int? = nil) -> String? {
        var letters = Array(code.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars)
        // Older displays expect the dash even when the code was typed without it.
        let separators: Set<UInt32> = [0x2D, 0x2010, 0x2011, 0x2013, 0x2014, 0x2212]
        if letters.count == legacyLength + 1, separators.contains(letters[4].value) { letters.remove(at: 4) }
        guard letters.count == shortLength || letters.count == legacyLength,
              letterCount == nil || letters.count == letterCount,
              letters.allSatisfy({ (65...90).contains($0.value) || (97...122).contains($0.value) }) else { return nil }
        let uppercase = String(String.UnicodeScalarView(letters)).uppercased()
        return letters.count == legacyLength ? "\(uppercase.prefix(4))-\(uppercase.suffix(4))" : uppercase
    }

    static func isValid(host: String, code: String, letterCount: Int? = nil) -> Bool {
        ConnectionEndpointPolicy.isLocalEndpoint(host) && normalizedCode(code, letterCount: letterCount) != nil
    }
}
