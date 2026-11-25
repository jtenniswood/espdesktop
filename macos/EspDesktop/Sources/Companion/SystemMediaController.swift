import CoreAudio
import CryptoKit
import Foundation

@MainActor
final class SystemMediaController {
    static let outputVolumeID = "media.output_volume"
    static let inputVolumeID = "media.input_volume"
    static let outputMuteID = "media.output_mute"
    static let inputMuteID = "media.input_mute"
    static let coughID = "media.cough"
    static let brightnessID = "display.brightness"
    static let volumeControlIDs = Set([outputVolumeID, inputVolumeID, outputMuteID, inputMuteID, coughID, brightnessID])
    private let displayBrightness = SystemDisplayBrightness()

    private struct DeviceKey: Hashable {
        let device: AudioDeviceID
        let scope: AudioObjectPropertyScope
    }
    private enum CoughInput {
        case unchanged
        case nativeMute
        case inputLevel(Float32)
    }
    struct InputDevice: Equatable {
        let controlID: String
        let name: String
        let device: AudioDeviceID
    }

    private var inputDevices: [InputDevice] = []
    private var coughRestores: [AudioDeviceID: CoughInput] = [:]
    private var restoreLevels: [DeviceKey: Float32] = [:]
    private let findDevice: (AudioObjectPropertyScope) -> AudioDeviceID?
    private let findInputDevices: () -> [InputDevice]
    private let readVolume: (AudioDeviceID, AudioObjectPropertyScope) -> Float32?
    private let writeVolume: (Float32, AudioDeviceID, AudioObjectPropertyScope) -> Bool
    private let readMute: (AudioDeviceID, AudioObjectPropertyScope) -> Bool?
    private let writeMute: (Bool, AudioDeviceID, AudioObjectPropertyScope) -> Bool

    init(
        defaultDevice: @escaping (AudioObjectPropertyScope) -> AudioDeviceID? = SystemMediaController.defaultDevice,
        volume: @escaping (AudioDeviceID, AudioObjectPropertyScope) -> Float32? = SystemMediaController.volume,
        setVolume: @escaping (Float32, AudioDeviceID, AudioObjectPropertyScope) -> Bool = SystemMediaController.setVolume,
        mute: @escaping (AudioDeviceID, AudioObjectPropertyScope) -> Bool? = SystemMediaController.mute,
        setMute: @escaping (Bool, AudioDeviceID, AudioObjectPropertyScope) -> Bool = SystemMediaController.setMute,
        inputDevices: @escaping () -> [InputDevice] = SystemMediaController.availableInputDevices
    ) {
        findDevice = defaultDevice
        findInputDevices = inputDevices
        readVolume = volume
        writeVolume = setVolume
        readMute = mute
        writeMute = setMute
    }

    static func unavailableVolumeIDs(
        values: [String: Int],
        previousValues: [String: Int],
        force: Bool
    ) -> Set<String> {
        let previousIDs = Set(previousValues.keys)
        let candidates = force ? volumeControlIDs.union(previousIDs) : previousIDs
        return candidates.subtracting(values.keys)
    }

    func inputDeviceActions() -> [(id: String, label: String)] {
        inputDevices.map { ($0.controlID, $0.name) }
    }

    @discardableResult
    func refreshInputDevices() -> Bool {
        let devices = findInputDevices()
        guard devices != inputDevices else { return false }
        inputDevices = devices
        return true
    }

