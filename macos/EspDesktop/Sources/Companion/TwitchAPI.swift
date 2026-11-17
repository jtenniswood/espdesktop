import Foundation

enum TwitchScope: String, CaseIterable, Sendable {
    case broadcast = "channel:manage:broadcast"
    case clips = "clips:edit"
    case commercials = "channel:edit:commercial"
    case polls = "channel:manage:polls"
    case predictions = "channel:manage:predictions"
}

struct TwitchAPI: Sendable {
    struct HTTPError: Error, Equatable {
        let status: Int
        let message: String?
        let retryAt: Date?

        var invalidSession: Bool {
            status == 401 || message?.lowercased() == "invalid refresh token"
        }
    }

    enum ResponseError: Error {
        case invalidResponse, missingData
    }

    struct DeviceCode: Decodable, Sendable {
        let deviceCode: String
        let userCode: String
        let verificationUri: URL
        let expiresIn: Int
        let interval: Int
    }

    struct TokenResponse: Decodable, Sendable {
        let accessToken: String
        let refreshToken: String
        let expiresIn: Int
        let scope: [String]?
    }

    struct Identity: Decodable, Sendable {
        let clientId: String
        let userId: String
        let login: String
        let scopes: [String]?
        let expiresIn: Int

        func allows(_ scope: TwitchScope) -> Bool { scopes?.contains(scope.rawValue) == true }
    }

    struct Channel: Decodable, Sendable, Equatable {
        let title: String
        let gameId: String
        let gameName: String
        let tags: [String]
    }

    struct Stream: Decodable, Sendable, Equatable {
        let id: String
        let viewerCount: Int
        let startedAt: Date
    }

    struct Account: Decodable, Sendable, Equatable {
        let broadcasterType: String
        let displayName: String

        var eligibleForCommercialsAndPolls: Bool {
            broadcasterType == "affiliate" || broadcasterType == "partner"
        }
    }

    struct Category: Codable, Sendable, Identifiable, Equatable {
        let id: String
        let name: String
    }

    struct Marker: Decodable, Sendable {
        let id: String
        let positionSeconds: Int
    }

    struct ClipRequest: Decodable, Sendable {
        let id: String
    }

    struct Clip: Decodable, Sendable, Equatable {
        let id: String
        let url: URL
    }

    struct Commercial: Decodable, Sendable {
        let length: Int
        let message: String
        let retryAfter: Int
    }

    struct Poll: Decodable, Sendable, Equatable {
        let id: String
        let title: String
        let status: String
    }

    struct Prediction: Decodable, Sendable, Equatable {
        struct Outcome: Decodable, Sendable, Identifiable, Equatable {
            let id: String
            let title: String
        }
        let id: String
        let title: String
        let status: String
        let outcomes: [Outcome]
    }

    enum PredictionResolution: Sendable {
        case lock, cancel, winner(String)
    }

    struct Authorization: Sendable {
        let clientID: String
        let accessToken: String
        let broadcasterID: String
    }

    private struct List<Element: Decodable>: Decodable {
        let data: [Element]
    }

    private struct ErrorBody: Decodable {
        let message: String?
    }

