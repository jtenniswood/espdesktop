import AppKit
import ApplicationServices

/// Performs explicit full-screen and Split View actions through macOS Accessibility.
@MainActor
enum CompanionNativeWindowAction {
    private static let supportedIdentifiers: Set<String> = [
        "window.fullscreen.enter",
        "window.fullscreen.exit",
        "window.split.left",
        "window.split.right",
    ]

    static func supports(_ identifier: String) -> Bool {
        supportedIdentifiers.contains(identifier)
    }

    /// Returns nil on success, otherwise a message suitable for the Companion status line.
    static func perform(_ identifier: String) -> String? {
        guard supports(identifier), let action = CompanionCapabilities.windowActions[identifier] else {
            return "Unknown window action"
        }
        guard ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= action.minimumMacOS else {
            return "This window action requires macOS \(action.minimumMacOS) or later"
        }
        guard CompanionAccessibilityAuthorizer.shared.isTrusted() else {
            return "Allow EspDesktop in Privacy & Security → Accessibility"
        }
        guard let app = NSWorkspace.shared.frontmostApplication else {
            return "No active Mac app"
        }

        let application = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(application, 0.2)

        if identifier == "window.fullscreen.enter" || identifier == "window.fullscreen.exit" {
            guard let window = element(application, kAXFocusedWindowAttribute) else {
                return "The active app has no accessible window"
            }
            guard let isFullScreen = attribute(window, "AXFullScreen") as? Bool else {
                return "The active window does not support full screen"
            }
            let shouldBeFullScreen = identifier == "window.fullscreen.enter"
            guard isFullScreen != shouldBeFullScreen else { return nil }
            let target: CFTypeRef = shouldBeFullScreen ? kCFBooleanTrue : kCFBooleanFalse
            return AXUIElementSetAttributeValue(window, "AXFullScreen" as CFString, target) == .success
                ? nil : "The active window could not change full-screen mode"
        }

        guard let menuBar = element(application, kAXMenuBarAttribute) else {
            return "The active app does not expose its Window menu"
        }
        let deadline = Date().addingTimeInterval(1)
        func children(of node: AXUIElement) -> [AXUIElement] {
            guard Date() < deadline,
                  let nodes = attribute(node, kAXChildrenAttribute) as? [AXUIElement] else { return [] }
            return nodes.flatMap { child in
                if attribute(child, kAXRoleAttribute) as? String == kAXMenuRole {
                    return attribute(child, kAXChildrenAttribute) as? [AXUIElement] ?? []
                }
                return [child]
            }
        }

        guard let item = resolve(
            paths: action.menuPaths,
            roots: children(of: menuBar),
            children: children,
            deadline: deadline
        ) else {
            return "Split View is unavailable for the active window"
        }
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else {
            return "The active app changed; tap the window card again"
        }
        return AXUIElementPerformAction(item, kAXPressAction as CFString) == .success
            ? nil : "macOS could not start Split View"
    }

    private static func resolve(
        paths: [[String]],
        roots: [AXUIElement],
        children: (AXUIElement) -> [AXUIElement],
        deadline: Date
    ) -> AXUIElement? {
        for path in paths where !path.isEmpty {
            var candidates = roots
            for (index, component) in path.enumerated() {
                guard Date() < deadline else { return nil }
                let matches = candidates.filter {
                    (attribute($0, kAXTitleAttribute) as? String) == component
                        && (attribute($0, kAXEnabledAttribute) as? Bool == true)
                }
                if index == path.count - 1 {
                    let leaves = matches.filter { children($0).isEmpty }
                    if leaves.count == 1 { return leaves[0] }
                } else {
                    candidates = matches.flatMap(children)
                }
            }
        }
        return nil
    }

    private static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }

    private static func element(_ parent: AXUIElement, _ name: String) -> AXUIElement? {
        guard let value = attribute(parent, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }
}
