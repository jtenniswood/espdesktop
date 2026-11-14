import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

@MainActor
final class CompanionAccessibilityAuthorizer {
    static let shared = CompanionAccessibilityAuthorizer(
        isProcessTrusted: AXIsProcessTrusted,
        openSettings: {
            guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") else { return }
            NSWorkspace.shared.open(url)
        },
        requestPrompt: {
            let prompt = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(prompt)
        }
    )

    private let isProcessTrusted: () -> Bool
    private let requestPrompt: () -> Void
    private let openSettings: () -> Void
    private var didRequestPrompt = false

    init(isProcessTrusted: @escaping () -> Bool, openSettings: @escaping () -> Void = {}, requestPrompt: @escaping () -> Void) {
        self.isProcessTrusted = isProcessTrusted
        self.requestPrompt = requestPrompt
        self.openSettings = openSettings
    }

    /// Read permission status without prompting merely because settings opened.
    var hasAccess: Bool { isProcessTrusted() }

    /// Explicit user requests always reach Settings, even after the first prompt.
    func requestAccess() {
        _ = isTrusted()
        openSettings()
    }

    func isTrusted() -> Bool {
        guard !isProcessTrusted() else { return true }
        if !didRequestPrompt {
            didRequestPrompt = true
            requestPrompt()
        }
        return false
    }
}

struct CompanionKeyboardShortcut {
    static let actionPrefix = "shortcut."
    static let installedWebAppActionPrefix = "shortcut.@"
    static let scopedPrefix = "scoped."

    static func scopedStrokes(_ keys: String) -> [Self]? {
        guard keys.hasPrefix(scopedPrefix), keys.utf8.count <= 87 else { return nil }
        let parts = keys.dropFirst(scopedPrefix.count).split(separator: "~", omittingEmptySubsequences: false)
        guard (1...3).contains(parts.count) else { return nil }
        let strokes = parts.compactMap { Self(keys: String($0), scoped: true) }
        return strokes.count == parts.count ? strokes : nil
    }

    static func scopedTargetMatches(_ expected: String, frontmost: String,
                                    approved: Set<String>) -> Bool {
        guard approved.contains(frontmost) else { return false }
        if expected == frontmost { return true }
        if expected == safariWebAppTemplate { return frontmost != safariBundleIdentifier && isSafariApplication(frontmost) }
        let premiere = "com.adobe.PremierePro"
        return expected == premiere && frontmost.range(of: #"^com\.adobe\.PremierePro\.[0-9]+$"#,
                                                      options: .regularExpression) != nil
    }
    static let claudeDesktopBundleIdentifier = "com.anthropic.claudefordesktop"
    private static let claudeEscapeShortcut = "claude-escape"
    static let claudeRewindShortcut = "escape-twice"

    static func isClaudeScopedShortcut(_ keys: String) -> Bool {
        switch keys {
        case "f6", "shift+f6", claudeEscapeShortcut, claudeRewindShortcut, "up", "down": return true
        default: return keys.utf8.count == 1 && ("1"..."9").contains(keys)
        }
    }

    private static let safariBundleIdentifier = "com.apple.Safari"
    private static let safariWebAppTemplate = "com.apple.Safari.WebApp"

    static func isSafariUnmodifiedShortcut(_ shortcut: String) -> Bool {
        shortcut == "tab" || shortcut == "escape"
    }

    static func isSafariTemplate(_ appId: String) -> Bool {
        appId == safariBundleIdentifier || appId == safariWebAppTemplate
    }

    static func isSafariApplication(_ appId: String?) -> Bool {
        guard let appId else { return false }
        if appId == safariBundleIdentifier { return true }
        let prefix = safariWebAppTemplate + "."
        return appId.hasPrefix(prefix) && UUID(uuidString: String(appId.dropFirst(prefix.count))) != nil
    }

    static func installedWebAppShortcut(
        _ actionIdentifier: String, frontmostBundleIdentifier: String?,
        approvedBundleIdentifiers: Set<String>
    ) -> Self? {
        guard actionIdentifier.hasPrefix(installedWebAppActionPrefix) else { return nil }
        let parts = actionIdentifier.dropFirst(installedWebAppActionPrefix.count)
            .split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2, let bundleIdentifier = frontmostBundleIdentifier,
              parts[0] == bundleIdentifier, !isSafariTemplate(bundleIdentifier),
              isSafariApplication(bundleIdentifier), approvedBundleIdentifiers.contains(bundleIdentifier) else { return nil }
        return Self(actionIdentifier: actionPrefix + parts[1])
    }

    static let booksBundleIdentifier = "com.apple.iBooksX"
    static let chatGPTDesktopBundleIdentifier = "com.openai.codex"
    static let chatGPTClearUnreads = "shift+escape"

