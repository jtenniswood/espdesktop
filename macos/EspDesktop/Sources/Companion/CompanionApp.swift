import AppKit
import Combine
import Darwin
import SwiftUI

@main
struct CompanionApp: App {
    @NSApplicationDelegateAdaptor(CompanionApplicationDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            CompanionSettings(store: appDelegate.store)
                .frame(minWidth: 500, minHeight: 500)
                .background(WindowRestorationDisabler().frame(width: 0, height: 0))
        }
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About EspDesktop") {
                    NSApp.orderFrontStandardAboutPanel(nil)
                }
            }
            CommandGroup(replacing: .appSettings) {
                Button("Settings") { appDelegate.openCompanionWindow() }
                    .keyboardShortcut(",", modifiers: .command)
            }
            CompanionUpdateCommands(updater: appDelegate.store.updater)
        }
    }
}

private struct CompanionUpdateCommands: Commands {
    @ObservedObject var updater: CompanionUpdater

    var body: some Commands {
        CommandGroup(after: .appSettings) {
            Button("Check for Updates…") { updater.check() }
                .disabled(updater.isChecking)
        }
    }
}

private struct WindowRestorationDisabler: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        WindowRestorationMarkerView(frame: .zero)
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

private final class WindowRestorationMarkerView: NSView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { return }
        window.isRestorable = false
        // The app presents its own AppKit settings window; this scene window is redundant.
        DispatchQueue.main.async { [weak window] in window?.close() }
    }
}

@MainActor
final class CompanionApplicationDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSMenuItemValidation, NSWindowDelegate {
    private static let ipcIdentifier = "io.espdesktop.app"
    private static let openSettingsNotification = Notification.Name(
        "\(ipcIdentifier).open-settings"
    )
    let store = CompanionStore()
    private var statusItem: NSStatusItem?
    private var connectionObservation: AnyCancellable?
    private var instanceLockFileDescriptor: Int32 = -1
    private var settingsWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard acquireInstanceLock() else {
            DistributedNotificationCenter.default().postNotificationName(
                Self.openSettingsNotification,
                object: nil,
                userInfo: nil,
                deliverImmediately: true
            )
            NSApp.terminate(nil)
            return
        }
        DistributedNotificationCenter.default().addObserver(
            self,
            selector: #selector(existingInstanceWasOpened),
            name: Self.openSettingsNotification,
            object: nil
        )
        NSApp.setActivationPolicy(.accessory)
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem = item
        if let button = item.button {
            button.toolTip = "EspDesktop"
        }
        item.menu = NSMenu()
        item.menu?.delegate = self
        updateStatusItemImage(connected: false)
        connectionObservation = store.$connectedDisplayCount
            .map { $0 > 0 }
            .removeDuplicates()
            .sink { [weak self] connected in self?.updateStatusItemImage(connected: connected) }
        store.connectSavedDisplays()
        let openedByUser = !launchedAsLoginItem()
        store.updater.startAutomaticChecks(checkOnLaunch: openedByUser)
        if openedByUser {
            DispatchQueue.main.async { [weak self] in self?.openCompanionWindow() }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        DistributedNotificationCenter.default().removeObserver(self)
        if instanceLockFileDescriptor >= 0 {
            Darwin.lockf(instanceLockFileDescriptor, F_ULOCK, 0)
            Darwin.close(instanceLockFileDescriptor)
            instanceLockFileDescriptor = -1
        }
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        store.refreshLaunchAtLoginStatus()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openCompanionWindow()
        return true
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.contains(where: { $0.absoluteString == "espdesktop://open" }) else { return }
        openCompanionWindow()
    }

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        addContextualControlMenuItems(to: menu, isMenuBarMenu: false)
        return menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        if store.displays.isEmpty {
            menu.addItem(NSMenuItem(title: "No displays paired", action: nil, keyEquivalent: ""))
            menu.addItem(.separator())
        }

