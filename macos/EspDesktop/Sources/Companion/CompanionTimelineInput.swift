import AppKit
import ApplicationServices
import CoreGraphics

struct CompanionTimelineInput: Equatable {
    static let prefix = "shortcut.timeline."
    static let capability = "timeline_controls"

    enum Editor: String {
        case finalCut = "com.apple.FinalCut"
        case resolve = "com.blackmagic-design.DaVinciResolve"
    }

    enum Mode: String {
        case jog, pan
    }

    let mode: Mode
    let amount: Int

    init?(actionIdentifier: String) {
        guard actionIdentifier.hasPrefix(Self.prefix) else { return nil }
        let fields = actionIdentifier.dropFirst(Self.prefix.count).split(separator: ".", omittingEmptySubsequences: false)
        guard fields.count == 2, let mode = Mode(rawValue: String(fields[0])),
              let amount = Int(fields[1]), fields[1] == String(amount), amount != 0 else { return nil }
        let limit = mode == .jog ? 4 : 80
        guard (-limit...limit).contains(amount) else { return nil }
        self.mode = mode
        self.amount = amount
    }

    @MainActor
    func post(to editor: Editor, processID: pid_t) -> Bool {
        guard CompanionAccessibilityAuthorizer.shared.isTrusted(),
              CGPreflightPostEventAccess(), !hasUnsafeFocus(in: processID),
              NSWorkspace.shared.frontmostApplication?.processIdentifier == processID else { return false }

        switch mode {
        case .jog:
            let key = amount < 0 ? "left" : "right"
            guard let stroke = CompanionKeyboardShortcut.scopedStrokes("scoped." + key)?.first else { return false }
            for _ in 0..<abs(amount) {
                guard NSWorkspace.shared.frontmostApplication?.processIdentifier == processID,
                      stroke.replay(to: processID) else { return false }
            }
        case .pan:
            guard let pointer = CGEvent(source: nil)?.location,
                  pointerBelongs(to: processID, at: pointer),
                  let event = scrollEvent(for: editor),
                  NSWorkspace.shared.frontmostApplication?.processIdentifier == processID else { return false }
            event.location = pointer
            event.post(tap: .cghidEventTap)
        }
        return true
    }

    func scrollEvent(for editor: Editor) -> CGEvent? {
        guard mode == .pan else { return nil }
        if editor == .resolve {
            // Resolve maps a modified vertical wheel to horizontal timeline panning.
            let wheelSteps = Int32(max(1, (abs(amount) + 12) / 24))
            let event = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1,
                                wheel1: amount > 0 ? -wheelSteps : wheelSteps, wheel2: 0, wheel3: 0)
            event?.flags = .maskCommand
            return event
        }
        return CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2,
                       wheel1: 0, wheel2: -Int32(amount), wheel3: 0)
    }

    private func hasUnsafeFocus(in processID: pid_t) -> Bool {
        let app = AXUIElementCreateApplication(processID)
        AXUIElementSetMessagingTimeout(app, 0.05)
        if let window = element(kAXFocusedWindowAttribute, of: app) {
            let subrole = attribute(kAXSubroleAttribute, of: window) as? String
            if subrole == kAXDialogSubrole || subrole == kAXSystemDialogSubrole { return true }
        }
        guard let focused = element(kAXFocusedUIElementAttribute, of: app) else { return false }
        let role = attribute(kAXRoleAttribute, of: focused) as? String
        return role == kAXTextFieldRole || role == kAXTextAreaRole ||
            role == kAXComboBoxRole || role == kAXSheetRole
    }

    private func element(_ name: String, of parent: AXUIElement) -> AXUIElement? {
        guard let value = attribute(name, of: parent), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }

    private func attribute(_ name: String, of element: AXUIElement) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }

    private func pointerBelongs(to processID: pid_t, at location: CGPoint) -> Bool {
        let system = AXUIElementCreateSystemWide()
        var target: AXUIElement?
        guard AXUIElementCopyElementAtPosition(system, Float(location.x), Float(location.y), &target) == .success,
              let target else { return false }
        var targetPID: pid_t = 0
        return AXUIElementGetPid(target, &targetPID) == .success && targetPID == processID
    }
}
