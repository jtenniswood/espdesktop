import Network
import XCTest
@testable import Companion

final class AppleHomeSceneTests: XCTestCase {
    func testOneHomeIsSelectedAutomaticallyAndSeveralRequireAChoice() {
        let home = UUID(), other = UUID()
        XCTAssertEqual(AppleHomeSceneBindings.chooseHome(from: [home], saved: nil), home)
        XCTAssertNil(AppleHomeSceneBindings.chooseHome(from: [home, other], saved: nil))
        XCTAssertEqual(AppleHomeSceneBindings.chooseHome(from: [home, other], saved: other), other)
        XCTAssertNil(AppleHomeSceneBindings.chooseHome(from: [other], saved: home))
    }

    func testDeletedSceneDoesNotReassignItsTile() {
        let first = UUID(), second = UUID(), third = UUID()
        var bindings = AppleHomeSceneBindings()
        bindings.discover([first, second])
        bindings.discover([third, second])

        XCTAssertNil(bindings.scene(at: 1, available: [second, third]))
        XCTAssertEqual(bindings.scene(at: 2, available: [second, third]), second)
        XCTAssertEqual(bindings.scene(at: 3, available: [second, third]), third)
    }

    func testBindingsAndActionIdentifiersRespectTheLimit() {
        var bindings = AppleHomeSceneBindings()
        let scenes = (0..<10).map { _ in UUID() }
        bindings.discover(scenes)
        XCTAssertEqual(bindings.sceneIDs, Array(scenes.prefix(8)))
        for slot in 1...8 {
            let action = AppleHomeSceneBindings.action(for: slot)
            XCTAssertEqual(AppleHomeSceneBindings.slot(for: action), slot)
            XCTAssertNotNil(CompanionKeyboardShortcut(actionIdentifier: action))
        }
        XCTAssertNil(AppleHomeSceneBindings.slot(for: AppleHomeSceneBindings.action(for: 9)))
        XCTAssertNil(AppleHomeSceneBindings.slot(for: "shortcut.command+1"))
    }

    @MainActor
    func testDisconnectedHelperKeepsApprovedActionsFromSendingKeys() async {
        let suite = "AppleHomeSceneTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(["display.known": UUID().uuidString], forKey: "appleHome.approvedDisplays")
        let scenes = AppleHomeScenes(defaults: defaults)

        let approved = await scenes.statusForAction(slot: 1, account: "display.known", isUnlocked: true)
        let unapproved = await scenes.statusForAction(slot: 1, account: "display.other", isUnlocked: true)
        XCTAssertEqual(approved, "not_allowed")
        XCTAssertNil(unapproved)
    }

    @MainActor
    func testLayoutJavascriptCanRoundTripUTF8() throws {
        let input = Data("Café 🏠".utf8)
        let source = """
        function buildAppleHomePage(bytes) {
          return appleHomeEncodeUTF8(appleHomeDecodeUTF8(bytes));
        }
        """
        XCTAssertEqual(try AppleHomePageInstaller.generate(input: input, source: source), input)
    }

    @MainActor
    func testConcurrentLayoutChangeIsReportedWithNoBlindRetry() async throws {
        let panel = try XCTUnwrap(URL(string: "http://espdesktop.local"))
        var requests: [URLRequest] = []
        do {
            _ = try await AppleHomePageInstaller.install(at: panel, source: "function buildAppleHomePage() { return [2]; }") { request in
                requests.append(request)
                let headers = ["X-Panel-Config-Version": "2", "ETag": "\"v2-4\""]
                let response = try XCTUnwrap(HTTPURLResponse(url: request.url!,
                    statusCode: request.httpMethod == "PUT" ? 409 : 200, httpVersion: nil, headerFields: headers))
                let data = request.url?.path == "/api/v1/reset" ? Data(#"{"epoch":2,"pending":false}"#.utf8) : Data([1])
                return (data, response)
            }
            XCTFail("Expected the concurrent edit to be reported")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("layout changed"))
        }
        XCTAssertEqual(requests.count, 3)
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "X-EspDesktop-Epoch"), "2")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "If-Match"), "\"v2-4\"")
        XCTAssertEqual(requests.last?.httpBody, Data([2]))
    }
}
