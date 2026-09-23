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
        let processIdentifier: pid_t
        let frame: CGRect

        var restoreKey: String { "\(processIdentifier):\(id)" }
    }

    private struct StoredFrame: Codable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double
        let bundleIdentifier: String?
        let windowIdentifier: String?
        let savedAt: Date?

        init(_ frame: CGRect, bundleIdentifier: String?, windowIdentifier: String?) {
            x = frame.minX
            y = frame.minY
            width = frame.width
            height = frame.height
            self.bundleIdentifier = bundleIdentifier
            self.windowIdentifier = windowIdentifier
            savedAt = Date()
        }

        var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
    }

    private static let restoreFramesDefaultsKey = "companion.window-arrangement.restore-frames.v1"
    private static var previousFrames = loadPreviousFrames()

    /// Returns nil for ordinary app shortcuts, and the result for a supported
    /// tiling action otherwise.
    static func perform(identifier: String) -> Bool? {
        guard let action = Action(identifier: identifier) else { return nil }
        guard ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 15 else { return false }
        guard CompanionAccessibilityAuthorizer.shared.isTrusted() else { return false }
        guard let windows = visibleWindows(), let active = windows.first else { return false }
        let screenWithMostWindowArea = NSScreen.screens.max(by: {
            intersectionArea(accessibilityFrame(for: $0.frame), active.frame)
                < intersectionArea(accessibilityFrame(for: $1.frame), active.frame)
        })
        let screen = screenWithMostWindowArea.flatMap {
            intersectionArea(accessibilityFrame(for: $0.frame), active.frame) > 0 ? $0 : nil
        } ?? NSScreen.main
        guard let screen else { return false }

        let desktop = accessibilityFrame(for: screen.visibleFrame)
        guard desktop.width > 0, desktop.height > 0 else { return false }

        if action == .restore {
            // A shortcut can be posted without macOS actually restoring the
            // window, so only report success for frames saved by our own tiling.
            guard let storedFrame = previousFrames[active.restoreKey] else { return false }
            guard let bundleIdentifier = applicationBundleIdentifier(for: active.processIdentifier),
                  storedFrame.bundleIdentifier == bundleIdentifier,
                  storedFrame.windowIdentifier == nil
                    || storedFrame.windowIdentifier == windowIdentifier(for: active.element) else {
                previousFrames.removeValue(forKey: active.restoreKey)
                savePreviousFrames()
                return false
            }
            let frame = storedFrame.rect
            let restoreScreen = NSScreen.screens.max(by: {
                intersectionArea(accessibilityFrame(for: $0.frame), frame)
                    < intersectionArea(accessibilityFrame(for: $1.frame), frame)
            }).flatMap {
                intersectionArea(accessibilityFrame(for: $0.frame), frame) > 0 ? $0 : nil
            } ?? screen
            let restoreDesktop = accessibilityFrame(for: restoreScreen.visibleFrame)
            let safeFrame: CGRect?
            if isReachable(frame, on: NSScreen.screens) {
                // Keep deliberately oversized or spanning frames intact when
                // enough of the window remains available on a connected display.
                safeFrame = frame
            } else {
                safeFrame = clampedFrame(frame, to: restoreDesktop)
            }
            guard let safeFrame,
                  canSetFrame(for: active.element), setFrame(safeFrame, for: active.element) else { return false }
            previousFrames.removeValue(forKey: active.restoreKey)
            savePreviousFrames()
            return true
        }

        let displayFrame = accessibilityFrame(for: screen.frame)
        let windowsOnScreen = windows.filter { window in
            let areaOnActiveScreen = intersectionArea(displayFrame, window.frame)
            guard areaOnActiveScreen > 0 else { return false }
            let largestScreenArea = NSScreen.screens.map {
                intersectionArea(accessibilityFrame(for: $0.frame), window.frame)
            }.max() ?? 0
            return areaOnActiveScreen >= largestScreenArea
        }
        let selected = Array(windowsOnScreen.prefix(action.requiredWindowCount))
        guard selected.count == action.requiredWindowCount else { return false }
        let frames = frames(for: action, in: desktop, currentFrame: active.frame)
        guard frames.count == selected.count else { return false }

        guard selected.allSatisfy({ canSetFrame(for: $0.element) }) else { return false }
        for (index, pair) in zip(selected, frames).enumerated() {
            let (window, frame) = pair
            guard setFrame(frame, for: window.element) else {
                // A failed size or position update can leave that window partly
                // changed, so restore it along with every earlier window.
                for rollbackWindow in selected.prefix(index + 1).reversed() {
                    _ = setFrame(rollbackWindow.frame, for: rollbackWindow.element)
                }
                return false
            }
        }

        for window in selected {
            guard let bundleIdentifier = applicationBundleIdentifier(for: window.processIdentifier) else { continue }
            let identifier = windowIdentifier(for: window.element)
            if let previousFrame = previousFrames[window.restoreKey],
               previousFrame.bundleIdentifier == bundleIdentifier,
               previousFrame.windowIdentifier == identifier {
                continue
            }
            previousFrames[window.restoreKey] = StoredFrame(
                window.frame,
                bundleIdentifier: bundleIdentifier,
                windowIdentifier: identifier
            )
        }
        savePreviousFrames()
        return true
    }

    private static func loadPreviousFrames() -> [String: StoredFrame] {
        guard let data = UserDefaults.standard.data(forKey: restoreFramesDefaultsKey),
              let storedFrames = try? JSONDecoder().decode([String: StoredFrame].self, from: data)
        else { return [:] }
        let expiryDate = Date().addingTimeInterval(-14 * 24 * 60 * 60)
        return storedFrames.compactMapValues { storedFrame in
            guard storedFrame.bundleIdentifier != nil,
                  let savedAt = storedFrame.savedAt,
                  savedAt >= expiryDate else { return nil }
            return storedFrame
        }
    }

    private static func savePreviousFrames() {
        guard let data = try? JSONEncoder().encode(previousFrames) else { return }
        UserDefaults.standard.set(data, forKey: restoreFramesDefaultsKey)
    }

    private static func applicationBundleIdentifier(for processIdentifier: pid_t) -> String? {
        NSRunningApplication(processIdentifier: processIdentifier)?.bundleIdentifier
    }

    private static func windowIdentifier(for element: AXUIElement) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXIdentifierAttribute as CFString, &value) == .success else { return nil }
        return value as? String
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
        var accessibilityWindowsByPID: [pid_t: [AXUIElement]] = [:]
        var usedAccessibilityIndicesByPID: [pid_t: Set<Int>] = [:]
        let activeInfo = available[activeIndex]
        usedIDs.insert(activeInfo.id)
        let frontmostPID = frontmost.processIdentifier
        accessibilityWindowsByPID[frontmostPID] = windows(for: frontmostPID)
        if let appWindows = accessibilityWindowsByPID[frontmostPID],
           let focusedIndex = appWindows.firstIndex(where: { CFEqual($0, focused) })
            ?? appWindows.indices.first(where: { index in
                guard let window = makeWindow(appWindows[index]) else { return false }
                return framesMatch(window.frame, focusedWindow.frame)
            }) {
            usedAccessibilityIndicesByPID[frontmostPID, default: []].insert(focusedIndex)
        }
        var result = [Window(element: focused, id: activeInfo.id, processIdentifier: frontmostPID, frame: focusedWindow.frame)]

        for info in available where !usedIDs.contains(info.id) {
            let appWindows = accessibilityWindowsByPID[info.pid] ?? windows(for: info.pid)
            accessibilityWindowsByPID[info.pid] = appWindows
            let usedIndices = usedAccessibilityIndicesByPID[info.pid, default: []]
            guard let matchIndex = appWindows.indices.first(where: { index in
                !usedIndices.contains(index)
                    && makeWindow(appWindows[index]).map { framesMatch($0.frame, info.frame) } == true
            }), let match = makeWindow(appWindows[matchIndex]) else { continue }
            usedIDs.insert(info.id)
            usedAccessibilityIndicesByPID[info.pid, default: []].insert(matchIndex)
            result.append(Window(element: match.element, id: info.id, processIdentifier: info.pid, frame: match.frame))
        }
        return result
    }

    private static func windows(for processIdentifier: pid_t) -> [AXUIElement] {
        let app = AXUIElementCreateApplication(processIdentifier)
        var appWindowsValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &appWindowsValue) == .success,
              let appWindows = appWindowsValue as? [AXUIElement] else { return [] }
        return appWindows
    }

    private static func makeWindow(_ element: AXUIElement) -> Window? {
        guard let position = pointAttribute(kAXPositionAttribute as CFString, of: element),
              let size = sizeAttribute(kAXSizeAttribute as CFString, of: element)
        else { return nil }
        return Window(element: element, id: 0, processIdentifier: 0, frame: CGRect(origin: position, size: size))
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

    private static func canSetFrame(for element: AXUIElement) -> Bool {
        var canSetSize = DarwinBoolean(false)
        var canSetPosition = DarwinBoolean(false)
        return AXUIElementIsAttributeSettable(element, kAXSizeAttribute as CFString, &canSetSize) == .success
            && canSetSize.boolValue
            && AXUIElementIsAttributeSettable(element, kAXPositionAttribute as CFString, &canSetPosition) == .success
            && canSetPosition.boolValue
    }

    private static func intersectionArea(_ first: CGRect, _ second: CGRect) -> CGFloat {
        let intersection = first.intersection(second)
        guard !intersection.isNull, !intersection.isEmpty else { return 0 }
        return intersection.width * intersection.height
    }

    private static func clampedFrame(_ frame: CGRect, to desktop: CGRect) -> CGRect? {
        guard desktop.width > 0, desktop.height > 0,
              frame.minX.isFinite, frame.minY.isFinite,
              frame.width.isFinite, frame.height.isFinite,
              frame.width > 0, frame.height > 0 else { return nil }
        let width = min(frame.width, desktop.width)
        let height = min(frame.height, desktop.height)
        let x = min(max(frame.minX, desktop.minX), desktop.maxX - width)
        let y = min(max(frame.minY, desktop.minY), desktop.maxY - height)
        return CGRect(x: x, y: y, width: width, height: height)
    }

    /// A window remains reachable when at least a 64-point square (or the
    /// whole window when it is smaller) is inside any connected display's
    /// visible area. This preserves spanning and intentionally offset frames
    /// while still recovering windows stranded by display changes.
    private static func isReachable(_ frame: CGRect, on screens: [NSScreen]) -> Bool {
        guard frame.minX.isFinite, frame.minY.isFinite,
              frame.width.isFinite, frame.height.isFinite,
              frame.width > 0, frame.height > 0 else { return false }
        let requiredWidth = min(64, frame.width)
        let requiredHeight = min(64, frame.height)
        return screens.contains { screen in
            let visibleFrame = accessibilityFrame(for: screen.visibleFrame)
            let intersection = frame.intersection(visibleFrame)
            return !intersection.isNull
                && intersection.width >= requiredWidth
                && intersection.height >= requiredHeight
        }
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
