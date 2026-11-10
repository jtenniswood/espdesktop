import AppKit
import CoreGraphics

// Notifications give prompt updates; polling repairs missed notifications and
// reads the current state when the app starts or the display reconnects.
@MainActor
final class MacSessionLockMonitor: NSObject {
    var onChange: ((Bool, Bool?) -> Void)?
    private(set) var locked = false
    private(set) var displayAwake: Bool?
    private let readLock: @MainActor () -> Bool?
    private let readDisplayAwake: @MainActor () -> Bool?
    private var started = false

    init(
        readLock: @escaping @MainActor () -> Bool? = MacSessionLockMonitor.currentLock,
        readDisplayAwake: @escaping @MainActor () -> Bool? = MacSessionLockMonitor.currentDisplayAwake
    ) {
        self.readLock = readLock
        self.readDisplayAwake = readDisplayAwake
        super.init()
    }

    static func currentLock() -> Bool? {
        guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else { return nil }
        // macOS omits the lock key for an unlocked session. An inactive user
        // session is also locked from this display's point of view.
        return (session["CGSSessionScreenIsLocked"] as? Bool ?? false)
            || (session[kCGSessionOnConsoleKey as String] as? Bool == false)
    }

    static func currentDisplayAwake() -> Bool? {
        var count: UInt32 = 0
        guard CGGetOnlineDisplayList(0, nil, &count) == .success else { return nil }
        guard count > 0 else { return false }
        var displays = [CGDirectDisplayID](repeating: 0, count: Int(count))
        guard CGGetOnlineDisplayList(count, &displays, &count) == .success else { return nil }
        return displays.prefix(Int(count)).contains { CGDisplayIsAsleep($0) == 0 }
    }

    func start() {
        guard !started else { return }
        started = true
        for name in ["com.apple.screenIsLocked", "com.apple.screenIsUnlocked"] {
            DistributedNotificationCenter.default().addObserver(
                self, selector: #selector(sessionChanged(_:)), name: .init(name), object: nil,
                suspensionBehavior: .deliverImmediately
            )
        }
        let workspace = NSWorkspace.shared
        for name in [NSWorkspace.screensDidSleepNotification, NSWorkspace.screensDidWakeNotification] {
            workspace.notificationCenter.addObserver(
                self, selector: #selector(sessionChanged(_:)), name: name, object: workspace
            )
        }
        refresh()
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            let alive = MainActor.assumeIsolated {
                guard let self else { return false }
                self.refresh()
                return true
            }
            if !alive { timer.invalidate() }
        }
    }

    @objc private func sessionChanged(_ notification: Notification) { refresh() }

    @discardableResult
    func refresh() -> Bool {
        // An unavailable WindowServer snapshot must not clear a known lock.
        let currentLock = readLock() ?? locked
        let currentDisplay = currentLock ? (readDisplayAwake() ?? displayAwake) : nil
        if currentLock != locked || currentDisplay != displayAwake {
            locked = currentLock
            displayAwake = currentDisplay
            onChange?(locked, displayAwake)
        }
        return locked
    }
}
