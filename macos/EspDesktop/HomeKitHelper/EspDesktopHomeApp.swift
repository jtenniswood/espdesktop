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
            Text("No compatible controls or scenes are available in this home.")
        case .ready:
            Text("Choose which Apple Home controls to add in EspDesktop’s display settings.")
        }
    }
}

@MainActor
final class EspDesktopHome: NSObject, ObservableObject, HMHomeManagerDelegate, HMHomeDelegate {
    private enum Target {
        case scene(HMActionSet)
        case power(HMCharacteristic, Bool)
    }

    private struct Control {
        let key: String
        let name: String
        let target: Target
    }

    @Published private(set) var homes: [HMHome] = []
    @Published private(set) var status: AppleHomeSceneMessage.Status = .waiting
    private let defaults = UserDefaults.standard
    private let manager = HMHomeManager()
    private var channel: AppleHomeSceneChannel?
    private var selectedHome: HMHome?
    private var bindingSet: UUID?
    private var bindings = AppleHomeSceneBindings()
    private var targets: [UUID: Target] = [:]
    private var publishesCatalog = false

    override init() {
        super.init()
        manager.delegate = self
        let arguments = ProcessInfo.processInfo.arguments
        publishesCatalog = arguments.contains("--espdesktop-home-cards")
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

    nonisolated func home(_ home: HMHome, didAdd accessory: HMAccessory) {
        Task { @MainActor in refresh() }
    }

    nonisolated func home(_ home: HMHome, didRemove accessory: HMAccessory) {
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
            targets = [:]
            publish(manager.authorizationStatus.contains(.determined) ? .denied : .waiting)
            return
        }
        homes = manager.homes
        let saved = defaults.string(forKey: "selectedHome").flatMap(UUID.init(uuidString:))
        let selected = AppleHomeSceneBindings.chooseHome(from: homes.map(\.uniqueIdentifier), saved: saved)
        let chosen = homes.first { $0.uniqueIdentifier == selected }
        guard let chosen else {
            selectedHome = nil
            targets = [:]
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
        refreshControls(in: chosen, scenes: scenes)
    }

    private func refreshControls(in home: HMHome, scenes: [HMActionSet]) {
        let serviceTypes = Set([HMServiceTypeLightbulb, HMServiceTypeSwitch, HMServiceTypeOutlet, HMServiceTypeFan])
        var controls = scenes.map { Control(key: "scene." + $0.uniqueIdentifier.uuidString, name: $0.name, target: .scene($0)) }
        for accessory in home.accessories {
            let services = accessory.services.filter { serviceTypes.contains($0.serviceType) }
            for service in services {
                guard let power = service.characteristics.first(where: {
                    $0.characteristicType == HMCharacteristicTypePowerState &&
                        $0.properties.contains(HMCharacteristicPropertyWritable)
                }) else { continue }
                let name = services.count == 1 ? accessory.name : accessory.name + " · " + service.name
                for enabled in [true, false] {
                    let suffix = enabled ? "On" : "Off"
                    let key = "power." + power.uniqueIdentifier.uuidString + "." + suffix
                    controls.append(Control(key: key, name: name + " · " + suffix, target: .power(power, enabled)))
                }
            }
        }
        controls.sort {
            if $0.name == $1.name { return $0.key < $1.key }
            return $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
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
        channel?.send(.init(kind: .status, status: update, bindingSet: update == .ready ? bindingSet : nil))
    }

    private func receive(_ message: AppleHomeSceneMessage) async {
        if message.kind == .disconnect {
            channel?.close()
            return
        }
        guard message.kind == .run, let request = message.request else { return }
        let succeeded = await run(slot: message.slot, reference: message.reference)
        channel?.send(.init(kind: .result, request: request, succeeded: succeeded))
    }

    private func run(slot: Int?, reference: UUID?) async -> Bool {
        guard manager.authorizationStatus.contains(.authorized), let selectedHome else { return false }
        let target: Target?
        if let reference {
            target = targets[reference]
        } else if let slot {
            let scenes = selectedHome.actionSets.filter { $0.actionSetType == HMActionSetTypeUserDefined }
            let id = bindings.scene(at: slot, available: Set(scenes.map(\.uniqueIdentifier)))
            target = scenes.first(where: { $0.uniqueIdentifier == id }).map(Target.scene)
        } else {
            target = nil
        }
        guard let target else { return false }
        do {
            switch target {
            case .scene(let scene): try await selectedHome.executeActionSet(scene)
            case .power(let characteristic, let enabled): try await characteristic.writeValue(NSNumber(value: enabled))
            }
            return true
        } catch {
            return false
        }
    }
}
