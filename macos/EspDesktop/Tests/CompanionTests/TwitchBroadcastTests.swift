import Foundation
import XCTest
@testable import Companion

@MainActor
final class TwitchBroadcastTests: XCTestCase {
    func testLiveStateAndPredictionCommandsFollowThePairedSnapshotWithoutAffiliateStatus() async throws {
        let suite = "TwitchBroadcastTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("exampleclient", forKey: "twitch.clientID")
        var preferences = TwitchBroadcastConfiguration()
        preferences.adsEnabled = true
        preferences.pollsEnabled = true
        preferences.poll.title = "What next?"
        preferences.poll.choices = "Red\nBlue"
        preferences.predictionsEnabled = true
        preferences.prediction.title = "Who wins next?"
        preferences.prediction.choices = "Red Team\nBlue Team"
        defaults.set(try JSONEncoder().encode(preferences), forKey: "twitch.broadcastConfiguration")
        let saved = try JSONSerialization.data(withJSONObject: [
            "clientID": "exampleclient", "broadcasterID": "42",
            "accessToken": "test-access", "refreshToken": "test-refresh",
            "expiresAt": Date().addingTimeInterval(900).timeIntervalSinceReferenceDate,
        ])
        let requests = Requests()
        let twitch = TwitchBroadcast(defaults: defaults, api: TwitchAPI { request in try await requests.send(request) },
            credentialStore: .init(load: { saved }, save: { _ in true }, remove: {}),
            monitorEvents: false)
        defer { twitch.disconnect() }

        for _ in 0..<100 where twitch.prediction == nil {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertEqual(twitch.status, .live)
        let state = try XCTUnwrap(twitch.panelControls.first { $0.id == "twitch.status" })
        XCTAssertTrue(state.active)
        XCTAssertFalse(state.enabled)
        XCTAssertEqual(state.detail, "12 watching")
        XCTAssertFalse(twitch.panelControls.first { $0.id == "twitch.commercial" }?.enabled ?? true)
        XCTAssertFalse(twitch.panelControls.first { $0.id == "twitch.pollStart" }?.enabled ?? true)

        let winnerID = "twitch.predictionWinner.2"
        let shown = try XCTUnwrap(twitch.panelControls.first { $0.id == winnerID })
        XCTAssertEqual(shown.label, "Blue Team")
        let oldCommand = try XCTUnwrap(shown.command)
        twitch.configuration.markerDescription = "New marker note"
        let staleWorked = await twitch.invokePanel(oldCommand) { true }
        XCTAssertFalse(staleWorked)
        let currentCommand = try XCTUnwrap(twitch.panelControls.first { $0.id == winnerID }?.command)
        XCTAssertNotEqual(currentCommand, oldCommand)

        let closedSessionWorked = await twitch.invokePanel(currentCommand) { false }
        XCTAssertFalse(closedSessionWorked)
        let resolved = await twitch.invokePanel(currentCommand) { true }
        XCTAssertTrue(resolved)
        let winners = await requests.winners
        XCTAssertEqual(winners, ["blue"])
        XCTAssertFalse(twitch.panelControls.contains { $0.id == winnerID })

        let startCommand = try XCTUnwrap(twitch.panelControls.first { $0.id == "twitch.predictionStart" }?.command)
        let started = await twitch.invokePanel(startCommand) { true }
        XCTAssertTrue(started)
        XCTAssertEqual(twitch.prediction?.status, "ACTIVE")
        XCTAssertTrue(twitch.panelControls.first { $0.id == "twitch.predictionLock" }?.enabled ?? false)
    }

    func testAdCooldownLeavesOtherPanelActionsAvailableUntilTheTwitchRateLimitIsExhausted() async throws {
        for remaining in [400, 0] {
            let suite = "TwitchBroadcastTests." + UUID().uuidString
            let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
            defer { defaults.removePersistentDomain(forName: suite) }
            defaults.set("exampleclient", forKey: "twitch.clientID")
            let saved = try JSONSerialization.data(withJSONObject: [
                "clientID": "exampleclient", "broadcasterID": "42",
                "accessToken": "test-access", "refreshToken": "test-refresh",
                "expiresAt": Date().addingTimeInterval(900).timeIntervalSinceReferenceDate,
            ])
            let requests = Requests(commercialRateLimitRemaining: remaining)
            let twitch = TwitchBroadcast(defaults: defaults, api: TwitchAPI { try await requests.send($0) },
                credentialStore: .init(load: { saved }, save: { _ in true }, remove: {}), monitorEvents: false)
            defer { twitch.disconnect() }
            twitch.configuration.adsEnabled = true
            twitch.configuration.streamTitle = "Test stream"

            for _ in 0..<100 where twitch.status != .live {
                try await Task.sleep(for: .milliseconds(10))
            }
            let adCommand = try XCTUnwrap(twitch.panelControls.first { $0.id == "twitch.commercial" }?.command)
            let started = await twitch.invokePanel(adCommand) { true }
            XCTAssertFalse(started)
            XCTAssertNil(twitch.panelControls.first { $0.id == "twitch.commercial" }?.command)
            XCTAssertEqual(twitch.panelControls.first { $0.id == "twitch.details" }?.enabled, remaining > 0)
            XCTAssertEqual(twitch.panelControls.first { $0.id == "twitch.marker" }?.enabled, remaining > 0)
        }
    }

    func testCanceledAuthorizationCannotClearNewDeviceCode() async throws {
        let suite = "TwitchBroadcastTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("exampleclient", forKey: "twitch.clientID")
        let service = DelayedDeviceCodes()
        let twitch = TwitchBroadcast(defaults: defaults, api: TwitchAPI { request in
            try await service.send(request)
        }, credentialStore: .init(load: { nil }, save: { _ in true }, remove: {}), monitorEvents: false)
        defer { twitch.cancelSignIn() }
        twitch.connect()
        for _ in 0..<100 {
            if await service.requestCount == 1 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        twitch.cancelSignIn()
        twitch.connect()
        for _ in 0..<100 where twitch.userCode == nil {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertEqual(twitch.userCode, "SECOND")
        await service.finishFirst()
        await Task.yield()
        XCTAssertEqual(twitch.userCode, "SECOND")
        XCTAssertTrue(twitch.connecting)
    }

    private actor DelayedDeviceCodes {
        private(set) var requestCount = 0
        private var release: CheckedContinuation<Void, Never>?

        func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
            let url = try XCTUnwrap(request.url)
            XCTAssertEqual(url.path, "/oauth2/device")
            requestCount += 1
            let number = requestCount
            if number == 1 {
                await withCheckedContinuation { release = $0 }
            }
            let code = number == 1 ? "FIRST" : "SECOND"
            let body = try JSONSerialization.data(withJSONObject: [
                "device_code": "private-code", "user_code": code, "verification_uri": "https://www.twitch.tv/activate",
                "expires_in": 300, "interval": 5,
            ])
            return (body, try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)))
        }

        func finishFirst() {
            release?.resume()
            release = nil
        }
    }

