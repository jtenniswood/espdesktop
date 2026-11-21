import Foundation
import XCTest
@testable import Companion

final class CompanionUSBEditorTests: XCTestCase {
    func testOnlyEditorWritesAndAllowedHeadersCrossTheBridge() throws {
        XCTAssertNil(USBEditorRequest(method: "POST", path: "/api/v1/reset"))
        XCTAssertNil(USBEditorRequest(method: "POST", path: "/update"))
        XCTAssertNil(USBEditorRequest(method: "GET", path: "/events"))
        XCTAssertNil(USBEditorRequest(method: "GET", path: "//elsewhere.local/config"))
        XCTAssertNil(USBEditorRequest(method: "GET", path: "/companion/pairing?show_on_display=1"))
        let request = try XCTUnwrap(USBEditorRequest(method: "PUT", path: "/api/v1/config",
            headers: ["If-Match": "\"4-v2\"", "X-EspDesktop-Epoch": "12", "Host": "elsewhere.local",
                      "Content-Type": "x\r\nHost: bad"], body: Data([1, 2, 3])))
        let wire = String(decoding: request.wireBytes, as: UTF8.self)
        XCTAssertTrue(wire.hasPrefix("PUT /api/v1/config HTTP/1.0"))
        XCTAssertTrue(wire.contains("Host: 127.0.0.1"))
        XCTAssertTrue(wire.contains("x-espdesktop-epoch: 12"))
        XCTAssertFalse(wire.contains("elsewhere.local"))
        XCTAssertFalse(wire.contains("Host: bad"))
    }

