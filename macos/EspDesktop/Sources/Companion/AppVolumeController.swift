import Foundation
import AppKit
import AudioToolbox
import CoreAudio
import os

protocol AppVolumeControlling: Sendable {
    func setLevel(_ level: Int, for bundleID: String, bundleURL: URL) async -> Bool
    func levels(for selectedApps: [String: URL]) async -> [String: Int]
    func reset() async
}

/// Core Audio device creation and teardown can block. Keep them off the UI and
/// serialize them so a later volume command cannot overtake an earlier one.
@available(macOS 14.2, *)
actor AppVolumeController: AppVolumeControlling {
    private struct Route: Equatable {
        let output: AudioObjectID
        let uid: String
        let processes: [AudioObjectID]
        let sampleRate: Double
    }

    private struct Adjustment {
        var level: Int
        var route: Route?
        var playback: AppVolumePlayback?
    }

    private var adjustments: [String: Adjustment] = [:]

    func setLevel(_ level: Int, for bundleID: String, bundleURL: URL) -> Bool {
        guard !Task.isCancelled, (0...100).contains(level) else { return false }
        if level == 100 {
            adjustments.removeValue(forKey: bundleID)?.playback?.stop()
            return true
        }
        var adjustment = adjustments[bundleID] ?? Adjustment(level: 100)
        let route = Self.route(bundleID: bundleID, bundleURL: bundleURL, output: Self.outputDevice())
        adjustment.level = level
        guard update(&adjustment, route: route) else {
            adjustments.removeValue(forKey: bundleID)
            return false
        }
        adjustments[bundleID] = adjustment
        return true
    }

    func levels(for selectedApps: [String: URL]) -> [String: Int] {
        guard !adjustments.isEmpty else { return [:] }
        let output = Self.outputDevice()
        for bundleID in Array(adjustments.keys) {
            guard var adjustment = adjustments.removeValue(forKey: bundleID) else { continue }
            guard let url = selectedApps[bundleID] else {
                adjustment.playback?.stop()
                continue
            }
            let route = Self.route(bundleID: bundleID, bundleURL: url, output: output)
            if update(&adjustment, route: route) {
                adjustments[bundleID] = adjustment
            }
        }
        return adjustments.mapValues(\.level)
    }

    func reset() {
        for adjustment in adjustments.values { adjustment.playback?.stop() }
        adjustments.removeAll()
    }

    private func update(_ adjustment: inout Adjustment, route: Route?) -> Bool {
        if let playback = adjustment.playback, adjustment.route == route {
            guard playback.receivingAudioCallbacks else {
                playback.stop()
                return false
            }
            playback.setLevel(adjustment.level)
            return true
        }
        adjustment.playback?.stop()
        adjustment.playback = nil
        adjustment.route = route
        guard let route else { return true }
        adjustment.playback = AppVolumePlayback.start(
            output: route.output, uid: route.uid, processes: route.processes, level: adjustment.level
        )
        return adjustment.playback != nil
    }

    private static func outputDevice() -> AudioObjectID {
        var output = AudioObjectID(kAudioObjectUnknown)
        _ = get(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, &output)
        return output
    }

    private static func route(bundleID: String, bundleURL: URL, output: AudioObjectID) -> Route? {
        guard output != kAudioObjectUnknown else { return nil }
        var uid: Unmanaged<CFString>?
        var sampleRate: Double = 0
        guard get(output, kAudioDevicePropertyDeviceUID, &uid),
              let uid = uid?.takeRetainedValue() as String?,
              get(output, kAudioDevicePropertyNominalSampleRate, &sampleRate) else { return nil }

        let appPath = bundleURL.resolvingSymlinksInPath().path + "/"
        let processes = objectIDs(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyProcessObjectList)
            .filter { process in
                var pid: pid_t = 0
                guard get(process, kAudioProcessPropertyPID, &pid), pid > 0, pid != getpid(),
                      objectIDs(process, kAudioProcessPropertyDevices, scope: kAudioObjectPropertyScopeOutput)
                        .contains(output) else { return false }
                var identifier: Unmanaged<CFString>?
                let processBundleID = get(process, kAudioProcessPropertyBundleID, &identifier)
                    ? identifier?.takeRetainedValue() as String? : nil
                if processBundleID == bundleID { return true }
                if webKitHelperBelongsToApp(processBundleID, appBundleID: bundleID, ownerBundleID: {
                    responsibleApplicationBundleID(for: pid)
                }) { return true }
                // Chromium and Electron can play through helper executables
                // inside the approved app bundle.
                var path = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
                guard proc_pidpath(pid, &path, UInt32(path.count)) > 0,
                      let end = path.firstIndex(of: 0) else { return false }
                let executable = String(decoding: path[..<end].map { UInt8(bitPattern: $0) }, as: UTF8.self)
                return URL(fileURLWithPath: executable).resolvingSymlinksInPath().path.hasPrefix(appPath)
            }
        guard !processes.isEmpty else { return nil }
        return Route(output: output, uid: uid, processes: processes.sorted(), sampleRate: sampleRate)
    }

    static func webKitHelperBelongsToApp(
        _ helperBundleID: String?, appBundleID: String, ownerBundleID: () -> String?
    ) -> Bool {
        guard helperBundleID == "com.apple.WebKit.GPU" || helperBundleID == "com.apple.WebKit.WebContent" else {
            return false
        }
        return ownerBundleID() == appBundleID
    }

    private static let responsiblePID: (@convention(c) (pid_t) -> pid_t)? = {
        // WebKit XPC services can have launchd as their parent. Look up the
        // responsible app when macOS provides this undocumented symbol.
        let defaultSymbolScope = UnsafeMutableRawPointer(bitPattern: -2)
        guard let symbol = dlsym(defaultSymbolScope, "responsibility_get_pid_responsible_for_pid") else { return nil }
        return unsafeBitCast(symbol, to: (@convention(c) (pid_t) -> pid_t).self)
    }()

    private static func responsibleApplicationBundleID(for pid: pid_t) -> String? {
        guard let owner = responsiblePID?(pid), owner > 1, owner != pid else { return nil }
        return NSRunningApplication(processIdentifier: owner)?.bundleIdentifier
    }

    fileprivate static func get<T>(
        _ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ value: inout T,
        scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal
    ) -> Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain
        )
        var size = UInt32(MemoryLayout<T>.size)
        return withUnsafeMutableBytes(of: &value) {
            AudioObjectGetPropertyData(object, &address, 0, nil, &size, $0.baseAddress!) == noErr
        }
    }

    fileprivate static func objectIDs(
        _ object: AudioObjectID, _ selector: AudioObjectPropertySelector,
        scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal
    ) -> [AudioObjectID] {
        var address = AudioObjectPropertyAddress(
            mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        let stride = MemoryLayout<AudioObjectID>.stride
        guard AudioObjectGetPropertyDataSize(object, &address, 0, nil, &size) == noErr,
              size >= stride else { return [] }
        var objects = [AudioObjectID](repeating: 0, count: Int(size) / stride)
        let status = objects.withUnsafeMutableBytes {
            AudioObjectGetPropertyData(object, &address, 0, nil, &size, $0.baseAddress!)
        }
        return status == noErr ? Array(objects.prefix(Int(size) / stride)) : []
    }
}

