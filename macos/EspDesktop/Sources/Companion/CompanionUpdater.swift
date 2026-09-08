import AppKit
import Combine
import Sparkle
import SwiftUI

/// Sparkle owns the schedule, signed downloads, installer and native update UI.
@MainActor
final class CompanionUpdater: ObservableObject {
    @Published private(set) var isChecking = false
    @Published private(set) var message = "Checks daily while EspDesktop is running."
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
    private let controller = SPUStandardUpdaterController(
        startingUpdater: false, updaterDelegate: nil, userDriverDelegate: nil
    )
    private var observations = Set<AnyCancellable>()
    private var started = false

    func startAutomaticChecks() {
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
}

struct CompanionUpdateSettings: View {
    @ObservedObject var updater: CompanionUpdater

    var body: some View {
        Section("Updates") {
            LabeledContent("Installed version", value: updater.installedVersion)
            Toggle("Automatically check for updates", isOn: $updater.automaticallyChecks)
                .toggleStyle(SwitchToggleStyle(tint: .accentColor))
            Toggle("Automatically install updates", isOn: $updater.automaticallyInstalls)
                .toggleStyle(SwitchToggleStyle(tint: .accentColor))
                .disabled(!updater.automaticallyChecks)
            Text("By default, EspDesktop checks daily and notifies you. Enable automatic installation to download verified updates in the background and install them when you quit. macOS may still ask for permission.")
                .font(.callout)
                .foregroundStyle(.secondary)
            Button("Check for Updates") { updater.check() }
                .disabled(updater.isChecking)
            Text(updater.message).font(.callout).foregroundStyle(.secondary)
        }
    }
}
