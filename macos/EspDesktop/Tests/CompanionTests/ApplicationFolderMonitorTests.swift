import XCTest
@testable import Companion

final class ApplicationFolderMonitorTests: XCTestCase {
    func testDetectsNestedInstallInNewUserApplicationsFolderAndRemoval() throws {
        let files = FileManager.default
        let root = files.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let sharedApps = root.appendingPathComponent("Shared Applications")
        let home = root.appendingPathComponent("Home")
        let userApps = home.appendingPathComponent("Applications")
        let nestedApps = userApps.appendingPathComponent("Utilities")
        let app = nestedApps.appendingPathComponent("Example.app")
        try files.createDirectory(at: sharedApps, withIntermediateDirectories: true)
        try files.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? files.removeItem(at: root) }

        let installed = expectation(description: "Detected a nested app install")
        let removed = expectation(description: "Detected removal of the nested app")
        installed.assertForOverFulfill = false
        removed.assertForOverFulfill = false
        let monitor = try XCTUnwrap(ApplicationFolderMonitor(
            sharedApplications: sharedApps, userApplications: userApps
        ) {
            let files = FileManager.default
            if files.fileExists(atPath: app.path) {
                installed.fulfill()
            } else if files.fileExists(atPath: nestedApps.path) {
                removed.fulfill()
            }
        })
        defer { withExtendedLifetime(monitor) {} }

        try files.createDirectory(at: app, withIntermediateDirectories: true)
        wait(for: [installed], timeout: 10)
        try files.removeItem(at: app)
        wait(for: [removed], timeout: 10)
    }
}
