import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

/// Performs macOS window tiling directly through Accessibility. macOS does not
/// reliably honour synthetic Fn-key events, which are the shortcuts Apple uses
/// for its built-in tiling commands.
@MainActor
enum CompanionWindowArrangement {
    private enum Action: Equatable {
        case fill, center, left, right, top, bottom, restore
        case leftRight, rightLeft, topBottom, bottomTop
        case leftQuarters, rightQuarters, topQuarters, bottomQuarters

        init?(identifier: String) {
            switch identifier {
            case "window.fill": self = .fill
            case "window.center": self = .center
            case "window.left": self = .left
            case "window.right": self = .right
            case "window.top": self = .top
            case "window.bottom": self = .bottom
            case "window.restore": self = .restore
            case "window.arrange.left-right": self = .leftRight
            case "window.arrange.right-left": self = .rightLeft
            case "window.arrange.top-bottom": self = .topBottom
            case "window.arrange.bottom-top": self = .bottomTop
            case "window.arrange.left-quarters": self = .leftQuarters
            case "window.arrange.right-quarters": self = .rightQuarters
            case "window.arrange.top-quarters": self = .topQuarters
            case "window.arrange.bottom-quarters": self = .bottomQuarters
            default: return nil
            }
        }

        var requiredWindowCount: Int {
            switch self {
            case .leftRight, .rightLeft, .topBottom, .bottomTop: 2
            case .leftQuarters, .rightQuarters, .topQuarters, .bottomQuarters: 3
            default: 1
            }
        }
    }

    private struct Window {
        let element: AXUIElement
        let id: CGWindowID
        let frame: CGRect
    }

    private static var previousFrames: [CGWindowID: CGRect] = [:]

    /// Returns nil for ordinary app shortcuts, and the result for a supported
    /// tiling action otherwise.
    static func perform(identifier: String) -> Bool? {
        guard let action = Action(identifier: identifier) else { return nil }
        guard ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 15 else { return false }
        guard CompanionAccessibilityAuthorizer.shared.isTrusted() else { return false }
        guard let windows = visibleWindows(), let active = windows.first,
              let screen = NSScreen.screens.first(where: {
                  accessibilityFrame(for: $0.frame).intersects(active.frame)
              }) ?? NSScreen.main
        else { return false }

        let desktop = accessibilityFrame(for: screen.visibleFrame)
        guard desktop.width > 0, desktop.height > 0 else { return false }

        if action == .restore {
            guard let frame = previousFrames.removeValue(forKey: active.id) else { return false }
            return setFrame(frame, for: active.element)
        }

        let selected = Array(windows.prefix(action.requiredWindowCount))
        guard selected.count == action.requiredWindowCount else { return false }
        for window in selected where previousFrames[window.id] == nil {
            previousFrames[window.id] = window.frame
        }

        let frames = frames(for: action, in: desktop, currentFrame: active.frame)
        guard frames.count == selected.count else { return false }
        for (window, frame) in zip(selected, frames) {
            guard setFrame(frame, for: window.element) else { return false }
        }
        return true
    }

