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
            paths: localizedMenuPaths(action.menuPaths),
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

    private static func localizedMenuPaths(_ paths: [[String]]) -> [[String]] {
        let appKitBundle = Bundle(for: NSMenu.self)
        guard let tableURL = appKitBundle.url(forResource: "MenuCommands", withExtension: "loctable"),
              let data = try? Data(contentsOf: tableURL),
              let table = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil)
                as? [String: [String: Any]] else {
            return paths
        }
        let translationsByLocalization = table.filter { $0.key != "LocProvenance" }.compactMapValues { values -> [String: String]? in
            guard !values.isEmpty else { return nil }
            return values.compactMapValues { $0 as? String }
        }
        return localizedMenuPaths(
            paths,
            translationsByLocalization: translationsByLocalization,
            preferredLocalizations: Locale.preferredLanguages
        )
    }

    static func localizedMenuPaths(
        _ paths: [[String]],
        translationsByLocalization: [String: [String: String]],
        preferredLocalizations: [String]
    ) -> [[String]] {
        let preferred = Bundle.preferredLocalizations(
            from: Array(translationsByLocalization.keys),
            forPreferences: preferredLocalizations
        )
        let localizations = preferred + translationsByLocalization.keys
            .filter { !preferred.contains($0) }
            .sorted()
        let localizedPaths = localizations.flatMap { localization in
            paths.map { path in
                path.map { translationsByLocalization[localization]?[$0] ?? $0 }
            }
        }
        // Apps can use a per-app macOS language that differs from EspDesktop's.
        // Try every AppKit localization before English paths for third-party menus.
        var seen = Set<[String]>()
        return (localizedPaths + paths).filter { seen.insert($0).inserted }
    }

    private static func resolve(
        paths: [[String]],
        roots: [AXUIElement],
        children: (AXUIElement) -> [AXUIElement],
        deadline: Date
    ) -> AXUIElement? {
        let maxDepth = paths.map(\.count).max() ?? 0
        func find(in candidates: [AXUIElement], depth: Int) -> AXUIElement? {
            guard depth < maxDepth, Date() < deadline else { return nil }
            let pathsAtDepth = paths.filter { $0.count > depth }
            let titles = Set(pathsAtDepth.map { $0[depth] })
            let leafTitles = Set(paths.filter { $0.count == depth + 1 }.compactMap(\.last))
            for candidate in candidates {
                guard Date() < deadline,
                      let title = attribute(candidate, kAXTitleAttribute) as? String,
                      titles.contains(title),
                      attribute(candidate, kAXEnabledAttribute) as? Bool == true else { continue }
                let candidateChildren = children(candidate)
                if leafTitles.contains(title), candidateChildren.isEmpty {
                    return candidate
                }
                if let match = find(in: candidateChildren, depth: depth + 1) {
                    return match
                }
            }
            return nil
        }
        return find(in: roots, depth: 0)
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
