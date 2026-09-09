import Foundation
import XCTest
@testable import Companion

@MainActor
private final class FakeDiscoveryBackend: DisplayDiscoveryBackend {
    var callbacks: [@MainActor (DisplayDiscoveryEvent) -> Void] = []
    var stops = 0
    func start(_ receive: @escaping @MainActor (DisplayDiscoveryEvent) -> Void) { callbacks.append(receive) }
    func stop() { stops += 1 }
    func emit(_ event: DisplayDiscoveryEvent) { callbacks.last?(event) }
}

final class CompanionDiscoveryTests: XCTestCase {
    private let fingerprint = String(repeating: "a", count: 64)
    private func display(_ host: String, id: String? = nil) -> DiscoveredDisplay {
        DiscoveredDisplay(id: id ?? fingerprint, name: "Desk", hostname: host, port: 9443)
    }

    func testWireRecordsAndSeparateWebPort() {
        let records = ["v": Data("1".utf8), "name": Data("Desk".utf8), "id": Data(fingerprint.utf8)]
        let result = DiscoveredDisplay.parse(hostname: "desk.local.", port: 9443, txt: records)
        XCTAssertEqual(result, display("desk.local"))
        XCTAssertEqual(result?.endpoint, "desk.local:9443")
        XCTAssertNil(DiscoveredDisplay.parse(hostname: "example.com", port: 9443, txt: records))
        XCTAssertNil(DiscoveredDisplay.parse(hostname: "evil.com/path.local", port: 9443, txt: records))
        XCTAssertNil(DiscoveredDisplay.parse(hostname: "user@desk.local", port: 9443, txt: records))
        XCTAssertNil(DiscoveredDisplay.parse(hostname: "desk.local", port: 9443, txt: [:]))
        XCTAssertNil(DiscoveredDisplay.parse(hostname: "desk.local", port: 0, txt: records))
        for (key, value) in [("v", "2"), ("id", "fake"), ("name", "\nDesk")] {
            var invalid = records; invalid[key] = Data(value.utf8)
            XCTAssertNil(DiscoveredDisplay.parse(hostname: "desk.local", port: 9443, txt: invalid))
        }
    }

    @MainActor
    func testDiscoveryLifecycleDuplicatesAndVanishedServices() {
        let backend = FakeDiscoveryBackend()
        let subject = CompanionDiscovery(backend: backend)
        subject.start()
        subject.start()
        XCTAssertTrue(subject.isSearching)
        XCTAssertEqual(backend.callbacks.count, 1)
        backend.emit(.found(key: "ethernet", display: display("desk.local")))
        backend.emit(.found(key: "wifi", display: display("desk.local")))
        backend.emit(.found(key: "other", display: display("other.local", id: String(repeating: "b", count: 64))))
        XCTAssertEqual(subject.displays.count, 2, "Same names are distinct; same identities are deduplicated")
        backend.emit(.removed(key: "ethernet"))
        XCTAssertEqual(subject.displays.count, 2)
        backend.emit(.removed(key: "wifi"))
        XCTAssertEqual(subject.displays.map(\.hostname), ["other.local"])
        subject.stop()
        subject.start()
        backend.callbacks[0](.found(key: "late", display: display("late.local")))
        XCTAssertTrue(subject.displays.isEmpty, "Cancelled session callbacks must be ignored")
        backend.emit(.unavailable(permissionDenied: true))
        XCTAssertFalse(subject.isSearching)
        XCTAssertTrue(subject.message.contains("Local Network"))
        backend.emit(.unavailable(permissionDenied: false))
        XCTAssertTrue(subject.message.contains("manually"))
        subject.stop()
        backend.emit(.found(key: "late", display: display("late.local")))
        XCTAssertFalse(subject.isSearching)
        XCTAssertTrue(subject.displays.isEmpty)
    }

    @MainActor
    func testEmptyResultsGuidanceKeepsListening() async throws {
        let backend = FakeDiscoveryBackend()
        let subject = CompanionDiscovery(backend: backend, emptyResultsDelay: .milliseconds(1))
        subject.start()
        try await Task.sleep(for: .milliseconds(30))
        XCTAssertTrue(subject.message.contains("No displays found"))
        XCTAssertTrue(subject.isSearching, "Troubleshooting guidance must not stop the live search indicator")
        backend.emit(.found(key: "late", display: display("desk.local")))
        XCTAssertEqual(subject.displays.count, 1)
        subject.stop()
    }

    func testRecoveryRequiresVerifiedIdentityAndAuthentication() {
        var recovery = CompanionEndpointRecovery()
        recovery.begin(savedEndpoint: "192.168.1.10")
        XCTAssertEqual(recovery.attempted, "192.168.1.10", "Saved endpoint is tried first")
        recovery.discovered([display("other.local", id: String(repeating: "b", count: 64))], expectedFingerprint: fingerprint)
        XCTAssertNil(recovery.candidate)
        recovery.discovered([display("desk.local")], expectedFingerprint: fingerprint)
        XCTAssertEqual(recovery.attempted, "192.168.1.10", "Discovery must not change an in-flight attempt")
        recovery.begin(savedEndpoint: "192.168.1.10")
        XCTAssertEqual(recovery.attempted, "desk.local:9443")
        XCTAssertNil(recovery.authenticatedEndpoint(expectedFingerprint: fingerprint), "Advertisement is not proof")
        recovery.verifiedFingerprint = String(repeating: "b", count: 64)
        XCTAssertNil(recovery.authenticatedEndpoint(expectedFingerprint: fingerprint), "Forged announcement cannot replace a pin")
        recovery.verifiedFingerprint = fingerprint
        XCTAssertEqual(recovery.authenticatedEndpoint(expectedFingerprint: fingerprint), "desk.local:9443")
        recovery.begin(savedEndpoint: "192.168.1.10")
        XCTAssertNil(recovery.verifiedFingerprint, "Each connection must verify its own certificate")
        recovery.discovered([], expectedFingerprint: fingerprint)
        recovery.begin(savedEndpoint: "192.168.1.10")
        XCTAssertEqual(recovery.attempted, "192.168.1.10", "Old firmware and removed results retain saved-address fallback")
    }

    @MainActor
    func testManualAddressAndPairingPageUseWebPort() {
        let url = CompanionStore.panelWebServerURL(from: display("desk.local").endpoint, tab: "connectors", connector: "mac_companion")
        XCTAssertEqual(url?.host, "desk.local")
        XCTAssertNil(url?.port)
        XCTAssertEqual(url?.scheme, "http")
        XCTAssertNotNil(CompanionStore.panelWebServerURL(from: "192.168.1.20"))
    }
}
