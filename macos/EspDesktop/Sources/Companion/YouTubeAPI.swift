import CryptoKit
import Foundation

struct YouTubeDesktopClient: Codable, Equatable {
    let clientID: String
    let clientSecret: String
}

struct YouTubeTokens: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: TimeInterval
}

struct YouTubeBroadcast: Equatable {
    enum Status: String, Decodable {
        case created, ready, testStarting, testing, liveStarting, live, complete, revoked
    }

    enum Visibility: String, Decodable {
        case `public`, unlisted, `private`
    }

    enum Signal: Equatable {
        case receiving, waiting, degraded, unknown
    }

    let title: String
    let status: Status
    let visibility: Visibility
    let signal: Signal

    var panelStatus: String {
        switch status {
        case .live:
            return signal == .degraded || signal == .waiting ? "Live · Check signal" : "Live"
        case .liveStarting: return "Starting"
        case .testStarting, .testing: return "Testing"
        case .complete: return "Ended"
        case .revoked: return "Unavailable"
        case .created, .ready:
            switch signal {
            case .receiving: return "Receiving · Waiting"
            case .waiting: return "Waiting for video"
            case .degraded: return "Check signal"
            case .unknown: return "Waiting"
            }
        }
    }

    var panelDetail: String {
        panelStatus + " · " + visibility.rawValue.capitalized
    }
}

struct YouTubeAPI {
    enum Failure: Error {
        case unexpectedResponse, signInRequired, quota, eventUnavailable, network
    }

    private struct List<Item: Decodable>: Decodable {
        let items: [Item]
    }

    private struct Event: Decodable {
        struct Snippet: Decodable { let title: String }
        struct Status: Decodable {
            let lifeCycleStatus: YouTubeBroadcast.Status
            let privacyStatus: YouTubeBroadcast.Visibility
        }
        struct ContentDetails: Decodable { let boundStreamId: String? }
        let snippet: Snippet
        let status: Status
        let contentDetails: ContentDetails?
    }

    private struct Stream: Decodable {
        struct Status: Decodable {
            struct Health: Decodable { let status: String? }
            let streamStatus: String?
            let healthStatus: Health?

            var signal: YouTubeBroadcast.Signal {
                if streamStatus == "error" { return .degraded }
                if streamStatus == "active" {
                    switch healthStatus?.status {
                    case "bad", "noData": return .degraded
                    default: return .receiving
                    }
                }
                switch streamStatus {
                case "created", "ready", "inactive": return .waiting
                default: return .unknown
                }
            }
        }
        let status: Status
    }

    private struct ServiceError: Decodable {
        struct Body: Decodable {
            struct Detail: Decodable { let reason: String? }
            let errors: [Detail]?
        }

        let error: Body
    }

    private struct TokenError: Decodable { let error: String }

    let session: URLSession

    init(session: URLSession = URLSession(configuration: .ephemeral)) {
        self.session = session
    }

    static func videoID(from input: String) -> String? {
        func valid(_ id: String) -> Bool { id.utf8.count == 11 && id.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil }
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if valid(value) { return value }
        guard let url = URLComponents(string: value), url.scheme == "https", url.user == nil,
              url.password == nil, url.port == nil else { return nil }
        let path = url.path.split(separator: "/").map(String.init)
        let candidate: String?
        switch url.host?.lowercased() {
        case "youtu.be" where path.count == 1: candidate = path.first
        case "www.youtube.com", "youtube.com", "m.youtube.com":
            if path == ["watch"] {
                candidate = url.queryItems?.first(where: { $0.name == "v" })?.value
            } else {
                candidate = path.count == 2 && path.first == "live" ? path.last : nil
            }
        case "studio.youtube.com":
            candidate = path.count == 3 && path.first == "video" && path.last == "livestreaming" ? path[1] : nil
        default: candidate = nil
        }
        return candidate.flatMap { valid($0) ? $0 : nil }
    }

