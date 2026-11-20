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
                if home.homes.count > 1 {
                    Picker("Home", selection: Binding(get: { home.selectedHomeID }, set: home.select)) {
                        if home.selectedHomeID == nil { Text("Choose a Home").tag(nil as UUID?) }
                        ForEach(home.homes, id: \.uniqueIdentifier) { house in
                            let count = home.controlCounts[house.uniqueIdentifier, default: 0]
                            Text("\(house.name) (\(count) available)").tag(Optional(house.uniqueIdentifier))
                        }
                    }
                }
                if home.canContinue {
                    Button("Continue", action: home.continueSetup)
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut(.defaultAction)
                }
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
        case .empty:
            if home.homes.isEmpty {
                Text("No homes are available. Check that your home appears in the Apple Home app on this Mac.")
            } else {
                Text("There are no compatible controls or scenes in this home.")
            }
        case .ready:
            Text("Choose controls to add to your display in EspDesktop.")
        }
    }
}

@MainActor
final class EspDesktopHome: NSObject, ObservableObject, HMHomeManagerDelegate, HMHomeDelegate {
    private enum Target {
        case scene(HMActionSet)
        case write(HMCharacteristic, NSNumber)
    }

    private struct Control {
        let key: String
        let name: String
        let target: Target
    }

    @Published private(set) var homes: [HMHome] = []
    @Published private(set) var controlCounts: [UUID: Int] = [:]
    @Published private(set) var status: AppleHomeSceneMessage.Status = .waiting
    @Published private(set) var selectedHomeID: UUID?
    private let defaults = UserDefaults.standard
    private let manager = HMHomeManager()
    private var channel: AppleHomeSceneChannel?
    private var selectedHome: HMHome?
    private var bindingSet: UUID?
    private var bindings = AppleHomeSceneBindings()
    private var targets: [UUID: Target] = [:]
    private var publishesCatalog = false
    private var supportsContinue = false
    private var loadedHomes = false

    override init() {
        super.init()
        manager.delegate = self
        let arguments = ProcessInfo.processInfo.arguments
        publishesCatalog = arguments.contains("--espdesktop-home-cards")
        supportsContinue = arguments.contains("--espdesktop-home-continue")
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
        Task { @MainActor in
            loadedHomes = true
            refresh()
        }
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

    nonisolated func home(_ home: HMHome, didAdd accessory: HMAccessory) {
        Task { @MainActor in refresh() }
    }

    nonisolated func home(_ home: HMHome, didRemove accessory: HMAccessory) {
        Task { @MainActor in refresh() }
    }

    func select(_ id: UUID?) {
        guard let id, homes.contains(where: { $0.uniqueIdentifier == id }) else { return }
        defaults.set(id.uuidString, forKey: "selectedHome")
        defaults.set(true, forKey: "selectedHomeExplicit")
        refresh()
    }

    var canContinue: Bool { supportsContinue && channel != nil && status == .ready }

    func continueSetup() {
        guard canContinue, let bindingSet else { return }
        channel?.send(.init(kind: .continueSetup, bindingSet: bindingSet))
    }

    private func refresh() {
        guard manager.authorizationStatus.contains(.authorized) else {
            selectedHome = nil
            selectedHomeID = nil
            homes = []
            controlCounts = [:]
            targets = [:]
            publish(manager.authorizationStatus.contains(.determined) ? .denied : .waiting)
            return
        }
        guard loadedHomes else { return }
        homes = manager.homes
        for home in homes { home.delegate = self }
        let catalogs = homes.map { home in
            let scenes = userScenes(in: home)
            return (home: home, scenes: scenes, controls: discoverControls(in: home, scenes: scenes))
        }
        controlCounts = Dictionary(uniqueKeysWithValues: catalogs.map { ($0.home.uniqueIdentifier, $0.controls.count) })
        let saved = defaults.string(forKey: "selectedHome").flatMap(UUID.init(uuidString:))
        let eligibleHomes = catalogs.filter { !$0.controls.isEmpty }.map { $0.home.uniqueIdentifier }
        let selected = AppleHomeSceneBindings.chooseHome(from: homes.map(\.uniqueIdentifier), withControls: eligibleHomes,
                                                        saved: saved, explicit: defaults.bool(forKey: "selectedHomeExplicit"))
        selectedHomeID = selected
        guard let catalog = catalogs.first(where: { $0.home.uniqueIdentifier == selected }) else {
            selectedHome = nil
            targets = [:]
            publish(homes.isEmpty ? .empty : .chooseHome)
            return
        }
        let chosen = catalog.home
        if selectedHome?.uniqueIdentifier != selected { publish(.waiting) }
        selectedHome = chosen
        if saved != selected {
            defaults.set(chosen.uniqueIdentifier.uuidString, forKey: "selectedHome")
            defaults.removeObject(forKey: "selectedHomeExplicit")
        }
        let key = "sceneSlots." + chosen.uniqueIdentifier.uuidString
        let savedBindings = defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(AppleHomeSceneBindings.self, from: $0) }
        bindings = savedBindings ?? AppleHomeSceneBindings()
        let bindingKey = "bindingSet." + chosen.uniqueIdentifier.uuidString
        let savedGeneration = defaults.string(forKey: bindingKey).flatMap(UUID.init(uuidString:))
        let generation = (savedBindings != nil ? savedGeneration : nil) ?? UUID()
        defaults.set(generation.uuidString, forKey: bindingKey)
        bindingSet = generation
        bindings.discover(catalog.scenes.map(\.uniqueIdentifier))
        defaults.set(try? JSONEncoder().encode(bindings), forKey: key)
        publishControls(catalog.controls, in: chosen)
    }

