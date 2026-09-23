import AppKit
import ApplicationServices

/// Uses the same menu commands as the green window control. Never substitutes
/// synthetic Fn events or custom window geometry when a command is unavailable.
enum CompanionNativeWindowAction {
    /// Resolve complete menu paths, including disabled/duplicate headings safely.
    /// Keeping traversal injectable lets tests exercise real failure conditions.
    static func resolve<Node>(
        paths: [[String]], roots: [Node],
        title: (Node) -> String, children: (Node) -> [Node],
        enabled: (Node) -> Bool
    ) -> Node? {
        for path in paths {
            var candidates = roots
            for (index, component) in path.enumerated() {
                let matches = candidates.filter { title($0) == component && enabled($0) }
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

    @MainActor
    static func perform(_ identifier: String) -> String? {
        guard let action = CompanionCapabilities.windowActions[identifier] else {
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
        // Preserve basic controls without depending on an app's shortcut bindings.
        if identifier == "window.hide" {
            return app.hide() ? nil : "The active app could not be hidden"
        }
        guard let window = element(application, kAXFocusedWindowAttribute) else {
            return "The active app has no accessible window"
        }
        switch identifier {
        case "window.close":
            guard let button = element(window, kAXCloseButtonAttribute),
                  AXUIElementPerformAction(button, kAXPressAction as CFString) == .success else {
                return "The active window cannot be closed"
            }
            return nil
        case "window.minimize":
            return AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanTrue) == .success
                ? nil : "The active window cannot be minimised"
        case "window.fullscreen", "window.fullscreen.enter", "window.fullscreen.exit":
            guard let fullScreen = attribute(window, "AXFullScreen") as? Bool else {
                return "The active window does not support full screen"
            }
            let target = identifier == "window.fullscreen" ? !fullScreen : identifier == "window.fullscreen.enter"
            if target == fullScreen { return nil }
            return AXUIElementSetAttributeValue(window, "AXFullScreen" as CFString,
                target ? kCFBooleanTrue : kCFBooleanFalse) == .success
                ? nil : "The active window could not change full screen mode"
        default: break
        }
        guard let menuBar = element(application, kAXMenuBarAttribute) else {
            return "The active app does not expose its Window menu"
        }
        let deadline = Date().addingTimeInterval(1)
        func children(_ node: AXUIElement) -> [AXUIElement] {
            guard Date() < deadline else { return [] }
            return (attribute(node, kAXChildrenAttribute) as? [AXUIElement] ?? []).flatMap { child in
                // AXMenu wraps each submenu; headings/items remain at their native level.
                if attribute(child, kAXRoleAttribute) as? String == kAXMenuRole {
                    return attribute(child, kAXChildrenAttribute) as? [AXUIElement] ?? []
                }
                return [child]
            }
        }
        guard let item = resolve(paths: action.menuPaths, roots: children(menuBar),
            title: { attribute($0, kAXTitleAttribute) as? String ?? "" },
            children: children,
            enabled: { attribute($0, kAXEnabledAttribute) as? Bool == true }), Date() < deadline else {
            return "This action is unavailable in the active app. Native layout cards currently require English Window menus."
        }
        // A menu read may take time. Do not act on the old app after focus changes.
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else {
            return "The active app changed; tap the window card again"
        }
        return AXUIElementPerformAction(item, kAXPressAction as CFString) == .success
            ? nil : "macOS could not perform this window action"
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