    static func isBooksExtendedShortcut(_ shortcut: String) -> Bool {
        booksExtendedKeys[shortcut] != nil
    }

    private static let booksExtendedKeys: [String: (key: String, flags: CGEventFlags)] = [
        "left": ("left", []),
        "right": ("right", []),
        "space": ("space", []),
        "function+f": ("f", [.maskSecondaryFn]),
    ]

    let keyCode: CGKeyCode
    let flags: CGEventFlags

    private init(keyCode: CGKeyCode, flags: CGEventFlags) {
        self.keyCode = keyCode
        self.flags = flags
    }

    init?(actionIdentifier: String) {
        guard actionIdentifier.hasPrefix(Self.actionPrefix) else { return nil }
        let keys = String(actionIdentifier.dropFirst(Self.actionPrefix.count))
        if let extended = Self.booksExtendedKeys[keys], let keyCode = Self.keyCodes[extended.key] {
            self.init(keyCode: keyCode, flags: extended.flags)
            return
        }
        if Self.isClaudeScopedShortcut(keys) {
            let key = if keys == Self.claudeEscapeShortcut || keys == Self.claudeRewindShortcut {
                "escape"
            } else {
                keys.replacingOccurrences(of: "shift+", with: "")
            }
            guard let keyCode = Self.keyCodes[key] else { return nil }
            self.init(keyCode: keyCode, flags: keys == "shift+f6" ? .maskShift : [])
            return
        }
        if keys == Self.chatGPTClearUnreads, let keyCode = Self.keyCodes["escape"] {
            self.init(keyCode: keyCode, flags: .maskShift)
            return
        }
        self.init(keys: keys, scoped: false)
    }

    private init?(keys: String, scoped: Bool) {
        var parts = keys.split(separator: "+", omittingEmptySubsequences: false)
        guard parts.count <= (scoped ? 6 : 5), let key = parts.popLast().map(String.init),
              let keyCode = Self.keyCodes[key], scoped || !key.hasPrefix("keypad") else { return nil }

        var flags: CGEventFlags = []
        var seen = Set<Substring>()
        for modifier in parts {
            guard seen.insert(modifier).inserted else { return nil }
            switch modifier {
            case "command": flags.insert(.maskCommand)
            case "control": flags.insert(.maskControl)
            case "option": flags.insert(.maskAlternate)
            case "shift": flags.insert(.maskShift)
            case "function" where scoped: flags.insert(.maskSecondaryFn)
            default: return nil
            }
        }
        guard scoped || (parts.isEmpty && Self.isSafariUnmodifiedShortcut(key)) ||
              flags.contains(.maskCommand) || flags.contains(.maskControl) || flags.contains(.maskAlternate) else {
            return nil
        }
        self.keyCode = keyCode
        self.flags = key.hasPrefix("keypad") ? flags.union(.maskNumericPad) : flags
    }

    @MainActor
    func replay(to processID: pid_t? = nil) -> Bool {
        guard CompanionAccessibilityAuthorizer.shared.isTrusted() else { return false }
        guard let source = CGEventSource(stateID: .hidSystemState),
              let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
              let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) else {
            return false
        }
        keyDown.flags = flags
        keyUp.flags = flags
        if let processID {
            keyDown.postToPid(processID)
            keyUp.postToPid(processID)
        } else {
            keyDown.post(tap: .cghidEventTap)
            keyUp.post(tap: .cghidEventTap)
        }
        return true
    }

    private static let keyCodes: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7,
        "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15,
        "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
        "5": 23, "keyequal": 24, "9": 25, "7": 26, "keyminus": 27, "8": 28,
        "0": 29, "keybracketright": 30, "o": 31, "u": 32, "keybracketleft": 33,
        "i": 34, "p": 35, "enter": 36, "l": 37, "j": 38, "keyquote": 39,
        "k": 40, "keysemicolon": 41, "keybackslash": 42, "keycomma": 43, "keyslash": 44,
        "n": 45, "m": 46, "keyperiod": 47, "tab": 48, "space": 49,
        "keybackquote": 50, "delete": 51, "escape": 53, "forwarddelete": 117,
        "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
        "left": 123, "right": 124, "down": 125, "up": 126,
        "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96,
        "f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109,
        "f11": 103, "f12": 111, "f13": 105, "f14": 107, "f15": 113,
        "f16": 106, "f17": 64, "f18": 79, "f19": 80, "f20": 90,
        "keypad0": 82, "keypad1": 83, "keypad2": 84, "keypad3": 85, "keypad4": 86,
        "keypad5": 87, "keypad6": 88, "keypad7": 89, "keypad8": 91, "keypad9": 92,
        "keypadplus": 69, "keypadminus": 78, "keypadmultiply": 67, "keypaddivide": 75,
        "keypaddecimal": 65, "keypadequal": 81, "keypadenter": 76, "keypadclear": 71,
    ]
}