    private func userScenes(in home: HMHome) -> [HMActionSet] {
        home.actionSets.filter { $0.actionSetType == HMActionSetTypeUserDefined }.sorted {
            if $0.name == $1.name { return $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
            return $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
    }

    private func discoverControls(in home: HMHome, scenes: [HMActionSet]) -> [Control] {
        let powerTypes = Set([HMServiceTypeLightbulb, HMServiceTypeSwitch, HMServiceTypeOutlet, HMServiceTypeFan])
        var controls = scenes.map { Control(key: "scene." + $0.uniqueIdentifier.uuidString, name: $0.name, target: .scene($0)) }
        for accessory in home.accessories {
            let services = accessory.services.filter {
                powerTypes.contains($0.serviceType) || $0.serviceType == HMServiceTypeWindowCovering
            }
            for service in services {
                let isCovering = service.serviceType == HMServiceTypeWindowCovering
                let type = isCovering ? HMCharacteristicTypeTargetPosition : HMCharacteristicTypePowerState
                guard let characteristic = service.characteristics.first(where: {
                    $0.characteristicType == type && $0.properties.contains(HMCharacteristicPropertyWritable)
                }) else { continue }
                let name = services.count == 1 ? accessory.name : accessory.name + " · " + service.name
                let actions: [(String, NSNumber)] = isCovering
                    ? [("Open", NSNumber(value: 100)), ("Close", NSNumber(value: 0))]
                    : [("On", NSNumber(value: true)), ("Off", NSNumber(value: false))]
                for (suffix, value) in actions {
                    let key = (isCovering ? "position." : "power.") + characteristic.uniqueIdentifier.uuidString + "." + suffix
                    controls.append(Control(key: key, name: name + " · " + suffix, target: .write(characteristic, value)))
                }
            }
        }
        return controls.sorted {
            if $0.name == $1.name { return $0.key < $1.key }
            return $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
    }

    private func publishControls(_ controls: [Control], in home: HMHome) {
        let referenceKey = "cardControlReferences." + home.uniqueIdentifier.uuidString
        var references = defaults.data(forKey: referenceKey)
            .flatMap { try? JSONDecoder().decode([String: UUID].self, from: $0) } ?? [:]
        var available: [AppleHomeControl] = []
        targets = [:]
        for control in controls {
            let id = references[control.key] ?? UUID()
            references[control.key] = id
            targets[id] = control.target
            let name = String(decoding: control.name.utf8.prefix(240), as: UTF8.self)
            available.append(.init(id: id, name: name))
        }
        defaults.set(try? JSONEncoder().encode(references), forKey: referenceKey)
        if publishesCatalog {
            channel?.send(.init(kind: .catalogStart))
            for control in available {
                channel?.send(.init(kind: .catalogControl, control: control))
            }
            channel?.send(.init(kind: .catalogEnd))
        }
        publish(available.isEmpty ? .empty : .ready)
    }

    private func publish(_ update: AppleHomeSceneMessage.Status) {
        status = update
        channel?.send(.init(kind: .status, status: update, bindingSet: update == .ready ? bindingSet : nil,
                            canChooseHome: homes.count > 1))
    }

    private func receive(_ message: AppleHomeSceneMessage) async {
        if message.kind == .disconnect {
            channel?.close()
            return
        }
        guard message.kind == .run, let request = message.request else { return }
        let matchesHome = message.bindingSet == bindingSet ||
            (message.bindingSet == nil && (message.reference != nil || homes.count == 1))
        let succeeded = matchesHome ? await run(slot: message.slot, reference: message.reference) : false
        channel?.send(.init(kind: .result, request: request, succeeded: succeeded))
    }

    private func run(slot: Int?, reference: UUID?) async -> Bool {
        guard manager.authorizationStatus.contains(.authorized), let selectedHome else { return false }
        let target: Target?
        if let reference {
            target = targets[reference]
        } else if let slot {
            let scenes = userScenes(in: selectedHome)
            let id = bindings.scene(at: slot, available: Set(scenes.map(\.uniqueIdentifier)))
            target = scenes.first(where: { $0.uniqueIdentifier == id }).map(Target.scene)
        } else {
            target = nil
        }
        guard let target else { return false }
        do {
            switch target {
            case .scene(let scene): try await selectedHome.executeActionSet(scene)
            case .write(let characteristic, let value): try await characteristic.writeValue(value)
            }
            return true
        } catch {
            return false
        }
    }
}
