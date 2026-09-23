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
        guard let focusedWindow = makeWindow(focused),
              let windowInfo = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else { return nil }

        var available: [(id: CGWindowID, pid: pid_t, frame: CGRect)] = []
        for info in windowInfo {
            guard let idValue = info[kCGWindowNumber as String] as? NSNumber,
                  let pidValue = info[kCGWindowOwnerPID as String] as? NSNumber,
                  let layer = info[kCGWindowLayer as String] as? NSNumber, layer.intValue == 0,
                  let alpha = info[kCGWindowAlpha as String] as? NSNumber, alpha.doubleValue > 0,
                  let bounds = info[kCGWindowBounds as String] as? NSDictionary,
                  let frame = CGRect(dictionaryRepresentation: bounds)
            else { continue }
            let id = CGWindowID(idValue.uint32Value)
            available.append((id, pid_t(pidValue.int32Value), frame))
        }

        guard let activeIndex = available.firstIndex(where: {
            $0.pid == frontmost.processIdentifier && framesMatch($0.frame, focusedWindow.frame)
        }) else { return nil }
        var usedIDs: Set<CGWindowID> = []
        let activeInfo = available[activeIndex]
        usedIDs.insert(activeInfo.id)
        var result = [Window(element: focused, id: activeInfo.id, frame: focusedWindow.frame)]

        for info in available where !usedIDs.contains(info.id) {
            let app = AXUIElementCreateApplication(info.pid)
            var appWindowsValue: CFTypeRef?
            guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &appWindowsValue) == .success,
                  let appWindows = appWindowsValue as? [AXUIElement],
                  let match = appWindows.lazy.compactMap(makeWindow).first(where: { framesMatch($0.frame, info.frame) })
            else { continue }
            usedIDs.insert(info.id)
            result.append(Window(element: match.element, id: info.id, frame: match.frame))
        }
        return result
    }

    private static func makeWindow(_ element: AXUIElement) -> Window? {
        guard let position = pointAttribute(kAXPositionAttribute as CFString, of: element),
              let size = sizeAttribute(kAXSizeAttribute as CFString, of: element)
        else { return nil }
        return Window(element: element, id: 0, frame: CGRect(origin: position, size: size))
    }

    private static func framesMatch(_ first: CGRect, _ second: CGRect) -> Bool {
        abs(first.minX - second.minX) < 2 && abs(first.minY - second.minY) < 2 &&
            abs(first.width - second.width) < 2 && abs(first.height - second.height) < 2
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
        case .fill: return [desktop]
        case .center:
            let width = min(currentFrame.width, desktop.width)
            let height = min(currentFrame.height, desktop.height)
            return [CGRect(x: desktop.midX - width / 2, y: desktop.midY - height / 2, width: width, height: height)]
        case .left: return [left]
        case .right: return [right]
        case .top: return [top]
        case .bottom: return [bottom]
        case .restore: return []
        case .leftRight: return [left, right]
        case .rightLeft: return [right, left]
        case .topBottom: return [top, bottom]
        case .bottomTop: return [bottom, top]
        case .leftQuarters: return [left, topRight, bottomRight]
        case .rightQuarters: return [right, topLeft, bottomLeft]
        case .topQuarters: return [top, bottomLeft, bottomRight]
        case .bottomQuarters: return [bottom, topLeft, topRight]
        }
    }
}
