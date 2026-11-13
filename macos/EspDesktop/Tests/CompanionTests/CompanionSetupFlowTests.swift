import XCTest
@testable import Companion

private final class PairingPromptURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, url.path == "/companion/pairing", url.query == "show_on_display=1",
              request.httpMethod == "GET", request.value(forHTTPHeaderField: "Accept") == "application/json" else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let status = url.host == "unsupported.local" ? 404 : 200
        let paired = url.host == "paired.local"
        let codeLength = url.host == "legacy.local" ? "" : ",\"code_length\":4"
        let payload = Data("{\"available\":true,\"active\":\(!paired),\"paired\":\(paired)\(codeLength)}".utf8)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: payload)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class CompanionSetupFlowTests: XCTestCase {
    func testDirectPairingRequestsTheAppropriateTouchscreenPrompt() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PairingPromptURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }

        let paired = await CompanionPairingPrompt.request(on: URL(string: "http://paired.local")!, session: session)
        let unpaired = await CompanionPairingPrompt.request(on: URL(string: "http://unpaired.local")!, session: session)
        let unsupported = await CompanionPairingPrompt.request(on: URL(string: "http://unsupported.local")!, session: session)
        let external = await CompanionPairingPrompt.request(on: URL(string: "http://example.com")!, session: session)

        let legacy = await CompanionPairingPrompt.request(on: URL(string: "http://legacy.local")!, session: session)
        XCTAssertEqual(paired, .reset(4))
        XCTAssertEqual(unpaired, .code(4))
        XCTAssertEqual(legacy, .code(8))
        XCTAssertEqual(unsupported, .unavailable)
        XCTAssertEqual(external, .unavailable)
    }

    func testNewSetupRequiresPairingBeforePreferences() {
        XCTAssertEqual(route(saved: false), .pairing)
        XCTAssertEqual(route(saved: false, pairing: true), .pairing)
        XCTAssertEqual(route(saved: true, pairing: true), .pairing, "Stay on pairing until the connection succeeds")
    }

    func testSuccessfulPairingGoesStraightToFinalAccessScreen() {
        XCTAssertEqual(CompanionSetupRoute.resolve(
            completed: false, showingHelp: false, hasSavedPairing: true,
            pairingInProgress: true, pairingConnected: true
        ), .preferences)
        XCTAssertEqual(CompanionSetupRoute.resolve(
            completed: true, showingHelp: false, hasSavedPairing: true,
            pairingInProgress: true, pairingConnected: true
        ), .settings, "Re-pairing must not restart first-run setup")
    }

    func testExistingPairingSkipsSetupEvenWithoutCompletionFlag() {
        XCTAssertEqual(route(saved: true), .settings)
        XCTAssertEqual(route(saved: true, completed: true), .settings)
        XCTAssertEqual(route(saved: false, completed: true), .settings, "Normal Settings still handles re-pairing")
        XCTAssertEqual(route(saved: false, help: true), .settings)
    }

    func testUpgradeRetainsPairingWithoutEnumeratingKeychain() {
        let pairing = CompanionPairingSelection.restore(host: "office.local", account: "192.168.6.100") {
            XCTFail("A known pairing must be retained even if Keychain is unavailable at launch")
            return []
        }
        XCTAssertEqual(pairing.host, "office.local")
        XCTAssertEqual(pairing.account, "192.168.6.100")
        XCTAssertEqual(route(saved: !pairing.account.isEmpty), .settings)
    }

    func testLegacyPairingRecoversAccountWhenOnlyAddressWasSaved() {
        let pairing = CompanionPairingSelection.restore(host: "office.local", account: nil) {
            ["192.168.6.100"]
        }
        XCTAssertEqual(pairing.host, "office.local")
        XCTAssertEqual(pairing.account, "192.168.6.100")
        XCTAssertEqual(route(saved: !pairing.account.isEmpty), .settings)
    }

    func testForgottenDisplayIsNotRestoredFromAStaleKeychainItem() {
        let pairing = CompanionPairingSelection.restore(host: "", account: nil) {
            XCTFail("An explicitly cleared display must not be recovered from Keychain")
            return ["office.local"]
        }
        XCTAssertEqual(pairing.host, "")
        XCTAssertEqual(pairing.account, "")
        XCTAssertEqual(route(saved: !pairing.account.isEmpty), .pairing)
    }

    private func route(saved: Bool, pairing: Bool = false, completed: Bool = false, help: Bool = false) -> CompanionSetupRoute {
        CompanionSetupRoute.resolve(completed: completed, showingHelp: help, hasSavedPairing: saved, pairingInProgress: pairing)
    }
}
