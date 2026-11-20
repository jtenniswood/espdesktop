import Foundation
import HomeKit
import Network
import SwiftUI

@main
struct EspDesktopHomeApp: App {
    @StateObject private var home = EspDesktopHome()

    var body: some Scene {
        WindowGroup {
            VStack(alignment: .leading, spacing: 16) {
                Text("Apple Home").font(.title)
                content
            }
            .padding(24)
            .frame(minWidth: 370, minHeight: 260, alignment: .topLeading)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch home.status {
        case .waiting:
            ProgressView("Loading Apple Home")
        case .denied:
            Text("Allow EspDesktop Home in System Settings under Privacy & Security → HomeKit.")
        case .chooseHome:
            Text("Choose which home to connect to EspDesktop.")
            ForEach(home.homes, id: \.uniqueIdentifier) { house in
                Button(house.name) { home.select(house) }
            }
        case .empty:
            Text("Add a scene in Apple Home to use it on your display.")
        case .ready:
            ForEach(home.slots, id: \.number) { slot in
                LabeledContent("Scene \(slot.number)", value: slot.name)
            }
        }
    }
}

@MainActor
final class EspDesktopHome: NSObject, ObservableObject, HMHomeManagerDelegate, HMHomeDelegate {
    struct Slot {
        let number: Int
        let name: String
    }

    @Published private(set) var homes: [HMHome] = []
    @Published private(set) var slots: [Slot] = []
    @Published private(set) var status: AppleHomeSceneMessage.Status = .waiting
    private let defaults = UserDefaults.standard
    private let manager = HMHomeManager()
    private var channel: AppleHomeSceneChannel?
    private var selectedHome: HMHome?
    private var bindingSet: UUID?
    private var bindings = AppleHomeSceneBindings()

    override init() {
        super.init()
        manager.delegate = self
        let arguments = ProcessInfo.processInfo.arguments
        guard let marker = arguments.firstIndex(of: "--espdesktop-home-connection"), marker + 2 < arguments.count,
              let portNumber = UInt16(arguments[marker + 1]), let port = NWEndpoint.Port(rawValue: portNumber),
              let secret = UUID(uuidString: arguments[marker + 2]) else { return }
        let channel = AppleHomeSceneChannel(NWConnection(host: "127.0.0.1", port: port, using: .tcp))
        self.channel = channel
        channel.onMessage = { [weak self] message in
            Task { await self?.receive(message) }
        }
        channel.start()
        channel.send(.init(kind: .hello, secret: secret))
        publish(.waiting)
    }

    nonisolated func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        Task { @MainActor in refresh() }
    }

    nonisolated func homeManager(_ manager: HMHomeManager, didUpdate status: HMHomeManagerAuthorizationStatus) {
        Task { @MainActor in refresh() }
    }

    nonisolated func home(_ home: HMHome, didAdd actionSet: HMActionSet) {
        Task { @MainActor in refresh() }
    }

    nonisolated func home(_ home: HMHome, didRemove actionSet: HMActionSet) {
        Task { @MainActor in refresh() }
    }

    nonisolated func home(_ home: HMHome, didUpdateNameFor actionSet: HMActionSet) {
        Task { @MainActor in refresh() }
    }

    func select(_ home: HMHome) {
        defaults.set(home.uniqueIdentifier.uuidString, forKey: "selectedHome")
        refresh()
    }

    private func refresh() {
        guard manager.authorizationStatus.contains(.authorized) else {
            selectedHome = nil
            homes = []
            slots = []
            publish(manager.authorizationStatus.contains(.determined) ? .denied : .waiting)
            return
        }
        homes = manager.homes
        let saved = defaults.string(forKey: "selectedHome").flatMap(UUID.init(uuidString:))
        let selected = AppleHomeSceneBindings.chooseHome(from: homes.map(\.uniqueIdentifier), saved: saved)
        let chosen = homes.first { $0.uniqueIdentifier == selected }
        guard let chosen else {
            selectedHome = nil
            slots = []
            publish(homes.isEmpty ? .empty : .chooseHome)
            return
        }
        selectedHome = chosen
        chosen.delegate = self
        defaults.set(chosen.uniqueIdentifier.uuidString, forKey: "selectedHome")
        let scenes = chosen.actionSets.filter { $0.actionSetType == HMActionSetTypeUserDefined }
            .sorted {
                if $0.name == $1.name { return $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
                return $0.name.localizedStandardCompare($1.name) == .orderedAscending
            }
        let key = "sceneSlots." + chosen.uniqueIdentifier.uuidString
        let savedBindings = defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(AppleHomeSceneBindings.self, from: $0) }
        bindings = savedBindings ?? AppleHomeSceneBindings()
        let bindingKey = "bindingSet." + chosen.uniqueIdentifier.uuidString
        let savedGeneration = defaults.string(forKey: bindingKey).flatMap(UUID.init(uuidString:))
        let generation = (savedBindings != nil ? savedGeneration : nil) ?? UUID()
        defaults.set(generation.uuidString, forKey: bindingKey)
        bindingSet = generation
        bindings.discover(scenes.map(\.uniqueIdentifier))
        defaults.set(try? JSONEncoder().encode(bindings), forKey: key)
        let names = Dictionary(uniqueKeysWithValues: scenes.map { ($0.uniqueIdentifier, $0.name) })
        slots = bindings.sceneIDs.enumerated().compactMap { index, id in
            names[id].map { Slot(number: index + 1, name: $0) }
        }
        publish(slots.isEmpty ? .empty : .ready)
    }

    private func publish(_ update: AppleHomeSceneMessage.Status) {
        status = update
        channel?.send(.init(kind: .status, status: update, bindingSet: update == .ready ? bindingSet : nil))
    }

    private func receive(_ message: AppleHomeSceneMessage) async {
        if message.kind == .disconnect {
            channel?.close()
            return
        }
        guard message.kind == .run, let request = message.request, let slot = message.slot else { return }
        let succeeded = await run(slot)
        channel?.send(.init(kind: .result, request: request, succeeded: succeeded))
    }

    private func run(_ slot: Int) async -> Bool {
        guard manager.authorizationStatus.contains(.authorized), let selectedHome else { return false }
        let scenes = selectedHome.actionSets.filter { $0.actionSetType == HMActionSetTypeUserDefined }
        guard let id = bindings.scene(at: slot, available: Set(scenes.map(\.uniqueIdentifier))),
              let scene = scenes.first(where: { $0.uniqueIdentifier == id }) else { return false }
        do {
            try await selectedHome.executeActionSet(scene)
            return true
        } catch {
            return false
        }
    }
}
