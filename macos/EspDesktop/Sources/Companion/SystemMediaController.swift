import CoreAudio
import Foundation

@MainActor
final class SystemMediaController {
    static let outputVolumeID = "media.output_volume"
    static let inputVolumeID = "media.input_volume"
    static let outputMuteID = "media.output_mute"
    static let inputMuteID = "media.input_mute"
    static let volumeControlIDs = Set([outputVolumeID, inputVolumeID, outputMuteID, inputMuteID])

    private struct DeviceKey: Hashable {
        let device: AudioDeviceID
        let scope: AudioObjectPropertyScope
    }
    private var restoreLevels: [DeviceKey: Float32] = [:]
    private let findDevice: (AudioObjectPropertyScope) -> AudioDeviceID?
    private let readVolume: (AudioDeviceID, AudioObjectPropertyScope) -> Float32?
    private let writeVolume: (Float32, AudioDeviceID, AudioObjectPropertyScope) -> Bool
    private let readMute: (AudioDeviceID, AudioObjectPropertyScope) -> Bool?
    private let writeMute: (Bool, AudioDeviceID, AudioObjectPropertyScope) -> Bool

    init(
        defaultDevice: @escaping (AudioObjectPropertyScope) -> AudioDeviceID? = SystemMediaController.defaultDevice,
        volume: @escaping (AudioDeviceID, AudioObjectPropertyScope) -> Float32? = SystemMediaController.volume,
        setVolume: @escaping (Float32, AudioDeviceID, AudioObjectPropertyScope) -> Bool = SystemMediaController.setVolume,
        mute: @escaping (AudioDeviceID, AudioObjectPropertyScope) -> Bool? = SystemMediaController.mute,
        setMute: @escaping (Bool, AudioDeviceID, AudioObjectPropertyScope) -> Bool = SystemMediaController.setMute
    ) {
        findDevice = defaultDevice
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
        let candidates = force ? volumeControlIDs : Set(previousValues.keys)
        return candidates.subtracting(values.keys)
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
            // An external volume adjustment ends the zero-level fallback mute.
            if let level {
                if level > 0 { restoreLevels.removeValue(forKey: key) }
                result[volumeID] = Int((level * 100).rounded()).clampedPercentage
            }
            // Never offer an unmute that would have to guess an unknown level.
            if let muted = readMute(device, scope) {
                result[muteID] = muted ? 100 : 0
            } else if let level, level > 0 || restoreLevels[key] != nil {
                result[muteID] = level == 0 ? 100 : 0
            }
        }
        return result
    }

    func setValue(_ value: Int, controlIdentifier: String) -> Bool {
        let scope: AudioObjectPropertyScope
        switch controlIdentifier {
        case Self.outputVolumeID, Self.outputMuteID: scope = kAudioDevicePropertyScopeOutput
        case Self.inputVolumeID, Self.inputMuteID: scope = kAudioDevicePropertyScopeInput
        default: return false
        }
        guard let device = findDevice(scope) else { return false }
        let key = DeviceKey(device: device, scope: scope)
        if controlIdentifier == Self.outputMuteID || controlIdentifier == Self.inputMuteID {
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
        guard writeVolume(Float32(value.clampedPercentage) / 100, device, scope) else { return false }
        if value > 0 {
            restoreLevels.removeValue(forKey: key)
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
