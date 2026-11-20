import Foundation

enum CompanionSettingsDestination {
    case displays, addDevice, support
}

enum CompanionPairingPrompt: Equatable {
    case code(Int), reset(Int), unavailable

    var letterCount: Int? {
        switch self {
        case let .code(length), let .reset(length): return length
        case .unavailable: return nil
        }
    }

    private struct Status: Decodable {
        let available: Bool
        let active: Bool
        let paired: Bool
        let code_length: Int?
    }

    private final class LocalRequestDelegate: NSObject, URLSessionTaskDelegate {
        func urlSession(
            _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void
        ) {
            completionHandler(nil)
        }
    }

    static func request(on webServer: URL, session: URLSession = .shared) async -> Self {
        guard var endpoint = URLComponents(url: webServer, resolvingAgainstBaseURL: false),
              let scheme = endpoint.scheme, scheme == "http" || scheme == "https",
              let host = endpoint.host, ConnectionEndpointPolicy.isLocalHost(host) else { return .unavailable }
        endpoint.path = "/companion/pairing"
        endpoint.queryItems = [URLQueryItem(name: "show_on_display", value: "1")]
        guard let url = endpoint.url else { return .unavailable }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await session.data(for: request, delegate: LocalRequestDelegate()),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let status = try? JSONDecoder().decode(Status.self, from: data), status.available else {
            return .unavailable
        }
        let length = status.code_length == CompanionPairingInput.shortLength
            ? CompanionPairingInput.shortLength : CompanionPairingInput.legacyLength
        if status.paired { return .reset(length) }
        return status.active ? .code(length) : .unavailable
    }
}

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
