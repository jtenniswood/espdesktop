import Network
import XCTest
@testable import Companion

final class AppleHomeSceneTests: XCTestCase {
    func testOneHomeIsSelectedAutomaticallyAndSeveralRequireAChoice() {
        let home = UUID(), other = UUID()
        XCTAssertEqual(AppleHomeSceneBindings.chooseHome(from: [home], withControls: [], saved: nil, explicit: false), home)
        XCTAssertNil(AppleHomeSceneBindings.chooseHome(from: [home, other], withControls: [home, other], saved: nil, explicit: false))
        XCTAssertEqual(AppleHomeSceneBindings.chooseHome(from: [home, other], withControls: [home, other], saved: other, explicit: false), other)
        XCTAssertEqual(AppleHomeSceneBindings.chooseHome(from: [other], withControls: [other], saved: home, explicit: true), other)
    }

    func testPopulatedHomeReplacesAnEmptyAutomaticSelectionButRespectsAnExplicitChoice() {
        let emptyHome = UUID(), populatedHome = UUID()
        let homes = [emptyHome, populatedHome]
        XCTAssertEqual(AppleHomeSceneBindings.chooseHome(from: homes, withControls: [populatedHome], saved: emptyHome, explicit: false), populatedHome)
        XCTAssertEqual(AppleHomeSceneBindings.chooseHome(from: homes, withControls: [populatedHome], saved: emptyHome, explicit: true), emptyHome)
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

        let approved = await scenes.statusForAction(slot: 1, account: "display.known") { true }
        let unapproved = await scenes.statusForAction(slot: 1, account: "display.other") { true }
        XCTAssertEqual(approved, "not_allowed")
        XCTAssertNil(unapproved)
    }

    @MainActor
    func testNativeHomeCardUsesItsReferenceAndFailsClosedWhenUnassigned() async {
        let scene = AppleHomeControl(id: UUID(), name: "Private Scene")
        XCTAssertEqual(AppleHomeControl.reference(for: scene.action), scene.id)
        XCTAssertNil(CompanionKeyboardShortcut(actionIdentifier: scene.action))
        let defaults = UserDefaults(suiteName: "AppleHomeSceneTests.\(UUID())")!
        let home = AppleHomeScenes(defaults: defaults)
        let status = await home.statusForCard(reference: scene.id, account: "display.unknown") { true }
        XCTAssertEqual(status, "not_allowed")
        XCTAssertTrue(home.cardActions(for: "display.unknown").isEmpty)
    }

    @MainActor
    func testEditorReadsUserLabelsFromTheSavedLayout() throws {
        let reference = UUID()
        let action = AppleHomeControl(id: reference, name: "Private scene name").action
        let source = """
        function appleHomeSavedCards(bytes) {
            return [
                {action: "\(action)", label: appleHomeDecodeUTF8(bytes)},
                {action: "\(action)", label: ""},
                {action: "\(action)", label: "x".repeat(81)},
                {action: "shortcut.command+a", label: "Unrelated card"}
            ];
        }
        """
        let layout = Data("  Café 🏠  ".utf8)
        let cards = try AppleHomeDeviceEditor.savedCards(in: layout, source: source)
        XCTAssertEqual(cards, [.init(reference: reference, label: "Café 🏠")])
    }
}