    static func authorizationURL(client: YouTubeDesktopClient, redirect: URL, state: String, verifier: String) -> URL {
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        var url = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        url.queryItems = [
            .init(name: "client_id", value: client.clientID),
            .init(name: "redirect_uri", value: redirect.absoluteString),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: "https://www.googleapis.com/auth/youtube.readonly"),
            .init(name: "state", value: state),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "access_type", value: "offline"),
            .init(name: "prompt", value: "consent select_account"),
        ]
        return url.url!
    }

    func exchange(client: YouTubeDesktopClient, code: String, verifier: String, redirect: URL) async throws -> YouTubeTokens {
        try await tokens(client, fields: [
            .init(name: "grant_type", value: "authorization_code"), .init(name: "code", value: code),
            .init(name: "code_verifier", value: verifier), .init(name: "redirect_uri", value: redirect.absoluteString),
        ])
    }

    func refresh(client: YouTubeDesktopClient, refreshToken: String) async throws -> YouTubeTokens {
        try await tokens(client, fields: [
            .init(name: "grant_type", value: "refresh_token"), .init(name: "refresh_token", value: refreshToken),
        ])
    }

    private func tokens(_ client: YouTubeDesktopClient, fields: [URLQueryItem]) async throws -> YouTubeTokens {
        var body = URLComponents()
        body.queryItems = fields + [.init(name: "client_id", value: client.clientID),
                                   .init(name: "client_secret", value: client.clientSecret)]
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!, timeoutInterval: 12)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = body.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
        let (data, response) = try await session.data(for: request)
        guard let status = (response as? HTTPURLResponse)?.statusCode else { throw Failure.unexpectedResponse }
        if [400, 401, 403].contains(status),
           let failure = try? JSONDecoder().decode(TokenError.self, from: data),
           ["invalid_grant", "invalid_client", "unauthorized_client"].contains(failure.error) {
            throw Failure.signInRequired
        }
        guard status == 200 else { throw Failure.network }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(YouTubeTokens.self, from: data)
    }

    func broadcast(id: String, token: String) async throws -> YouTubeBroadcast {
        let event: List<Event> = try await list("liveBroadcasts", id: id, part: "snippet,status,contentDetails",
            fields: "items(snippet/title,status(lifeCycleStatus,privacyStatus),contentDetails/boundStreamId)", token: token)
        guard let event = event.items.first else { throw Failure.eventUnavailable }
        var signal = YouTubeBroadcast.Signal.unknown
        if let streamID = event.contentDetails?.boundStreamId, event.status.lifeCycleStatus != .complete,
           event.status.lifeCycleStatus != .revoked {
            let stream: List<Stream> = try await list("liveStreams", id: streamID, part: "status",
                fields: "items(status(streamStatus,healthStatus/status))", token: token)
            signal = stream.items.first?.status.signal ?? .unknown
        }
        return YouTubeBroadcast(title: event.snippet.title, status: event.status.lifeCycleStatus,
                                visibility: event.status.privacyStatus, signal: signal)
    }

    private func list<Result: Decodable>(_ resource: String, id: String, part: String, fields: String, token: String) async throws -> Result {
        var url = URLComponents(string: "https://www.googleapis.com/youtube/v3/" + resource)!
        url.queryItems = [.init(name: "id", value: id), .init(name: "part", value: part), .init(name: "fields", value: fields)]
        var request = URLRequest(url: url.url!, timeoutInterval: 12)
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let status = (response as? HTTPURLResponse)?.statusCode else { throw Failure.unexpectedResponse }
        if status == 401 { throw Failure.signInRequired }
        if status == 429 { throw Failure.quota }
        if status == 403 {
            let reasons = (try? JSONDecoder().decode(ServiceError.self, from: data))?.error.errors?.compactMap(\.reason) ?? []
            if reasons.contains(where: { ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].contains($0) }) {
                throw Failure.quota
            }
            throw Failure.eventUnavailable
        }
        if status == 404 { throw Failure.eventUnavailable }
        guard status == 200 else { throw Failure.network }
        return try JSONDecoder().decode(Result.self, from: data)
    }
}
