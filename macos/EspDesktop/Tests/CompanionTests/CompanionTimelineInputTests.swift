import CoreGraphics
import Testing
@testable import Companion

struct CompanionTimelineInputTests {
    @Test func acceptsOnlyBoundedRelativeMovement() throws {
        for action in ["shortcut.timeline.jog.-4", "shortcut.timeline.jog.1", "shortcut.timeline.pan.80"] {
            #expect(CompanionTimelineInput(actionIdentifier: action) != nil)
        }
        for action in ["shortcut.scoped.left", "shortcut.timeline.jog.0", "shortcut.timeline.jog.5",
                       "shortcut.timeline.pan.-81", "shortcut.timeline.pan.+1", "shortcut.timeline.pan.01",
                       "shortcut.timeline.zoom.1", "shortcut.timeline.pan.1.more",
                       "shortcut.timeline.jog.-9223372036854775808"] {
            #expect(CompanionTimelineInput(actionIdentifier: action) == nil)
        }
    }

    @Test func panningUsesEachEditorsDocumentedScrollInput() throws {
        let movement = try #require(CompanionTimelineInput(actionIdentifier: "shortcut.timeline.pan.24"))
        let finalCut = try #require(movement.scrollEvent(for: .finalCut))
        #expect(finalCut.getIntegerValueField(.scrollWheelEventPointDeltaAxis2) == -24)
        #expect(finalCut.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == 0)

        let resolve = try #require(movement.scrollEvent(for: .resolve))
        #expect(resolve.flags == .maskCommand)
        #expect(resolve.getIntegerValueField(.scrollWheelEventDeltaAxis1) == -1)
        #expect(resolve.getIntegerValueField(.scrollWheelEventDeltaAxis2) == 0)
    }
}