        addContextualControlMenuItems(to: menu, isMenuBarMenu: true)
        addMenuItem(
            "Quit", action: #selector(quit), key: "q",
            image: menuSymbol("power", description: "Quit"), to: menu)
    }

    private func addContextualControlMenuItems(to menu: NSMenu, isMenuBarMenu: Bool) {
        for display in store.displays {
            let item = NSMenuItem(title: display.name, action: nil, keyEquivalent: "")
            if isMenuBarMenu {
                item.onStateImage = connectionDot(connected: true)
                item.offStateImage = connectionDot(connected: false)
                item.state = display.state == .connected ? .on : .off
            } else {
                item.image = menuSymbol(display.state.symbol, description: display.state.title)
            }
            item.toolTip = display.panelHost
            let actions = NSMenu()
            let status = NSMenuItem(title: display.state.title, action: nil, keyEquivalent: "")
            actions.addItem(status)
            actions.addItem(.separator())
            let enabled = display.state == .connected || display.state.isBusy
            let toggle = display.state == .needsPairing
                ? NSMenuItem(title: "Display Settings…", action: #selector(openSettings), keyEquivalent: "")
                : NSMenuItem(title: enabled ? "Disconnect" : "Connect",
                             action: #selector(toggleDisplayConnection(_:)), keyEquivalent: "")
            toggle.target = self
            toggle.representedObject = display
            actions.addItem(toggle)
            let customize = NSMenuItem(title: "Customize Display", action: #selector(openDisplaySettings(_:)),
                                       keyEquivalent: store.displays.count == 1 ? "d" : "")
            customize.target = self
            customize.representedObject = display
            actions.addItem(customize)
            item.submenu = actions
            menu.addItem(item)
        }
        if !store.displays.isEmpty { menu.addItem(.separator()) }

        if isMenuBarMenu {
            addMenuItem("Add device", action: #selector(addDevice),
                        image: menuSymbol("plus", description: "Add device"), to: menu)
        }
        addMenuItem("Settings", action: #selector(openSettings), key: ",",
                    image: menuSymbol("gearshape", description: "Settings"), to: menu)
        if !isMenuBarMenu {
            addMenuItem("Check for Updates…",
                        action: #selector(checkForUpdates), key: "u",
                        image: menuSymbol("arrow.triangle.2.circlepath", description: "Check for Updates"), to: menu)
        }
        addMenuItem("Support", action: #selector(openHelp), key: "?",
                    image: menuSymbol("questionmark.circle", description: "Support"), to: menu)
    }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        menuItem.action != #selector(checkForUpdates) || !store.updater.isChecking
    }

    private func connectionDot(connected: Bool) -> NSImage {
        NSImage(size: NSSize(width: 12, height: 12), flipped: false) { bounds in
            let dot = NSBezierPath(ovalIn: bounds.insetBy(dx: 2.5, dy: 2.5))
            if connected {
                NSColor.systemGreen.setFill()
                dot.fill()
            } else {
                NSColor.secondaryLabelColor.setStroke()
                dot.stroke()
            }
            return true
        }
    }

    private func addMenuItem(
        _ title: String, action: Selector, key: String = "", image: NSImage? = nil, to menu: NSMenu
    ) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        item.image = image
        menu.addItem(item)
    }

    private func menuSymbol(_ name: String, description: String) -> NSImage? {
        let image = NSImage(systemSymbolName: name, accessibilityDescription: description)
        image?.isTemplate = true
        return image
    }

    @objc private func openDisplaySettings(_ sender: NSMenuItem) {
        guard let display = sender.representedObject as? CompanionDisplay else { return }
        store.openPanelWebServer(display)
    }

    @objc private func toggleDisplayConnection(_ sender: NSMenuItem) {
        guard let display = sender.representedObject as? CompanionDisplay else { return }
        store.setConnection(display.state != .connected && !display.state.isBusy, for: display)
    }

    private func updateStatusItemImage(connected: Bool) {
        guard let button = statusItem?.button else { return }
        let description = connected ? "EspDesktop connected" : "EspDesktop disconnected"
        let symbol = connected ? "laptopcomputer" : "laptopcomputer.slash"
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: description)
        image?.isTemplate = true
        button.image = image
    }

    @objc private func addDevice() { openCompanionWindow(destination: .addDevice) }
    @objc private func openSettings() { openCompanionWindow() }
    @objc private func openHelp() { openCompanionWindow(destination: .support) }
    @objc private func checkForUpdates() { store.updater.check() }
    @objc private func quit() { NSApp.terminate(nil) }
    @objc private func existingInstanceWasOpened(_ notification: Notification) { openCompanionWindow() }

    private func acquireInstanceLock() -> Bool {
        let lockURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(Self.ipcIdentifier).instance.lock")
        let descriptor = Darwin.open(lockURL.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { return false }
        guard Darwin.lockf(descriptor, F_TLOCK, 0) == 0 else {
            Darwin.close(descriptor)
            return false
        }
        instanceLockFileDescriptor = descriptor
        return true
    }

    private func launchedAsLoginItem() -> Bool {
        NSAppleEventManager.shared().currentAppleEvent?
            .paramDescriptor(forKeyword: keyAELaunchedAsLogInItem)?
            .booleanValue == true
    }

    func openCompanionWindow(destination: CompanionSettingsDestination = .displays) {
        defer {
            if destination != .addDevice { store.updater.showAvailableUpdate() }
        }
        store.requestedSettingsDestination = destination
        store.settingsRequestID = UUID()
        activateCompanionApplication()

        if let settingsWindow {
            settingsWindow.orderFrontRegardless()
            settingsWindow.makeKeyAndOrderFront(nil)
            return
        }

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.identifier = NSUserInterfaceItemIdentifier("io.espdesktop.app.settings")
        window.title = "Settings"
        window.backgroundColor = .windowBackgroundColor
        window.delegate = self
        window.isRestorable = false
        window.minSize = NSSize(width: 500, height: 500)
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(
            rootView: CompanionSettings(store: store)
        )
        window.center()
        settingsWindow = window
        window.makeKeyAndOrderFront(nil)
        activateCompanionApplication()
    }

    func windowWillClose(_ notification: Notification) {
        guard let closedWindow = notification.object as? NSWindow,
              closedWindow === settingsWindow else { return }
        // Keep the menu-bar companion running, but remove its Dock presence
        // once the settings window has been closed.
        NSApp.setActivationPolicy(.accessory)
    }
}

@MainActor
func activateCompanionApplication() {
    NSApp.setActivationPolicy(.regular)
    NSApp.unhide(nil)
    NSRunningApplication.current.activate(options: [
        .activateAllWindows,
        .activateIgnoringOtherApps,
    ])
    NSApp.activate(ignoringOtherApps: true)
}
