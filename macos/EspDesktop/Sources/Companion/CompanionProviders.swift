import Foundation

// Narrow OS-facing ports keep CompanionStore focused on product state and
// transport orchestration. Tests and future macOS implementations can replace
// any provider without constructing the real system integration.

@MainActor
protocol SystemMetricsProviding: AnyObject {
    var onSnapshot: ((CompanionSystemMetricsSnapshot) -> Void)? { get set }
    func start()
    func stop()
}

@MainActor
protocol MediaControlling: AnyObject {
    func values() -> [String: Int]
    func setValue(_ value: Int, controlIdentifier: String) -> Bool
    func unavailableVolumeIDs(
        values: [String: Int],
        previousValues: [String: Int],
        force: Bool
    ) -> Set<String>
}

extension SystemMetricsProvider: SystemMetricsProviding {}

extension SystemMediaController: MediaControlling {


    func unavailableVolumeIDs(
        values: [String: Int],
        previousValues: [String: Int],
        force: Bool
    ) -> Set<String> {
        Self.unavailableVolumeIDs(values: values, previousValues: previousValues, force: force)
    }
}