    func testUSBSettingsActionsAreScopedToTheEditor() throws {
        for path in ["/api/v1/identity", "/button/Apply%20Configuration/press",
                     "/button/apply_configuration/press", "/light/display_backlight/turn_on?brightness=120"] {
            XCTAssertNotNil(USBEditorRequest(method: "POST", path: path), path)
        }
        XCTAssertNil(USBEditorRequest(method: "POST", path: "/button/factory_reset/press"))
        XCTAssertNil(USBEditorRequest(method: "POST", path: "/light/another_light/turn_on"))
        let homeAssistant = try XCTUnwrap(USBEditorRequest(method: "POST", path: "/api/v1/home-assistant",
            headers: ["X-EspDesktop-Request": "resync-buttons"]))
        XCTAssertEqual(homeAssistant.headers["x-espdesktop-request"], "resync-buttons")
        XCTAssertNotNil(USBEditorRequest(method: "POST", path: "/api/v1/screensaver-pin",
            body: Data(#"{"enabled":false,"pin":""}"#.utf8)))
        XCTAssertNil(USBEditorRequest(method: "POST", path: "/api/v1/screensaver-pin",
            body: Data(#"{"enabled":true,"pin":"1234"}"#.utf8)))
    }

    func testUSBWebSignInUsesNativeCredentialsAndIncrementsDigestCount() throws {
        let request = try XCTUnwrap(USBEditorRequest(method: "GET", path: "/api/v1/identity",
            headers: ["Authorization": "from-script"]))
        let credentials = USBEditorWebCredentials(username: "display", password: "example")
        let nonce = String(repeating: "ab", count: 16)
        let opaque = String(repeating: "cd", count: 16)
        let challenge = #"Digest realm="Login Required", qop="auth", algorithm=MD5, nonce="\#(nonce)", opaque="\#(opaque)""#
        var digest = try XCTUnwrap(USBEditorWebChallenge(challenge))
        let first = try XCTUnwrap(digest.authorization(for: request, credentials: credentials))
        XCTAssertTrue(first.contains("nc=00000001"))
        XCTAssertTrue(digest.authorization(for: request, credentials: credentials)?.contains("nc=00000002") == true)
        XCTAssertFalse(String(decoding: request.wireBytes, as: UTF8.self).contains("Authorization:"))
        XCTAssertTrue(String(decoding: request.wireBytes(authorization: first), as: UTF8.self).contains(first))
        XCTAssertTrue(USBEditorWebChallenge(challenge + ", stale=true")?.stale == true)
        XCTAssertNil(USBEditorWebChallenge("Bearer realm=\"display\""))
    }

    func testParsesAnIncrementalResponseAndKeepsTheGeneration() throws {
        let header = Data("HTTP/1.1 200 OK\r\nContent-Length: 3\r\nETag: \"4-v2\"\r\n\r\n".utf8)
        XCTAssertNil(try USBEditorResponse.parse(header + Data([1, 2]), ended: false))
        let response = try XCTUnwrap(USBEditorResponse.parse(header + Data([1, 2, 3]), ended: false))
        XCTAssertEqual(response.headers["etag"], "\"4-v2\"")
        XCTAssertEqual(response.body, Data([1, 2, 3]))

        let chunked = Data("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n".utf8)
        XCTAssertEqual(try USBEditorResponse.parse(chunked, ended: false)?.body, Data("abc".utf8))
    }

    func testWifiRouteAllowsOnlyExactStatusAndSettingRequests() {
        let path = USBEditorRequest.wifiPath
        XCTAssertNotNil(USBEditorRequest(method: "GET", path: path))
        XCTAssertNotNil(USBEditorRequest(method: "POST", path: path, body: Data("{\"enabled\":true}".utf8)))
        XCTAssertNil(USBEditorRequest(method: "POST", path: path + "?enabled=true"))
        XCTAssertNil(USBEditorRequest(method: "POST", path: path, body: Data(repeating: 0, count: 65)))
        XCTAssertNil(USBEditorRequest(method: "PUT", path: path))
    }

    func testAppleHomeRouteAcceptsOnlyAnExactPathAndEmptyBody() {
        let path = USBEditorRequest.appleHomePath
        XCTAssertNotNil(USBEditorRequest(method: "GET", path: path))
        XCTAssertNotNil(USBEditorRequest(method: "POST", path: path))
        XCTAssertNil(USBEditorRequest(method: "POST", path: path + "?connect=true"))
        XCTAssertNil(USBEditorRequest(method: "POST", path: path, body: Data([0])))
        XCTAssertNil(USBEditorRequest(method: "PUT", path: path))
    }

    func testDeviceEditorUsesOnlyAUsableLocalAddressReportedByTheDisplay() throws {
        func address(_ value: String) throws -> String? {
            let body = Data(#"{"ip_address":"\#(value)"}"#.utf8)
            return try JSONDecoder().decode(USBEditorPanelIdentity.self, from: body).localNetworkAddress
        }

        XCTAssertEqual(try address("192.168.6.100"), "192.168.6.100")
        for unusable in ["0.0.0.0", "127.0.0.1", "8.8.8.8", "screen.local", "192.168.6.100:80"] {
            XCTAssertNil(try address(unusable), unusable)
        }
    }

    func testDirectWiFiAddressReplyDistinguishesConnectedAndOfflineDisplays() {
        XCTAssertEqual(USBEditorPanelIdentity.localNetworkAddress(fromWiFiReply: Data([0, 192, 168, 6, 107])),
                       "192.168.6.107")
        for reply: [UInt8] in [[0], [3], [0, 0, 0, 0, 0], [0, 127, 0, 0, 1], [0, 8, 8, 8, 8]] {
            XCTAssertNil(USBEditorPanelIdentity.localNetworkAddress(fromWiFiReply: Data(reply)))
        }
    }

    func testAnInterruptedSaveOnlyRetriesAgainstItsOriginalGeneration() throws {
        let submitted = Data([7])
        let save = try XCTUnwrap(USBEditorRequest(method: "PUT", path: "/api/v1/config",
            headers: ["if-match": "\"4-v2\"", "x-panel-config-version": "2"], body: submitted))
        var current = USBEditorResponse(status: 200,
            headers: ["etag": "\"5-v2\"", "x-panel-config-version": "2"], body: submitted)
        XCTAssertEqual(current.decideInterruptedSave(save), .confirmed)
        current.body = Data([8])
        XCTAssertEqual(current.decideInterruptedSave(save), .conflict)
        current.headers["etag"] = "\"4-v2\""
        XCTAssertEqual(current.decideInterruptedSave(save), .retry)
        current.headers["x-panel-config-version"] = "1"
        XCTAssertEqual(current.decideInterruptedSave(save), .conflict)
    }
}
