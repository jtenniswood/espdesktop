import Foundation

/// Connection progress is independent of diagnostic text and action errors.
enum CompanionConnectionState: Equatable {
    case disconnected, connecting, reconnecting, connected, failed

    var isBusy: Bool { self == .connecting || self == .reconnecting }
    var title: String {
        switch self {
        case .disconnected: return "Not Connected"
        case .connecting: return "Connecting…"
        case .reconnecting: return "Reconnecting…"
        case .connected: return "Connected"
        case .failed: return "Connection Needs Attention"
        }
    }
    var symbol: String {
        switch self {
        case .connected: return "checkmark.circle"
        case .failed: return "exclamationmark.triangle"
        default: return "display"
        }
    }
}

enum CompanionPairingInput {
    static func normalizedCode(_ code: String) -> String? {
        var letters = Array(code.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars)
        // Firmware displays and verifies ABCD-EFGH. Accept typing without the
        // separator, but always send the exact format the display generates.
        // Pasting or macOS smart punctuation may replace the separator. Only
        // normalize a dash in the expected position; letters remain ASCII-only.
        let separators: Set<UInt32> = [0x2D, 0x2010, 0x2011, 0x2013, 0x2014, 0x2212]
        if letters.count == 9, separators.contains(letters[4].value) { letters.remove(at: 4) }
        guard letters.count == 8,
              letters.allSatisfy({ (65...90).contains($0.value) || (97...122).contains($0.value) }) else { return nil }
        let uppercase = String(String.UnicodeScalarView(letters)).uppercased()
        return "\(uppercase.prefix(4))-\(uppercase.suffix(4))"
    }

    static func isValid(host: String, code: String) -> Bool {
        ConnectionEndpointPolicy.isLocalEndpoint(host) && normalizedCode(code) != nil
    }
}
