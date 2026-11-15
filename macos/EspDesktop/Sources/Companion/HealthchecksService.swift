import Foundation

struct HealthchecksCheck: Decodable {
    enum Status: String, Codable {
        case new, up, grace, down, paused, unknown

        init(from decoder: Decoder) throws {
            self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
        }
    }

    let id: String
    let name: String
    let status: Status
    let started: Bool

    private enum CodingKeys: String, CodingKey {
        case id = "unique_key"
        case name, slug, status, started
    }

    init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        id = try fields.decode(String.self, forKey: .id)
        guard id.utf8.count == 40, id.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else {
            throw HealthchecksClient.Failure.invalidResponse
        }
        let checkName = try fields.decode(String.self, forKey: .name)
        let slug = try fields.decode(String.self, forKey: .slug)
        let displayName = checkName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? slug : checkName
        var label = ""
        for character in displayName {
            let next = character.isWhitespace || character.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
                ? " " : String(character)
            guard label.utf8.count + next.utf8.count <= 160 else { break }
            label += next
        }
        name = label.trimmingCharacters(in: .whitespacesAndNewlines)
        status = try fields.decode(Status.self, forKey: .status)
        started = try fields.decodeIfPresent(Bool.self, forKey: .started) ?? false
    }

    var wireValue: [String: Any] {
        ["id": id, "label": name.isEmpty ? "Unnamed check" : name, "status": status.rawValue, "started": started]
    }
}

struct HealthchecksUpdate {
    enum State: String {
        case unconfigured, waiting, ready, stale
    }

    var state: State = .unconfigured
    var checks: [HealthchecksCheck] = []
    var lastSuccess: Date?

    var liveState: State {
        guard state == .ready else { return state }
        return lastSuccess.map { (0...90).contains(Date().timeIntervalSince($0)) } == true ? .ready : .stale
    }
}

struct HealthchecksClient {
    enum Failure: LocalizedError {
        case invalidKey, readOnlyKeyRequired, rateLimited, invalidResponse, tooManyChecks, unavailable

        var errorDescription: String? {
            switch self {
            case .invalidKey: return "Healthchecks.io rejected the API key."
            case .readOnlyKeyRequired: return "Use the read-only key from Healthchecks.io Project Settings."
            case .rateLimited: return "Healthchecks.io is limiting requests. Try again shortly."
            case .invalidResponse: return "Healthchecks.io returned a response EspDesktop could not read."
            case .tooManyChecks: return "This project exceeds the display catalogue limit of 1,024 checks."
            case .unavailable: return "Could not reach Healthchecks.io. Check your internet connection and try again."
            }
        }
    }

    private struct Response: Decodable {
        let checks: [HealthchecksCheck]
    }

    private final class RejectRedirects: NSObject, URLSessionTaskDelegate, Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                        completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        return URLSession(configuration: configuration, delegate: RejectRedirects(), delegateQueue: nil)
    }()

    static func fetch(key: String, verifyReadOnly: Bool = false) async throws -> [HealthchecksCheck] {
        let (data, status) = try await request("checks/", key: key)
        switch status {
        case 200: break
        case 401, 403: throw Failure.invalidKey
        case 429: throw Failure.rateLimited
        default: throw Failure.unavailable
        }
        struct KeyScopeProbe: Decodable {
            struct Check: Decodable { let uuid: String? }
            let checks: [Check]
        }

        let probe = try? JSONDecoder().decode(KeyScopeProbe.self, from: data)
        if probe?.checks.contains(where: { $0.uuid != nil }) == true { throw Failure.readOnlyKeyRequired }
        guard let decoded = try? JSONDecoder().decode(Response.self, from: data) else {
            throw Failure.invalidResponse
        }
        let checks = decoded.checks
        guard checks.count <= 1024 else { throw Failure.tooManyChecks }
        guard Set(checks.map(\.id)).count == checks.count else { throw Failure.invalidResponse }

        // An empty project provides no check fields with which to identify the
        // key scope. Only the write-capable key can read the channels endpoint.
        if verifyReadOnly && checks.isEmpty {
            let (_, scopeStatus) = try await request("channels/", key: key)
            if scopeStatus == 200 { throw Failure.readOnlyKeyRequired }
            if scopeStatus == 429 { throw Failure.rateLimited }
            guard scopeStatus == 401 || scopeStatus == 403 else { throw Failure.unavailable }
        }
        return checks.sorted {
            let comparison = $0.name.localizedStandardCompare($1.name)
            return comparison == .orderedSame ? $0.id < $1.id : comparison == .orderedAscending
        }
    }

    private static func request(_ path: String, key: String) async throws -> (Data, Int) {
        let url = URL(string: "https://healthchecks.io/api/v3/" + path)!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue(key, forHTTPHeaderField: "X-Api-Key")
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw Failure.invalidResponse }
            return (data, http.statusCode)
        } catch {
            try Task.checkCancellation()
            throw Failure.unavailable
        }
    }
}
