import AppKit
import CoreGraphics

// Notifications give prompt updates; polling repairs missed notifications and
// reads the current state when the app starts or the display reconnects.
@MainActor
final class MacSessionLockMonitor: NSObject {
    var onChange: ((Bool) -> Void)?
    private(set) var locked = false
    private let readLock: @MainActor () -> Bool?
    private var started = false

    init(readLock: @escaping @MainActor () -> Bool? = MacSessionLockMonitor.currentLock) {
        self.readLock = readLock
        super.init()
    }

    static func currentLock() -> Bool? {
        guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else { return nil }
        // macOS omits the lock key for an unlocked session. An inactive user
        // session is also locked from this display's point of view.
        return (session["CGSSessionScreenIsLocked"] as? Bool ?? false)
            || (session[kCGSessionOnConsoleKey as String] as? Bool == false)
    }

    func start() {
        guard !started else { return }
        started = true
        for name in ["com.apple.screenIsLocked", "com.apple.screenIsUnlocked"] {
            DistributedNotificationCenter.default().addObserver(
                self, selector: #selector(sessionChanged), name: .init(name), object: nil,
                suspensionBehavior: .deliverImmediately
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

    @objc private func sessionChanged() { refresh() }

    @discardableResult
    func refresh() -> Bool {
        // An unavailable WindowServer snapshot must not clear a known lock.
        if let current = readLock(), current != locked {
            locked = current
            onChange?(locked)
        }
        return locked
    }
}
