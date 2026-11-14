import CoreGraphics
import Darwin
import Foundation

/// Resolve DisplayServices at runtime so unsupported macOS versions/displays
/// remain unavailable without preventing the companion app from launching.
@MainActor
final class SystemDisplayBrightness {
    typealias GetBrightness = @convention(c) (CGDirectDisplayID, UnsafeMutablePointer<Float>) -> Int32
    typealias SetBrightness = @convention(c) (CGDirectDisplayID, Float) -> Int32
    private let framework: UnsafeMutableRawPointer?
    private let readBrightness: GetBrightness?
    private let writeBrightness: SetBrightness?

    init() {
        let handle = dlopen("/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices", RTLD_LAZY | RTLD_LOCAL)
        framework = handle
        readBrightness = handle.flatMap { dlsym($0, "DisplayServicesGetBrightness") }.map { unsafeBitCast($0, to: GetBrightness.self) }
        writeBrightness = handle.flatMap { dlsym($0, "DisplayServicesSetBrightness") }.map { unsafeBitCast($0, to: SetBrightness.self) }
    }

    init(readBrightness: GetBrightness?, writeBrightness: SetBrightness?) {
        framework = nil
        self.readBrightness = readBrightness
        self.writeBrightness = writeBrightness
    }

    func value() -> Int? {
        guard let readBrightness, writeBrightness != nil else { return nil }
        var brightness: Float = 0
        guard readBrightness(CGMainDisplayID(), &brightness) == 0,
              brightness.isFinite, (0...1).contains(brightness) else { return nil }
        return Int((brightness * 100).rounded())
    }

    func setValue(_ value: Int) -> Bool {
        guard let writeBrightness, self.value() != nil else { return false }
        return writeBrightness(CGMainDisplayID(), Float(min(100, max(0, value))) / 100) == 0
    }
}
