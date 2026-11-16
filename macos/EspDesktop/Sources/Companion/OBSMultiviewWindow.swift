import AppKit
import ApplicationServices

/// OBS WebSocket can create a projector. macOS supplies the existing windows and focus controls.
@MainActor
enum OBSMultiviewWindow {
    enum Result { case raised, missing, unavailable }

    private static var titlesByResources: [URL: Set<String>] = [:]

    static func raiseExisting(bundleIdentifier: String) async -> Result {
        guard AXIsProcessTrusted(),
              let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first else {
            return .unavailable
        }
        let application = AXUIElementCreateApplication(app.processIdentifier)
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(application, kAXWindowsAttribute as CFString, &value) == .success,
              let windows = value as? [AXUIElement] else { return .unavailable }

        let titles = multiviewTitles(bundleURL: app.bundleURL)
        let projectors = windows.filter { window in
            guard let title = attribute(kAXTitleAttribute, of: window) as? String else { return false }
            return titles.contains(title)
        }
        guard let projector = projectors.first(where: { attribute("AXFullScreen", of: $0) as? Bool == true })
                ?? projectors.first else { return await selectFromDock(app, titles: titles) }

        if app.isHidden { app.unhide() }
        if attribute(kAXMinimizedAttribute, of: projector) as? Bool == true {
            AXUIElementSetAttributeValue(projector, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
        }
        AXUIElementSetAttributeValue(projector, kAXMainAttribute as CFString, kCFBooleanTrue)
        app.activate()
        let raised = AXUIElementPerformAction(projector, kAXRaiseAction as CFString)
        return raised == .success ? .raised : .unavailable
    }

    // AXWindows can omit windows in other Spaces. The running app's Dock menu lists those windows too.
    private static func selectFromDock(_ app: NSRunningApplication, titles: Set<String>) async -> Result {
        guard let bundleURL = app.bundleURL?.standardizedFileURL.resolvingSymlinksInPath(),
              let dock = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock").first else {
            return .unavailable
        }
        let dockElement = AXUIElementCreateApplication(dock.processIdentifier)
        guard let item = children(of: dockElement).flatMap({ children(of: $0) }).first(where: {
            let url = attribute(kAXURLAttribute, of: $0) as? URL
            return url?.standardizedFileURL.resolvingSymlinksInPath() == bundleURL
        }), AXUIElementPerformAction(item, kAXShowMenuAction as CFString) == .success else { return .unavailable }

        for _ in 0..<15 {
            if let menu = children(of: item).first(where: { attribute(kAXRoleAttribute, of: $0) as? String == kAXMenuRole }) {
                let items = children(of: menu)
                if !items.isEmpty {
                    let projector = items.first(where: {
                        guard let title = attribute(kAXTitleAttribute, of: $0) as? String else { return false }
                        return titles.contains(title)
                    })
                    if let projector, AXUIElementPerformAction(projector, kAXPressAction as CFString) == .success {
                        return .raised
                    }
                    AXUIElementPerformAction(menu, kAXCancelAction as CFString)
                    return projector == nil ? .missing : .unavailable
                }
            }
            try? await Task.sleep(for: .milliseconds(25))
        }
        if let menu = children(of: item).first(where: { attribute(kAXRoleAttribute, of: $0) as? String == kAXMenuRole }) {
            AXUIElementPerformAction(menu, kAXCancelAction as CFString)
        }
        return .unavailable
    }

    private static func children(of element: AXUIElement) -> [AXUIElement] {
        attribute(kAXChildrenAttribute, of: element) as? [AXUIElement] ?? []
    }

    private static func attribute(_ name: String, of element: AXUIElement) -> CFTypeRef? {
        var value: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
    }

    private static func multiviewTitles(bundleURL: URL?) -> Set<String> {
        let englishTitle = "Projector - Multiview"
        guard let bundleURL, let resources = Bundle(url: bundleURL)?.resourceURL else { return [englishTitle] }
        if let titles = titlesByResources[resources] { return titles }
        let locales = (try? FileManager.default.contentsOfDirectory(at: resources.appendingPathComponent("locale"),
            includingPropertiesForKeys: nil)) ?? []
        var titles: Set<String> = [englishTitle]
        for locale in locales where locale.pathExtension == "ini" {
            guard let definitions = try? String(contentsOf: locale, encoding: .utf8) else { continue }
            var projector = "Projector"
            var multiview = "Multiview"
            for line in definitions.split(whereSeparator: \.isNewline) {
                if line.hasPrefix("Projector.Title=") {
                    projector = String(line.dropFirst("Projector.Title=".count)).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
                } else if line.hasPrefix("Projector.Title.Multiview=") {
                    multiview = String(line.dropFirst("Projector.Title.Multiview=".count)).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
                }
            }
            titles.insert("\(projector) - \(multiview)")
        }
        titlesByResources[resources] = titles
        return titles
    }
}