    private static func visibleWindows() -> [Window]? {
        guard let frontmost = NSWorkspace.shared.frontmostApplication else { return nil }
        let application = AXUIElementCreateApplication(frontmost.processIdentifier)
        var focusedValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(application, kAXFocusedWindowAttribute as CFString, &focusedValue) == .success,
              let focusedValue,
              CFGetTypeID(focusedValue) == AXUIElementGetTypeID()
        else { return nil }
        let focused = focusedValue as! AXUIElement
        guard let active = makeWindow(focused) else { return nil }

        var result = [active]
        guard let windowInfo = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else {
            return result
        }
        var seen: Set<CGWindowID> = [active.id]
        for info in windowInfo {
            guard let idValue = info[kCGWindowNumber as String] as? NSNumber,
                  let pidValue = info[kCGWindowOwnerPID as String] as? NSNumber,
                  let layer = info[kCGWindowLayer as String] as? NSNumber, layer.intValue == 0,
                  let alpha = info[kCGWindowAlpha as String] as? NSNumber, alpha.doubleValue > 0
            else { continue }
            let id = CGWindowID(idValue.uint32Value)
            guard seen.insert(id).inserted else { continue }
            let app = AXUIElementCreateApplication(pidValue.int32Value)
            var appWindowsValue: CFTypeRef?
            guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &appWindowsValue) == .success,
                  let appWindows = appWindowsValue as? [AXUIElement],
                  let match = appWindows.first(where: { windowNumber(of: $0) == id }),
                  let window = makeWindow(match)
            else { continue }
            result.append(window)
        }
        return result
    }

    private static func makeWindow(_ element: AXUIElement) -> Window? {
        guard let id = windowNumber(of: element),
              let position = pointAttribute(kAXPositionAttribute as CFString, of: element),
              let size = sizeAttribute(kAXSizeAttribute as CFString, of: element)
        else { return nil }
        return Window(element: element, id: id, frame: CGRect(origin: position, size: size))
    }

    private static func windowNumber(of element: AXUIElement) -> CGWindowID? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXWindowNumberAttribute as CFString, &value) == .success,
              let number = value as? NSNumber else { return nil }
        return CGWindowID(number.uint32Value)
    }

    private static func pointAttribute(_ name: CFString, of element: AXUIElement) -> CGPoint? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name, &value) == .success,
              let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
        var point = CGPoint.zero
        guard AXValueGetValue(value as! AXValue, .cgPoint, &point) else { return nil }
        return point
    }

    private static func sizeAttribute(_ name: CFString, of element: AXUIElement) -> CGSize? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name, &value) == .success,
              let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
        var size = CGSize.zero
        guard AXValueGetValue(value as! AXValue, .cgSize, &size) else { return nil }
        return size
    }

    private static func setFrame(_ frame: CGRect, for element: AXUIElement) -> Bool {
        var frameSize = CGSize(width: frame.width, height: frame.height)
        var frameOrigin = CGPoint(x: frame.minX, y: frame.minY)
        guard let size = AXValueCreate(.cgSize, &frameSize),
              let point = AXValueCreate(.cgPoint, &frameOrigin) else { return false }
        guard AXUIElementSetAttributeValue(element, kAXSizeAttribute as CFString, size) == .success else { return false }
        return AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, point) == .success
    }

    /// AppKit screen coordinates use a bottom-left origin; Accessibility uses
    /// the top-left origin shared with the Core Graphics window list.
    private static func accessibilityFrame(for frame: CGRect) -> CGRect {
        let mainScreenHeight = NSScreen.screens.first(where: { $0.frame.origin == .zero })?.frame.maxY ?? frame.maxY
        return CGRect(x: frame.minX, y: mainScreenHeight - frame.maxY, width: frame.width, height: frame.height)
    }

    private static func frames(for action: Action, in desktop: CGRect, currentFrame: CGRect) -> [CGRect] {
        let halfWidth = desktop.width / 2
        let halfHeight = desktop.height / 2
        let left = CGRect(x: desktop.minX, y: desktop.minY, width: halfWidth, height: desktop.height)
        let right = CGRect(x: desktop.minX + halfWidth, y: desktop.minY, width: halfWidth, height: desktop.height)
        let top = CGRect(x: desktop.minX, y: desktop.minY, width: desktop.width, height: halfHeight)
        let bottom = CGRect(x: desktop.minX, y: desktop.minY + halfHeight, width: desktop.width, height: halfHeight)
        let topLeft = CGRect(x: desktop.minX, y: desktop.minY, width: halfWidth, height: halfHeight)
        let topRight = CGRect(x: desktop.minX + halfWidth, y: desktop.minY, width: halfWidth, height: halfHeight)
        let bottomLeft = CGRect(x: desktop.minX, y: desktop.minY + halfHeight, width: halfWidth, height: halfHeight)
        let bottomRight = CGRect(x: desktop.minX + halfWidth, y: desktop.minY + halfHeight, width: halfWidth, height: halfHeight)

        switch action {
        case .fill: [desktop]
        case .center:
            let width = min(currentFrame.width, desktop.width)
            let height = min(currentFrame.height, desktop.height)
            [CGRect(x: desktop.midX - width / 2, y: desktop.midY - height / 2, width: width, height: height)]
        case .left: [left]
        case .right: [right]
        case .top: [top]
        case .bottom: [bottom]
        case .restore: []
        case .leftRight: [left, right]
        case .rightLeft: [right, left]
        case .topBottom: [top, bottom]
        case .bottomTop: [bottom, top]
        case .leftQuarters: [left, topRight, bottomRight]
        case .rightQuarters: [right, topLeft, bottomLeft]
        case .topQuarters: [top, bottomLeft, bottomRight]
        case .bottomQuarters: [bottom, topLeft, topRight]
        }
    }
}
