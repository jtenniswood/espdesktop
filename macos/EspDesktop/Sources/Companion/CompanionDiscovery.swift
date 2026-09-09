import Combine
import Foundation
import Network

struct DiscoveredDisplay: Identifiable, Equatable {
    let id: String // Untrusted certificate fingerprint; TLS still verifies identity.
    let name: String
    let hostname: String
    let port: Int

    var endpoint: String { "\(hostname):\(port)" }

    static func parse(hostname: String, port: Int, txt: [String: Data]) -> Self? {
        func value(_ key: String) -> String? { txt[key].flatMap { String(data: $0, encoding: .utf8) } }
        let host = hostname.hasSuffix(".") ? String(hostname.dropLast()) : hostname
        guard value("v") == "1", let fingerprint = value("id"), fingerprint.count == 64,
              fingerprint.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
              host.lowercased().hasSuffix(".local"), host.utf8.count <= 253,
              host.split(separator: ".", omittingEmptySubsequences: false).allSatisfy({ label in
                  !label.isEmpty && label.utf8.count <= 63 && label.first != "-" && label.last != "-"
                      && label.utf8.allSatisfy { (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 }
              }), ConnectionEndpointPolicy.isLocalHost(host),
              (1...65535).contains(port), let name = value("name"), !name.isEmpty,
              name.utf8.count <= 200, !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
        else { return nil }
        return Self(id: fingerprint, name: name, hostname: host, port: port)
    }
}

enum DisplayDiscoveryEvent {
    case found(key: String, display: DiscoveredDisplay)
    case removed(key: String)
    case unavailable(permissionDenied: Bool)
}

@MainActor
protocol DisplayDiscoveryBackend: AnyObject {
    func start(_ receive: @escaping @MainActor (DisplayDiscoveryEvent) -> Void)
    func stop()
}

/// Owns one browse session. Callbacks from stopped sessions cannot update a new one.
@MainActor
final class CompanionDiscovery: ObservableObject {
    @Published private(set) var displays: [DiscoveredDisplay] = []
    @Published private(set) var message = "Displays will appear here automatically."
    @Published private(set) var isSearching = false
    private let backend: any DisplayDiscoveryBackend
    private let emptyResultsDelay: Duration
    private var records: [String: DiscoveredDisplay] = [:]
    private var generation = 0
    private var active = false
    private var timeout: Task<Void, Never>?
    var onChange: (([DiscoveredDisplay]) -> Void)?

    init(backend: any DisplayDiscoveryBackend = BonjourDisplayDiscovery(), emptyResultsDelay: Duration = .seconds(10)) {
        self.backend = backend
        self.emptyResultsDelay = emptyResultsDelay
    }

    func start() {
        guard !active else { return }
        active = true
        isSearching = true
        generation += 1
        let current = generation
        records = [:]
        displays = []
        message = "Displays will appear here automatically."
        backend.start { [weak self] event in
            guard let self, self.active, self.generation == current else { return }
            switch event {
            case let .found(key, display):
                self.isSearching = true
                self.records[key] = display
            case let .removed(key): self.records.removeValue(forKey: key)
            case let .unavailable(denied):
                self.isSearching = false
                self.message = denied
                    ? "Allow EspDesktop in System Settings → Privacy & Security → Local Network, then retry. You can also enter an address manually."
                    : "Discovery is unavailable. Check your network or enter an address manually."
                self.timeout?.cancel()
            }
            // Deterministic deduplication across interfaces and service instances.
            var seen = Set<String>()
            self.displays = self.records.values.sorted { ($0.name, $0.hostname, $0.port) < ($1.name, $1.hostname, $1.port) }
                .filter { seen.insert($0.id).inserted }
            self.onChange?(self.displays)
        }
        let delay = emptyResultsDelay
        timeout = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let self, self.generation == current else { return }
            self.message = "No displays found? Check that both devices are on the same network and the display firmware supports discovery. You can enter its address manually."
        }
    }

    func stop() {
        active = false
        isSearching = false
        generation += 1
        timeout?.cancel()
        timeout = nil
        backend.stop()
        records = [:]
        displays = []
    }
}

