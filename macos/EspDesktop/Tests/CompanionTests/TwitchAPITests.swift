import Foundation
import XCTest
@testable import Companion

@MainActor
final class TwitchAPITests: XCTestCase {
    private static let authorization = TwitchAPI.Authorization(clientID: "client", accessToken: "token", broadcasterID: "123")

    func testRefreshEncodesPublicClientFormWithoutSecret() async throws {
        let api = TwitchAPI { request in
            XCTAssertEqual(request.url?.absoluteString, "https://id.twitch.tv/oauth2/token")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/x-www-form-urlencoded")
            XCTAssertEqual(String(decoding: try XCTUnwrap(request.httpBody), as: UTF8.self),
                           "client_id=client&grant_type=refresh_token&refresh_token=a%2Bb%2F%3Dc%25")
            return try Self.response(request, body: #"{"access_token":"new","refresh_token":"rotated","expires_in":300}"#)
        }

        let refreshed = try await api.refresh("a+b/=c%", clientID: "client")
        XCTAssertEqual(refreshed.accessToken, "new")
        XCTAssertEqual(refreshed.refreshToken, "rotated")
    }

    func testChannelUpdateUsesBroadcasterIDAndPreservesFieldsOmittedByThePreset() async throws {
        let api = TwitchAPI { request in
            XCTAssertEqual(request.url?.absoluteString, "https://api.twitch.tv/helix/channels?broadcaster_id=123")
            XCTAssertEqual(request.httpMethod, "PATCH")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Client-Id"), "client")
            XCTAssertEqual(try Self.body(request) as? [String: String], ["title": "Tonight’s stream"])
            return try Self.response(request, status: 204)
        }

        try await api.updateChannel(title: "Tonight’s stream", gameID: nil, tags: nil, auth: Self.authorization)
    }

    func testClipAcceptanceAndAvailabilityAreSeparateRequests() async throws {
        let api = TwitchAPI { request in
            switch request.httpMethod {
            case "POST":
                XCTAssertEqual(request.url?.query, "broadcaster_id=123")
                return try Self.response(request, status: 202, body: #"{"data":[{"id":"clip-id"}]}"#)
            case "GET":
                XCTAssertEqual(request.url?.query, "id=clip-id")
                return try Self.response(request, body: #"{"data":[]}"#)
            default:
                XCTFail("Unexpected method")
                throw URLError(.badServerResponse)
            }
        }

        let accepted = try await api.createClip(auth: Self.authorization)
        let published = try await api.clip(id: accepted.id, auth: Self.authorization)
        XCTAssertNil(published)
    }

    func testPredictionLockAndResolveUseTheCorrectRequestBody() async throws {
        let locked = TwitchAPI { request in
            XCTAssertEqual(request.url?.absoluteString, "https://api.twitch.tv/helix/predictions")
            XCTAssertEqual(request.httpMethod, "PATCH")
            XCTAssertEqual(try Self.body(request) as? [String: String],
                           ["broadcaster_id": "123", "id": "prediction", "status": "LOCKED"])
            return try Self.response(request, body: #"{"data":[{"id":"prediction","title":"Who wins?","status":"LOCKED","outcomes":[]}]}"#)
        }
        let resolved = TwitchAPI { request in
            XCTAssertEqual(try Self.body(request) as? [String: String],
                           ["broadcaster_id": "123", "id": "prediction", "status": "RESOLVED", "winning_outcome_id": "winner"])
            return try Self.response(request, body: #"{"data":[{"id":"prediction","title":"Who wins?","status":"RESOLVED","outcomes":[]}]}"#)
        }

        let lock = try await locked.updatePrediction(id: "prediction", resolution: .lock, auth: Self.authorization)
        let winner = try await resolved.updatePrediction(id: lock.id, resolution: .winner("winner"), auth: Self.authorization)
        XCTAssertEqual(winner.status, "RESOLVED")
    }

    nonisolated private static func response(_ request: URLRequest, status: Int = 200, body: String = "") throws -> (Data, HTTPURLResponse) {
        let url = try XCTUnwrap(request.url)
        return (Data(body.utf8), try XCTUnwrap(HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)))
    }

    nonisolated private static func body(_ request: URLRequest) throws -> Any {
        try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody))
    }
}