    private nonisolated static func availableInputDevices() -> [InputDevice] {
        var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices,
                                                 mScope: kAudioObjectPropertyScopeGlobal, mElement: 0)
        let system = AudioObjectID(kAudioObjectSystemObject)
        var size: UInt32 = 0
        let stride = MemoryLayout<AudioDeviceID>.stride
        guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr, size >= stride else { return [] }
        var devices = [AudioDeviceID](repeating: 0, count: Int(size) / stride)
        let status = devices.withUnsafeMutableBytes {
            AudioObjectGetPropertyData(system, &address, 0, nil, &size, $0.baseAddress!)
        }
        guard status == noErr else { return [] }
        func stringProperty(_ device: AudioDeviceID, _ selector: AudioObjectPropertySelector) -> String? {
            var property = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: 0)
            var value: Unmanaged<CFString>?
            var size = UInt32(MemoryLayout.size(ofValue: value))
            guard AudioObjectGetPropertyData(device, &property, 0, nil, &size, &value) == noErr else { return nil }
            return value?.takeRetainedValue() as String?
        }
        let inputs: [InputDevice] = devices.prefix(Int(size) / stride).compactMap { device in
            guard volume(device: device, scope: kAudioDevicePropertyScopeInput) != nil,
                  let uid = stringProperty(device, kAudioDevicePropertyDeviceUID),
                  let name = stringProperty(device, kAudioObjectPropertyName) else { return nil }
            let hash = SHA256.hash(data: Data(uid.utf8)).map { String(format: "%02x", $0) }.joined()
            return InputDevice(controlID: "input.level." + hash, name: name, device: device)
        }
        return Array(inputs.sorted { $0.controlID < $1.controlID }.prefix(16))
    }

    func values() -> [String: Int] {
        var result: [String: Int] = [:]
        for (scope, volumeID, muteID) in [
            (kAudioDevicePropertyScopeOutput, Self.outputVolumeID, Self.outputMuteID),
            (kAudioDevicePropertyScopeInput, Self.inputVolumeID, Self.inputMuteID)
        ] {
            guard let device = findDevice(scope) else { continue }
            let level = readVolume(device, scope)
            let key = DeviceKey(device: device, scope: scope)
            let nativeMute = readMute(device, scope)
            if scope == kAudioDevicePropertyScopeInput, nativeMute != nil || level != nil {
                let muted = nativeMute ?? (level == 0)
                result[Self.coughID] = muted ? 100 : 0
            }
            // An external volume adjustment ends the zero-level fallback mute.
            if let level {
                if level > 0 { restoreLevels.removeValue(forKey: key) }
                result[volumeID] = Int((level * 100).rounded()).clampedPercentage
            }
            // Never offer an unmute that would have to guess an unknown level.
            if let muted = nativeMute {
                result[muteID] = muted ? 100 : 0
            } else if let level, level > 0 || restoreLevels[key] != nil {
                result[muteID] = level == 0 ? 100 : 0
            }
        }
        for input in inputDevices {
            if let level = readVolume(input.device, kAudioDevicePropertyScopeInput) {
                result[input.controlID] = Int((level * 100).rounded()).clampedPercentage
            }
        }
        if let brightness = displayBrightness.value() {
            result[Self.brightnessID] = brightness
        }
        return result
    }

    func beginCoughMute() -> Bool {
        _ = endCoughMute()
        return continueCoughMute()
    }

    // Each input keeps its own restore state until the last hold ends.
    func continueCoughMute() -> Bool {
        let scope = kAudioDevicePropertyScopeInput
        guard let device = findDevice(scope) else { return false }
        let previous = coughRestores[device]
        let input: CoughInput
        if let muted = readMute(device, scope) {
            if muted && previous != nil { return false }
            guard muted || writeMute(true, device, scope) else { return false }
            input = muted ? .unchanged : .nativeMute
        } else if let level = readVolume(device, scope) {
            if level == 0 && previous != nil { return false }
            guard level == 0 || writeVolume(0, device, scope) else { return false }
            input = level == 0 ? .unchanged : .inputLevel(level)
        } else {
            return false
        }
        coughRestores[device] = previous ?? input
        return true
    }

    func endCoughMute() -> Bool {
        for (device, input) in coughRestores {
            if restoreCoughInput(input, on: device) {
                coughRestores.removeValue(forKey: device)
            }
        }
        return coughRestores.isEmpty
    }

    private func restoreCoughInput(_ input: CoughInput, on device: AudioDeviceID) -> Bool {
        let scope = kAudioDevicePropertyScopeInput
        switch input {
        case .unchanged:
            break
        case .nativeMute:
            guard let muted = readMute(device, scope),
                  !muted || writeMute(false, device, scope) else { return false }
        case .inputLevel(let previous):
            guard let level = readVolume(device, scope),
                  level > 0 || writeVolume(previous, device, scope) else { return false }
        }
        return true
    }

    func setValue(_ value: Int, controlIdentifier: String) -> Bool {
        if controlIdentifier == Self.brightnessID {
            return displayBrightness.setValue(value.clampedPercentage)
        }
        if CompanionProtocolDecoder.isInputDeviceControl(controlIdentifier) {
            // Resolve the stable identifier against the current hardware before writing.
            guard let input = findInputDevices().first(where: { $0.controlID == controlIdentifier }) else { return false }
            return setLevel(value, device: input.device, scope: kAudioDevicePropertyScopeInput)
        }
        let scope: AudioObjectPropertyScope
        switch controlIdentifier {
        case Self.outputVolumeID, Self.outputMuteID: scope = kAudioDevicePropertyScopeOutput
        case Self.inputVolumeID, Self.inputMuteID: scope = kAudioDevicePropertyScopeInput
        default: return false
        }
        guard let device = findDevice(scope) else { return false }
        if controlIdentifier == Self.outputMuteID || controlIdentifier == Self.inputMuteID {
            let key = DeviceKey(device: device, scope: scope)
            guard value == 0 || value == 100 else { return false }
            // Native mute preserves the device's level and works across app restarts.
            if readMute(device, scope) != nil {
                return writeMute(value == 100, device, scope)
            }
            guard let current = readVolume(device, scope) else { return false }
            if value == 100 {
                if current == 0 { return true }
                guard writeVolume(0, device, scope) else { return false }
                restoreLevels[key] = current
                return true
            }
            if current > 0 { restoreLevels.removeValue(forKey: key); return true }
            guard let previous = restoreLevels[key], writeVolume(previous, device, scope) else { return false }
            restoreLevels.removeValue(forKey: key)
            return true
        }
        return setLevel(value, device: device, scope: scope)
    }

    private func setLevel(_ value: Int, device: AudioDeviceID, scope: AudioObjectPropertyScope) -> Bool {
        guard writeVolume(Float32(value.clampedPercentage) / 100, device, scope) else { return false }
        if value > 0 {
            restoreLevels.removeValue(forKey: DeviceKey(device: device, scope: scope))
            if readMute(device, scope) == true { return writeMute(false, device, scope) }
        }
        return true
    }

    private nonisolated static func mute(device: AudioDeviceID, scope: AudioObjectPropertyScope) -> Bool? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute, mScope: scope, mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(device, &address) else { return nil }
        var settable = DarwinBoolean(false)
        guard AudioObjectIsPropertySettable(device, &address, &settable) == noErr,
              settable.boolValue else { return nil }
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value) == noErr else { return nil }
        return value != 0
    }

    private nonisolated static func setMute(_ muted: Bool, device: AudioDeviceID, scope: AudioObjectPropertyScope) -> Bool {
        guard mute(device: device, scope: scope) != nil else { return false }
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute, mScope: scope, mElement: kAudioObjectPropertyElementMain
        )
        var value: UInt32 = muted ? 1 : 0
        return AudioObjectSetPropertyData(
            device, &address, 0, nil, UInt32(MemoryLayout<UInt32>.size), &value
        ) == noErr
    }

    private nonisolated static func defaultDevice(scope: AudioObjectPropertyScope) -> AudioDeviceID? {
        let selector = scope == kAudioDevicePropertyScopeInput
            ? kAudioHardwarePropertyDefaultInputDevice
            : kAudioHardwarePropertyDefaultOutputDevice
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var device = AudioDeviceID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device
        ) == noErr, device != kAudioObjectUnknown else { return nil }
        return device
    }

    private nonisolated static func volume(device: AudioDeviceID, scope: AudioObjectPropertyScope) -> Float32? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(device, &address) else { return nil }
        var settable = DarwinBoolean(false)
        guard AudioObjectIsPropertySettable(device, &address, &settable) == noErr,
              settable.boolValue else { return nil }
        var value: Float32 = 0
        var size = UInt32(MemoryLayout<Float32>.size)
        guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value) == noErr else { return nil }
        return value
    }

    private nonisolated static func setVolume(_ value: Float32, device: AudioDeviceID, scope: AudioObjectPropertyScope) -> Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(device, &address) else { return false }
        var settable = DarwinBoolean(false)
        guard AudioObjectIsPropertySettable(device, &address, &settable) == noErr,
              settable.boolValue else { return false }
        var scalar = value
        return AudioObjectSetPropertyData(
            device, &address, 0, nil, UInt32(MemoryLayout<Float32>.size), &scalar
        ) == noErr
    }
}

private extension Int {
    var clampedPercentage: Int { Swift.min(100, Swift.max(0, self)) }
}