    private final class RejectRedirects: NSObject, URLSessionTaskDelegate, Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest) async -> URLRequest? { nil }
    }

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 20
        configuration.httpShouldSetCookies = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration, delegate: RejectRedirects(), delegateQueue: nil)
    }()

    private let send: @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

    init(send: @escaping @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse) = { request in
        let (data, response) = try await TwitchAPI.session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw ResponseError.invalidResponse }
        return (data, response)
    }) {
        self.send = send
    }

    func startDeviceAuthorization(clientID: String, scopes: Set<TwitchScope>) async throws -> DeviceCode {
        try decode(DeviceCode.self, from: await oauthForm("device", [
            "client_id": clientID, "scopes": scopes.map(\.rawValue).sorted().joined(separator: " "),
        ]))
    }

    func exchangeDeviceCode(_ code: String, clientID: String, scopes: Set<TwitchScope>) async throws -> TokenResponse {
        try decode(TokenResponse.self, from: await oauthForm("token", [
            "client_id": clientID, "device_code": code, "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "scopes": scopes.map(\.rawValue).sorted().joined(separator: " "),
        ]))
    }

    func refresh(_ refreshToken: String, clientID: String) async throws -> TokenResponse {
        try decode(TokenResponse.self, from: await oauthForm("token", [
            "client_id": clientID, "refresh_token": refreshToken, "grant_type": "refresh_token",
        ]))
    }

    func validate(_ accessToken: String) async throws -> Identity {
        var request = URLRequest(url: URL(string: "https://id.twitch.tv/oauth2/validate")!)
        request.setValue("OAuth \(accessToken)", forHTTPHeaderField: "Authorization")
        return try decode(Identity.self, from: await checked(request))
    }

    func revoke(_ accessToken: String, clientID: String) async throws {
        _ = try await oauthForm("revoke", ["client_id": clientID, "token": accessToken])
    }

    func account(_ auth: Authorization) async throws -> Account {
        try first(Account.self, from: await helix("users", auth, query: ["id": auth.broadcasterID]))
    }

    func channel(_ auth: Authorization) async throws -> Channel {
        try first(Channel.self, from: await helix("channels", auth, query: ["broadcaster_id": auth.broadcasterID]))
    }

    func stream(_ auth: Authorization) async throws -> Stream? {
        try decode(List<Stream>.self, from: await helix("streams", auth, query: ["user_id": auth.broadcasterID])).data.first
    }

    func searchCategories(_ query: String, auth: Authorization) async throws -> [Category] {
        try decode(List<Category>.self, from: await helix("search/categories", auth,
            query: ["query": query, "first": "10"])).data
    }

    func updateChannel(title: String, gameID: String?, tags: [String]?, auth: Authorization) async throws {
        var body: [String: Any] = ["title": title]
        if let gameID { body["game_id"] = gameID }
        if let tags { body["tags"] = tags }
        _ = try await helix("channels", auth, method: "PATCH", query: ["broadcaster_id": auth.broadcasterID], body: body)
    }

    func addMarker(description: String, auth: Authorization) async throws -> Marker {
        try first(Marker.self, from: await helix("streams/markers", auth, method: "POST",
            body: ["user_id": auth.broadcasterID, "description": description]))
    }

    func createClip(auth: Authorization) async throws -> ClipRequest {
        try first(ClipRequest.self, from: await helix("clips", auth, method: "POST",
            query: ["broadcaster_id": auth.broadcasterID]))
    }

    func clip(id: String, auth: Authorization) async throws -> Clip? {
        try decode(List<Clip>.self, from: await helix("clips", auth, query: ["id": id])).data.first
    }

    func startCommercial(seconds: Int, auth: Authorization) async throws -> Commercial {
        try first(Commercial.self, from: await helix("channels/commercial", auth, method: "POST",
            body: ["broadcaster_id": auth.broadcasterID, "length": seconds]))
    }

    func latestPoll(auth: Authorization) async throws -> Poll? {
        try decode(List<Poll>.self, from: await helix("polls", auth,
            query: ["broadcaster_id": auth.broadcasterID, "first": "1"])).data.first
    }

    func createPoll(title: String, choices: [String], duration: Int, auth: Authorization) async throws -> Poll {
        try first(Poll.self, from: await helix("polls", auth, method: "POST",
            body: ["broadcaster_id": auth.broadcasterID, "title": title,
                   "choices": choices.map { ["title": $0] }, "duration": duration]))
    }

    func endPoll(id: String, auth: Authorization) async throws -> Poll {
        try first(Poll.self, from: await helix("polls", auth, method: "PATCH",
            body: ["broadcaster_id": auth.broadcasterID, "id": id, "status": "TERMINATED"]))
    }

    func latestPrediction(auth: Authorization) async throws -> Prediction? {
        try decode(List<Prediction>.self, from: await helix("predictions", auth,
            query: ["broadcaster_id": auth.broadcasterID, "first": "1"])).data.first
    }

    func createPrediction(title: String, outcomes: [String], duration: Int, auth: Authorization) async throws -> Prediction {
        try first(Prediction.self, from: await helix("predictions", auth, method: "POST",
            body: ["broadcaster_id": auth.broadcasterID, "title": title,
                   "outcomes": outcomes.map { ["title": $0] }, "prediction_window": duration]))
    }

    func updatePrediction(id: String, resolution: PredictionResolution, auth: Authorization) async throws -> Prediction {
        var body = ["broadcaster_id": auth.broadcasterID, "id": id]
        switch resolution {
        case .lock: body["status"] = "LOCKED"
        case .cancel: body["status"] = "CANCELED"
        case let .winner(id):
            body["status"] = "RESOLVED"
            body["winning_outcome_id"] = id
        }
        return try first(Prediction.self, from: await helix("predictions", auth, method: "PATCH", body: body))
    }

    func subscribe(event: String, sessionID: String, auth: Authorization) async throws {
        _ = try await helix("eventsub/subscriptions", auth, method: "POST",
            body: ["type": event, "version": "1", "condition": ["broadcaster_user_id": auth.broadcasterID],
                   "transport": ["method": "websocket", "session_id": sessionID]])
    }

    private func oauthForm(_ endpoint: String, _ fields: [String: String]) async throws -> Data {
        var request = URLRequest(url: URL(string: "https://id.twitch.tv/oauth2/\(endpoint)")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        // '+' in a refresh token must be escaped before form decoding.
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        request.httpBody = Data(fields.sorted(by: { $0.key < $1.key }).map { key, value in
            "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed)!)"
        }.joined(separator: "&").utf8)
        return try await checked(request)
    }

    private func helix(_ endpoint: String, _ auth: Authorization, method: String = "GET",
                       query: [String: String] = [:], body: [String: Any]? = nil) async throws -> Data {
        var url = URLComponents(string: "https://api.twitch.tv/helix/\(endpoint)")!
        if !query.isEmpty {
            url.queryItems = query.sorted(by: { $0.key < $1.key }).map(URLQueryItem.init)
            url.percentEncodedQuery = url.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        }
        guard let endpointURL = url.url else { throw ResponseError.invalidResponse }
        var request = URLRequest(url: endpointURL)
        request.httpMethod = method
        request.setValue(auth.clientID, forHTTPHeaderField: "Client-Id")
        request.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return try await checked(request)
    }

    private func checked(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await send(request)
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.message
            let reset = response.value(forHTTPHeaderField: "Ratelimit-Reset").flatMap(Double.init)
            let retry = response.value(forHTTPHeaderField: "Retry-After").flatMap(Double.init)
            let retryAt = retry.map { Date().addingTimeInterval($0) }
                ?? reset.map(Date.init(timeIntervalSince1970:))
            throw HTTPError(status: response.statusCode, message: message, retryAt: retryAt)
        }
        return data
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(type, from: data)
    }

    private func first<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        guard let value = try decode(List<T>.self, from: data).data.first else { throw ResponseError.missingData }
        return value
    }
}
