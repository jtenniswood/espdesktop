import Foundation
import XCTest
@testable import Companion

private final class YouTubeFixtureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let client else { return }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let id = query.first(where: { $0.name == "id" })?.value
        let payload: (Int, String)
        switch (url.host, url.path, id, request.value(forHTTPHeaderField: "Authorization")) {
        case ("www.googleapis.com", "/youtube/v3/liveBroadcasts", "scheduled00", "Bearer fixture"):
            payload = (200, """
                {"items":[{"snippet":{"title":"A scheduled workshop"},"status":{"lifeCycleStatus":"ready","privacyStatus":"unlisted"},"contentDetails":{"boundStreamId":"signal"}}]}
                """)
        case ("www.googleapis.com", "/youtube/v3/liveStreams", "signal", "Bearer fixture"):
            XCTAssertEqual(query.first { $0.name == "part" }?.value, "status")
            payload = (200, """
                {"items":[{"status":{"streamStatus":"active","healthStatus":{"status":"good"}}}]}
                """)
        case ("www.googleapis.com", "/youtube/v3/liveBroadcasts", "completed00", "Bearer fixture"):
            payload = (200, """
                {"items":[{"snippet":{"title":"A finished workshop"},"status":{"lifeCycleStatus":"complete","privacyStatus":"private"},"contentDetails":{"boundStreamId":"must-not-fetch"}}]}
                """)
        case ("www.googleapis.com", "/youtube/v3/liveBroadcasts", "quota000000", "Bearer fixture"):
            payload = (403, #"{"error":{"errors":[{"reason":"quotaExceeded"}]}}"#)
        default:
            XCTFail("Unexpected YouTube request")
            payload = (400, "{}")
        }
        let response = HTTPURLResponse(url: url, statusCode: payload.0, httpVersion: nil, headerFields: nil)!
        client.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client.urlProtocol(self, didLoad: Data(payload.1.utf8))
        client.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class YouTubeMonitoringTests: XCTestCase {
    func testEventLinkRequiresYouTubeAndAValidVideoID() {
        for input in [
            "R03C8xHdP-0", "https://www.youtube.com/watch?v=R03C8xHdP-0",
            "https://studio.youtube.com/video/R03C8xHdP-0/livestreaming",
            "https://youtu.be/R03C8xHdP-0", "https://www.youtube.com/live/R03C8xHdP-0?si=example",
        ] {
            XCTAssertEqual(YouTubeAPI.videoID(from: input), "R03C8xHdP-0")
        }
        for input in [
            "https://studio.youtube.com.evil.example/video/R03C8xHdP-0/livestreaming",
            "https://fake@youtube.com/watch?v=R03C8xHdP-0", "https://youtube.com/watch?v=short",
            "https://youtube.com/video/R03C8xHdP-0", "https://youtube.com:123/watch?v=R03C8xHdP-0",
        ] {
            XCTAssertNil(YouTubeAPI.videoID(from: input))
        }
    }

    @MainActor
    func testAuthorizationUsesReadOnlyScopeAndValidatesCallbackState() throws {
        let redirect = URL(string: "http://127.0.0.1:12345/oauth")!
        let url = YouTubeAPI.authorizationURL(client: .init(clientID: "client", clientSecret: "secret"),
            redirect: redirect, state: "expected", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        let query = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(query.first { $0.name == "code_challenge" }?.value, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        XCTAssertEqual(query.first { $0.name == "scope" }?.value, "https://www.googleapis.com/auth/youtube.readonly")
        XCTAssertFalse(url.absoluteString.contains("secret"))
        XCTAssertNil(YouTubeOAuthCallback.parse("GET /oauth?state=wrong&code=good HTTP/1.1", state: "expected"))
        XCTAssertNil(YouTubeOAuthCallback.parse("GET /oauth?state=expected&state=wrong&code=good HTTP/1.1", state: "expected"))
        XCTAssertEqual(try YouTubeOAuthCallback.parse("GET /oauth?state=expected&code=good%2Bcode HTTP/1.1",
                                                      state: "expected")?.get(), "good+code")
    }

    @MainActor
    func testOAuthListenerAcceptsOnlyMatchingLoopbackCallback() async throws {
        let callback = try YouTubeOAuthCallback()
        defer { callback.cancel() }
        let url = try await callback.start(state: "matching")
        XCTAssertEqual(url.host, "127.0.0.1")
        let session = URLSession(configuration: .ephemeral)
        func reply(_ query: String) async throws -> Int? {
            let target = try XCTUnwrap(URL(string: url.absoluteString + "?" + query))
            let (_, response) = try await session.data(for: URLRequest(url: target, timeoutInterval: 5))
            return (response as? HTTPURLResponse)?.statusCode
        }
        let invalidStatus = try await reply("state=wrong&code=ignore")
        XCTAssertEqual(invalidStatus, 400)
        let validStatus = try await reply("state=matching&code=accepted")
        XCTAssertEqual(validStatus, 200)
        let code = try await callback.code()
        XCTAssertEqual(code, "accepted")
    }

    @MainActor
    func testBroadcastUsesIngestAndEventStatusIndependently() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [YouTubeFixtureProtocol.self]
        let api = YouTubeAPI(session: URLSession(configuration: configuration))
        let ready = try await api.broadcast(id: "scheduled00", token: "fixture")
        XCTAssertEqual(ready.signal, .receiving)
        XCTAssertEqual(ready.status, .ready)
        XCTAssertEqual(ready.panelDetail, "Receiving · Waiting · Unlisted")
        XCTAssertEqual(YouTubeConnection.Status.active(ready).card.label,
                       "A scheduled workshop · Receiving · Waiting · Unlisted")
        let ended = try await api.broadcast(id: "completed00", token: "fixture")
        XCTAssertEqual(ended.panelDetail, "Ended · Private")
        do {
            _ = try await api.broadcast(id: "quota000000", token: "fixture")
            XCTFail("Expected a quota error")
        } catch YouTubeAPI.Failure.quota {
            XCTAssertEqual(YouTubeConnection.Status.quota.card.label, "YouTube · Unavailable")
        }
    }

    @MainActor
    func testUploadWarningRequiresSustainedDropsOrCongestion() {
        var health = OBSConnection.UploadHealth()
        func sample(_ total: Int, _ dropped: Int, congestion: Double = 0) -> OBSWebSocket.Fields {
            ["outputActive": true, "outputTotalFrames": total, "outputSkippedFrames": dropped, "outputCongestion": congestion]
        }
        XCTAssertFalse(health.update(sample(100, 0)))
        XCTAssertFalse(health.update(sample(200, 10)))
        XCTAssertTrue(health.update(sample(300, 20)))
        XCTAssertFalse(health.update(sample(400, 20)))
        XCTAssertFalse(health.update(sample(500, 20, congestion: 0.8)))
        XCTAssertTrue(health.update(sample(600, 20, congestion: 0.8)))
        XCTAssertFalse(health.update(nil))
        XCTAssertFalse(health.update(sample(10, 0)))
    }
}
