import AppKit
import Combine
import Sparkle
import SwiftUI
import UserNotifications

/// Sparkle owns the schedule, signed downloads, installer and native update UI.
@MainActor
final class CompanionUpdater: NSObject, ObservableObject, SPUUpdaterDelegate,
    @preconcurrency SPUStandardUserDriverDelegate, UNUserNotificationCenterDelegate {
    private nonisolated static let updateNotificationID = "espdesktop-update-available"
    private static let notificationPreferenceKey = "notifyAboutAppUpdates"
    private static let lastNotifiedBuildKey = "lastNotifiedAppUpdateBuild"

    @Published private(set) var isChecking = false
    @Published private(set) var message = ""
    @Published private(set) var sendsUpdateNotifications = UserDefaults.standard.bool(forKey: notificationPreferenceKey)
    @Published private(set) var requestingNotificationPermission = false
    @Published private(set) var notificationMessage = ""
    @Published var automaticallyChecks = true {
        didSet {
            guard started, controller.updater.automaticallyChecksForUpdates != automaticallyChecks else { return }
            controller.updater.automaticallyChecksForUpdates = automaticallyChecks
        }
    }
    @Published var automaticallyInstalls = false {
        didSet {
            guard started, controller.updater.automaticallyDownloadsUpdates != automaticallyInstalls else { return }
            controller.updater.automaticallyDownloadsUpdates = automaticallyInstalls
        }
    }
    let installedVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Development build"
    private lazy var controller = SPUStandardUpdaterController(
        startingUpdater: false, updaterDelegate: self, userDriverDelegate: self
    )
    private var observations = Set<AnyCancellable>()
    private var started = false
    private var focusNextUpdatePrompt = false
    private var hasUpdatePrompt = false
    private var sendingNotification = false

    func startAutomaticChecks(checkOnLaunch: Bool = false) {
        guard !started else { return }
        guard Bundle.main.bundleURL.pathExtension == "app" else {
            message = "Install the packaged app to check for updates."
            return
        }
        do {
            try controller.updater.start()
            started = true
            automaticallyChecks = controller.updater.automaticallyChecksForUpdates
            automaticallyInstalls = controller.updater.automaticallyDownloadsUpdates
            controller.updater.publisher(for: \.automaticallyChecksForUpdates)
                .sink { [weak self] value in self?.automaticallyChecks = value }
                .store(in: &observations)
            controller.updater.publisher(for: \.automaticallyDownloadsUpdates)
                .sink { [weak self] value in self?.automaticallyInstalls = value }
                .store(in: &observations)
            controller.updater.publisher(for: \.canCheckForUpdates)
                .sink { [weak self] value in self?.isChecking = !value }
                .store(in: &observations)
            UNUserNotificationCenter.current().delegate = self
            if checkOnLaunch && automaticallyChecks {
                focusNextUpdatePrompt = true
                controller.updater.checkForUpdatesInBackground()
            }
        } catch {
            message = "The updater could not start. Reinstall the latest packaged EspDesktop app."
        }
    }

    func check() {
        startAutomaticChecks()
        guard started else {
            let alert = NSAlert()
            alert.messageText = "Companion Updates"
            alert.informativeText = message
            alert.runModal()
            return
        }
        guard controller.updater.canCheckForUpdates else { return }
        controller.checkForUpdates(nil)
    }

    func showAvailableUpdate() {
        guard hasUpdatePrompt else { return }
        check()
    }

    var supportsGentleScheduledUpdateReminders: Bool { true }

    func standardUserDriverWillHandleShowingUpdate(_ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState) {
        hasUpdatePrompt = true
        guard focusNextUpdatePrompt else { return }
        // Wait until Sparkle has finished creating its dialog before bringing it forward.
        DispatchQueue.main.async { [weak self] in
            guard NSApp.isActive else { return }
            self?.showAvailableUpdate()
        }
    }

    func standardUserDriverWillFinishUpdateSession() {
        hasUpdatePrompt = false
    }

    func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: (any Error)?) {
        focusNextUpdatePrompt = false
    }

    func setUpdateNotifications(_ enabled: Bool) {
        guard started, !requestingNotificationPermission else { return }
        let center = UNUserNotificationCenter.current()
        notificationMessage = ""
        if !enabled {
            sendsUpdateNotifications = false
            UserDefaults.standard.set(false, forKey: Self.notificationPreferenceKey)
            clearUpdateNotification()
            return
        }

        requestingNotificationPermission = true
        Task {
            defer { requestingNotificationPermission = false }
            do {
                let granted = try await center.requestAuthorization(options: [.alert, .sound])
                sendsUpdateNotifications = granted
                UserDefaults.standard.set(granted, forKey: Self.notificationPreferenceKey)
                if !granted {
                    notificationMessage = "Allow notifications for EspDesktop in System Settings → Notifications, then turn this on again."
                }
            } catch {
                notificationMessage = "Couldn’t request notification permission. Try again."
            }
        }
    }

    func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        let defaults = UserDefaults.standard
        let build = item.versionString
        guard sendsUpdateNotifications, !item.isInformationOnlyUpdate, !sendingNotification,
              defaults.string(forKey: Self.lastNotifiedBuildKey) != build else { return }
        sendingNotification = true

        let content = UNMutableNotificationContent()
        content.title = "EspDesktop Update Available"
        content.body = "Version \(item.displayVersionString) is available. Click to view the update."
        content.sound = .default
        let request = UNNotificationRequest(identifier: Self.updateNotificationID, content: content, trigger: nil)
        Task {
            defer { sendingNotification = false }
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            guard sendsUpdateNotifications else { return }
            guard settings.authorizationStatus == .authorized else {
                notificationMessage = "Allow notifications for EspDesktop in System Settings → Notifications."
                return
            }
            do {
                try await center.add(request)
                notificationMessage = ""
                if sendsUpdateNotifications {
                    defaults.set(build, forKey: Self.lastNotifiedBuildKey)
                } else {
                    clearUpdateNotification()
                }
            } catch {
                notificationMessage = "Couldn’t deliver the update notification."
            }
        }
    }

    func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
        clearUpdateNotification()
    }

    private func clearUpdateNotification() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.updateNotificationID])
        center.removeDeliveredNotifications(withIdentifiers: [Self.updateNotificationID])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        guard notification.request.identifier == Self.updateNotificationID else { return [] }
        return [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard response.notification.request.identifier == Self.updateNotificationID,
              response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
        await showUpdateFromNotification()
    }

    private func showUpdateFromNotification() {
        if isChecking {
            // Let a check already in progress surface its result in the foreground.
            focusNextUpdatePrompt = true
        } else {
            check()
        }
    }
}

struct CompanionUpdateSettings: View {
    @ObservedObject var updater: CompanionUpdater

    var body: some View {
        Form {
            Section("Installed") {
                HStack {
                    Text("Version \(updater.installedVersion)")
                    Spacer()
                    if updater.isChecking { ProgressView().controlSize(.small) }
                    Button("Check Now") { updater.check() }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .modifier(CompanionCapsuleButton())
                        .disabled(updater.isChecking)
                }
                if !updater.message.isEmpty {
                    Text(updater.message)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            Section("Automatic Updates") {
                Toggle("Automatically Check for Updates", isOn: $updater.automaticallyChecks)
                    .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                Toggle("Automatically Install Updates", isOn: $updater.automaticallyInstalls)
                    .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                    .disabled(!updater.automaticallyChecks)
                Toggle("Notify Me About Updates", isOn: Binding(
                    get: { updater.sendsUpdateNotifications }, set: updater.setUpdateNotifications
                ))
                .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                .disabled(updater.requestingNotificationPermission || !updater.message.isEmpty)
                if !updater.notificationMessage.isEmpty {
                    Text(updater.notificationMessage)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
    }
}
