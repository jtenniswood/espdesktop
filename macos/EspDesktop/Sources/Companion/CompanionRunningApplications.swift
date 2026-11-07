import Foundation

// NSRunningApplication is the source of truth: windows, hidden status and
// minimization do not determine whether the whole application is running.
enum CompanionRunningApplications {
    static func identifiers(
        in applications: [(identifier: String?, terminated: Bool)], approved: Set<String>
    ) -> [String] {
        Array(Set(applications.compactMap { application in
            guard !application.terminated, let identifier = application.identifier,
                  approved.contains(identifier) else { return nil as String? }
            return identifier
        })).sorted()
    }
}

@MainActor
struct CompanionRunningApplicationsPublisher {
    private var previous: [String]?

    mutating func publish(_ identifiers: [String], send: ([String]) -> Void) {
        let current = Array(Set(identifiers)).sorted().prefix(128)
        let values = Array(current)
        guard previous != values else { return }
        previous = values
        send(values)
    }

    mutating func reset() { previous = nil }
}