    private actor Requests {
        private(set) var winners = [String]()
        private var startedPrediction = false
        private let commercialRateLimitRemaining: Int?

        init(commercialRateLimitRemaining: Int? = nil) {
            self.commercialRateLimitRemaining = commercialRateLimitRemaining
        }

        func send(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
            let url = try XCTUnwrap(request.url)
            let body: String
            switch (url.path, request.httpMethod) {
            case ("/oauth2/validate", _):
                body = #"{"client_id":"exampleclient","user_id":"42","login":"streamer","scopes":["channel:manage:broadcast","clips:edit","channel:edit:commercial","channel:manage:polls","channel:manage:predictions"],"expires_in":900}"#
            case ("/helix/streams", _):
                body = #"{"data":[{"id":"stream","viewer_count":12,"started_at":"2026-11-17T11:00:00Z"}]}"#
            case ("/helix/channels", _):
                body = #"{"data":[{"title":"Tonight","game_id":"1","game_name":"Game","tags":[]}]}"#
            case ("/helix/users", _):
                let broadcasterType = commercialRateLimitRemaining == nil ? "" : "affiliate"
                body = #"{"data":[{"broadcaster_type":"\#(broadcasterType)","display_name":"Streamer"}]}"#
            case ("/helix/channels/commercial", "POST"):
                let remaining = try XCTUnwrap(commercialRateLimitRemaining)
                let response = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 429, httpVersion: nil,
                    headerFields: ["Ratelimit-Remaining": String(remaining), "Retry-After": "120"]))
                return (Data(), response)
            case ("/helix/predictions", "POST"):
                let data = try XCTUnwrap(request.httpBody)
                let update = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
                XCTAssertEqual(update["title"] as? String, "Who wins next?")
                startedPrediction = true
                fallthrough
            case ("/helix/predictions", _) where startedPrediction:
                body = #"{"data":[{"id":"prediction-2","title":"Who wins next?","status":"ACTIVE","outcomes":[{"id":"red","title":"Red Team"},{"id":"blue","title":"Blue Team"}]}]}"#
            case ("/helix/predictions", "PATCH"):
                let data = try XCTUnwrap(request.httpBody)
                let update = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: String])
                XCTAssertEqual(update["id"], "prediction")
                XCTAssertEqual(update["status"], "RESOLVED")
                winners.append(try XCTUnwrap(update["winning_outcome_id"]))
                fallthrough
            case ("/helix/predictions", _):
                body = winners.isEmpty
                    ? #"{"data":[{"id":"prediction","title":"Which team wins?","status":"LOCKED","outcomes":[{"id":"red","title":"Red Team"},{"id":"blue","title":"Blue Team"}]}]}"#
                    : #"{"data":[{"id":"prediction","title":"Which team wins?","status":"RESOLVED","outcomes":[]}]}"#
            case ("/oauth2/revoke", _):
                body = ""
            default:
                XCTFail("Unexpected request")
                throw URLError(.badServerResponse)
            }
            return (Data(body.utf8), try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)))
        }
    }
}