/// NWBrowser supplies permission state and service lifecycle; NetService resolves
/// the hostname and port needed by the existing URLSession WebSocket transport.
@MainActor
final class BonjourDisplayDiscovery: DisplayDiscoveryBackend {
    static let serviceType = "_espdesktop._tcp"
    private var browser: NWBrowser?
    private var resolutions: [String: BonjourDisplayResolution] = [:]
    private var generation = 0

    func start(_ receive: @escaping @MainActor (DisplayDiscoveryEvent) -> Void) {
        stop()
        let current = generation
        let browser = NWBrowser(for: .bonjour(type: Self.serviceType, domain: "local."), using: .tcp)
        self.browser = browser
        browser.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                guard let self, self.generation == current else { return }
                switch state {
                case .waiting(let error), .failed(let error):
                    receive(.unavailable(permissionDenied: error == .dns(-65570)))
                default: break
                }
            }
        }
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in
                guard let self, self.generation == current else { return }
                var keys = Set<String>()
                for result in results {
                    guard case let .service(name, type, domain, _) = result.endpoint else { continue }
                    let key = "\(name)|\(type)|\(domain)"
                    keys.insert(key)
                    guard self.resolutions[key] == nil else { continue }
                    let resolution = BonjourDisplayResolution(name: name, type: type, domain: domain) { [weak self] display in
                        guard let self, self.generation == current, self.resolutions[key] != nil else { return }
                        if let display { receive(.found(key: key, display: display)) }
                        else { receive(.removed(key: key)) }
                    }
                    self.resolutions[key] = resolution
                    resolution.start()
                }
                for key in Set(self.resolutions.keys).subtracting(keys) {
                    self.resolutions.removeValue(forKey: key)?.stop()
                    receive(.removed(key: key))
                }
            }
        }
        browser.start(queue: .main)
    }

    func stop() {
        generation += 1
        browser?.cancel()
        browser = nil
        for resolution in resolutions.values { resolution.stop() }
        resolutions = [:]
    }
}

@MainActor
private final class BonjourDisplayResolution: NSObject, @preconcurrency NetServiceDelegate {
    private let service: NetService
    private let receive: (DiscoveredDisplay?) -> Void
    private var retry: Task<Void, Never>?
    private var active = false

    init(name: String, type: String, domain: String, receive: @escaping (DiscoveredDisplay?) -> Void) {
        service = NetService(domain: domain, type: type, name: name)
        self.receive = receive
        super.init()
        service.delegate = self
    }
    func start() {
        active = true
        service.resolve(withTimeout: 5)
    }
    func stop() {
        active = false
        retry?.cancel()
        service.stopMonitoring()
        service.stop()
        service.delegate = nil
    }
    func netServiceDidResolveAddress(_ sender: NetService) {
        guard active else { return }
        publish(sender.txtRecordData())
        sender.startMonitoring()
    }
    func netService(_ sender: NetService, didUpdateTXTRecord data: Data) {
        guard active else { return }
        publish(data)
    }
    private func publish(_ data: Data?) {
        guard let hostname = service.hostName, let data else { receive(nil); return }
        receive(DiscoveredDisplay.parse(hostname: hostname, port: service.port, txt: NetService.dictionary(fromTXTRecord: data)))
    }
    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        guard active else { return }
        receive(nil)
        retry?.cancel()
        retry = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled, let self, self.active else { return }
            self.service.resolve(withTimeout: 5)
        }
    }
}

/// Keeps an advertised candidate separate from the address actually being
/// authenticated, and from the saved endpoint. Discovery alone cannot commit it.
struct CompanionEndpointRecovery {
    var candidate: String?
    private(set) var attempted: String?
    var verifiedFingerprint: String?

    mutating func discovered(_ displays: [DiscoveredDisplay], expectedFingerprint: String?) {
        candidate = displays.first(where: { $0.id == expectedFingerprint })?.endpoint
    }
    mutating func begin(savedEndpoint: String) {
        attempted = candidate ?? savedEndpoint
        verifiedFingerprint = nil
    }
    func authenticatedEndpoint(expectedFingerprint: String?) -> String? {
        guard let verifiedFingerprint, verifiedFingerprint == expectedFingerprint else { return nil }
        return attempted
    }
}