@available(macOS 14.2, *)
private final class AppVolumePlayback {
    private let tap: AudioObjectID
    private let device: AudioObjectID
    private let callback: AudioDeviceIOProcID
    private let render: RenderState
    private let started = DispatchTime.now().uptimeNanoseconds
    private var stopped = false

    private struct Settings {
        var gain: Float
        var lastCallback: UInt64 = 0
    }

    private final class RenderState: @unchecked Sendable {
        let settings: OSAllocatedUnfairLock<Settings>
        // Only the Core Audio callback reads or writes currentGain.
        var currentGain: Float

        init(level: Int) {
            let gain = Float(level) / 100
            settings = OSAllocatedUnfairLock(initialState: Settings(gain: gain))
            currentGain = gain
        }
    }

    private init(tap: AudioObjectID, device: AudioObjectID, callback: AudioDeviceIOProcID, render: RenderState) {
        self.tap = tap
        self.device = device
        self.callback = callback
        self.render = render
    }

    deinit { stop() }

    func stop() {
        guard !stopped else { return }
        stopped = true
        AudioDeviceStop(device, callback)
        AudioDeviceDestroyIOProcID(device, callback)
        AudioHardwareDestroyAggregateDevice(device)
        AudioHardwareDestroyProcessTap(tap)
    }

    var receivingAudioCallbacks: Bool {
        let last = render.settings.withLock { $0.lastCallback }
        return DispatchTime.now().uptimeNanoseconds - max(started, last) < 3_000_000_000
    }

    func setLevel(_ level: Int) {
        render.settings.withLock { $0.gain = Float(level) / 100 }
    }

