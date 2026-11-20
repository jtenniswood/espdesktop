import Foundation
import JavaScriptCore

@MainActor
final class AppleHomeDeviceEditor {
    static var asset: URL? { Bundle.main.url(forResource: "apple-home-editor", withExtension: "js") }

    private let display: CompanionDisplay
    private let panel: URL
    private let account: String
    private let home: AppleHomeScenes
    private let session = URLSession(configuration: .ephemeral, delegate: DirectConnection(), delegateQueue: nil)
    private var supportsNativeLayout = false

    init(display: CompanionDisplay, panel: URL, home: AppleHomeScenes) {
        self.display = display
        self.panel = panel
        account = display.pairingAccount
        self.home = home
    }

    var isCurrent: Bool {
        display.hasSavedPairing && !display.usesUSB && display.pairingAccount == account &&
            CompanionStore.panelWebServerURL(from: display.record.host) == panel
    }

    func localControls(onContinueSetup: (() -> Void)? = nil) throws -> USBEditorResponse {
        guard isCurrent, display.state == .connected else {
            return USBEditorResponse(status: 503, headers: [:], body: Data())
        }
        guard supportsNativeLayout else {
            return USBEditorResponse(status: 426, headers: [:], body: Data())
        }
        if let onContinueSetup, home.status == nil || home.status == .chooseHome {
            home.onContinueSetup = onContinueSetup
            home.connect()
        }
        let controls = home.status == .ready ? home.controls : []
        let entries = controls.map { control in
            var entry = ["id": control.action, "label": control.name]
            entry["suggestedIcon"] = control.suggestedIcon
            return entry
        }
        let catalogue = LocalCatalogue(status: home.status?.rawValue ?? "disconnected", note: home.note, controls: entries)
        return USBEditorResponse(status: 200, headers: ["content-type": "application/json"],
                                 body: try JSONEncoder().encode(catalogue))
    }

    private struct LocalCatalogue: Encodable {
        let status: String
        let note: String
        let controls: [[String: String]]
    }

    func request(_ request: USBEditorRequest, authorization: String?) async throws -> USBEditorResponse {
        guard isCurrent, let url = URL(string: request.path, relativeTo: panel) else {
            throw EditorError("The display’s connection changed. Reopen Device Settings.")
        }
        var outbound = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        outbound.httpMethod = request.method
        for (name, value) in request.headers { outbound.setValue(value, forHTTPHeaderField: name) }
        if let authorization { outbound.setValue(authorization, forHTTPHeaderField: "Authorization") }
        if !request.body.isEmpty { outbound.httpBody = request.body }

        let binding = home.readyBinding
        let cards = request.method == "PUT" && request.path == "/api/v1/config" &&
            request.headers["x-panel-config-version"] == "2" && binding != nil
            ? try Self.savedCards(in: request.body) : nil
        let (body, response) = try await session.data(for: outbound)
        guard let response = response as? HTTPURLResponse, body.count <= USBEditorResponse.maximumBytes else {
            throw USBEditorError.invalidResponse
        }
        if request.method == "GET", request.path == "/api/v1/config", response.statusCode == 200,
           response.value(forHTTPHeaderField: "X-Panel-Config-Version") == "2" {
            supportsNativeLayout = true
        }
        if (response.statusCode == 204 || response.statusCode == 202),
           isCurrent, display.state == .connected, let binding, let cards {
            // A display becomes authorized only after it accepts the layout from
            // the local editor. The labels come from that layout, never HomeKit.
            home.updateEditorCards(cards, for: account, binding: binding)
        }
        return USBEditorResponse(status: response.statusCode, headers: response.allHeaderFields.reduce(into: [:]) {
            if let key = $1.key as? String, let value = $1.value as? String { $0[key.lowercased()] = value }
        }, body: body)
    }

    func invalidate() { session.invalidateAndCancel() }

    struct SavedCard: Equatable {
        let reference: UUID
        let label: String
    }

    static func savedCards(in layout: Data, source: String? = nil) throws -> [SavedCard] {
        guard layout.count <= 512 * 1024, let js = JSContext(),
              let source = try source ?? Bundle.main.url(forResource: "apple-home-page", withExtension: "js")
                .map({ try String(contentsOf: $0, encoding: .utf8) }) else {
            throw EditorError("Could not read the Apple Home cards in this layout.")
        }
        let encode: @convention(block) (String) -> [UInt8] = { Array($0.utf8) }
        let decode: @convention(block) ([UInt8]) -> String? = { String(bytes: $0, encoding: .utf8) }
        js.setObject(encode, forKeyedSubscript: "appleHomeEncodeUTF8" as NSString)
        js.setObject(decode, forKeyedSubscript: "appleHomeDecodeUTF8" as NSString)
        js.evaluateScript(source)
        let result = js.objectForKeyedSubscript("appleHomeSavedCards")?.call(withArguments: [Array(layout)])
        guard js.exception == nil, let rows = result?.toArray() as? [[String: String]] else {
            throw EditorError("Could not read the Apple Home cards in this layout.")
        }
        return rows.compactMap { row in
            guard let action = row["action"], let reference = AppleHomeControl.reference(for: action),
                  let label = row["label"]?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !label.isEmpty, label.utf8.count <= 80 else { return nil }
            return SavedCard(reference: reference, label: label)
        }
    }

    private struct EditorError: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    private final class DirectConnection: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest) async -> URLRequest? { nil }
    }
}