    private static func channelLayout(_ device: AudioObjectID, scope: AudioObjectPropertyScope) -> [UInt32]? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration, mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(device, &address, 0, nil, &size) == noErr,
              size >= MemoryLayout<AudioBufferList>.size else { return nil }
        let storage = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { storage.deallocate() }
        guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, storage) == noErr else { return nil }
        let buffers = UnsafeMutableAudioBufferListPointer(storage.assumingMemoryBound(to: AudioBufferList.self))
        return buffers.map(\.mNumberChannels)
    }

    static func start(output: AudioObjectID, uid: String, processes: [AudioObjectID], level: Int) -> AppVolumePlayback? {
        let streams = AppVolumeController.objectIDs(output, kAudioDevicePropertyStreams, scope: kAudioObjectPropertyScopeOutput)
        guard streams.count == 1,
              let outputLayout = channelLayout(output, scope: kAudioObjectPropertyScopeOutput),
              outputLayout.count == 1, let channels = outputLayout.first, channels > 0 else { return nil }
        // A stream-specific tap keeps the device's channel layout, including
        // multichannel outputs such as Studio Display speakers.
        let description = CATapDescription(processes: processes, deviceUID: uid, stream: 0)
        description.name = "EspDesktop App Volume"
        description.isPrivate = true
        description.muteBehavior = .mutedWhenTapped
        var tap = AudioObjectID(kAudioObjectUnknown)
        guard AudioHardwareCreateProcessTap(description, &tap) == noErr else { return nil }
        var playback: AppVolumePlayback?
        defer { if playback == nil { AudioHardwareDestroyProcessTap(tap) } }

        var format = AudioStreamBasicDescription()
        guard AppVolumeController.get(tap, kAudioTapPropertyFormat, &format),
              format.mFormatID == kAudioFormatLinearPCM,
              format.mFormatFlags & kAudioFormatFlagIsFloat != 0,
              format.mFormatFlags & kAudioFormatFlagIsBigEndian == 0,
              format.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0,
              format.mBitsPerChannel == 32, format.mChannelsPerFrame == channels,
              format.mBytesPerFrame == channels * 4 else { return nil }
        let inputs = channelLayout(output, scope: kAudioObjectPropertyScopeInput) ?? []
        var device = AudioObjectID(kAudioObjectUnknown)
        let configuration: [String: Any] = [
            kAudioAggregateDeviceNameKey: "EspDesktop App Volume",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceMainSubDeviceKey: uid,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: uid]],
            kAudioAggregateDeviceTapListKey: [[
                kAudioSubTapUIDKey: description.uuid.uuidString,
                kAudioSubTapDriftCompensationKey: true,
            ]],
        ]
        guard AudioHardwareCreateAggregateDevice(configuration as CFDictionary, &device) == noErr else { return nil }
        defer { if playback == nil { AudioHardwareDestroyAggregateDevice(device) } }

        // The tap follows the subdevice's inputs. Verify the aggregate layout
        // before starting and never read the hardware input buffers.
        guard channelLayout(device, scope: kAudioObjectPropertyScopeInput) == inputs + [channels],
              channelLayout(device, scope: kAudioObjectPropertyScopeOutput) == outputLayout else { return nil }
        let tapIndex = inputs.count
        if inputs.contains(channels) {
            // Equal channel counts cannot distinguish a microphone from the tap.
            // Require Core Audio to identify every other input as hardware.
            let streams = AppVolumeController.objectIDs(device, kAudioDevicePropertyStreams, scope: kAudioObjectPropertyScopeInput)
            guard streams.count == tapIndex + 1 else { return nil }
            let unknownInputs = streams.enumerated().compactMap { index, stream -> Int? in
                var terminal: UInt32 = 0
                let known = AppVolumeController.get(stream, kAudioStreamPropertyTerminalType, &terminal) && terminal != 0
                return known ? nil : index
            }
            guard unknownInputs == [tapIndex] else { return nil }
        }
        let render = RenderState(level: level)
        var callback: AudioDeviceIOProcID?
        let status = AudioDeviceCreateIOProcIDWithBlock(&callback, device, nil) { _, inputData, _, outputData, _ in
            let inputs = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inputData))
            let outputs = UnsafeMutableAudioBufferListPointer(outputData)
            for buffer in outputs {
                if let data = buffer.mData { memset(data, 0, Int(buffer.mDataByteSize)) }
            }
            guard inputs.count == tapIndex + 1, outputs.count == 1 else { return }
            let source = inputs[tapIndex]
            let destination = outputs[0]
            guard source.mNumberChannels == channels, destination.mNumberChannels == channels,
                  let input = source.mData?.assumingMemoryBound(to: Float.self),
                  let output = destination.mData?.assumingMemoryBound(to: Float.self) else { return }
            let sampleCount = Int(min(source.mDataByteSize, destination.mDataByteSize)) / MemoryLayout<Float>.size
            guard sampleCount >= channels, sampleCount.isMultiple(of: Int(channels)) else { return }
            let gain = render.settings.withLockIfAvailable { settings in
                settings.lastCallback = DispatchTime.now().uptimeNanoseconds
                return settings.gain
            } ?? render.currentGain
            let start = render.currentGain
            for sample in 0..<sampleCount {
                let frame = sample / Int(channels)
                let mix = Float(frame + 1) / Float(sampleCount / Int(channels))
                output[sample] = input[sample].isFinite ? input[sample] * (start + (gain - start) * mix) : 0
            }
            render.currentGain = gain
        }
        guard status == noErr, let callback else { return nil }
        guard AudioDeviceStart(device, callback) == noErr else {
            AudioDeviceDestroyIOProcID(device, callback)
            return nil
        }
        playback = AppVolumePlayback(tap: tap, device: device, callback: callback, render: render)
        return playback
    }
}
