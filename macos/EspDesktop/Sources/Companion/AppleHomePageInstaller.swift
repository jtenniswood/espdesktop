import Foundation
import JavaScriptCore

@MainActor
enum AppleHomePageInstaller {
    private static let format = "application/vnd.espdesktop.panel-config"

    static var asset: URL? { Bundle.main.url(forResource: "apple-home-page", withExtension: "js") }

    static func install(at panel: URL, beforeSave: () throws -> Void) async throws -> String {
        guard let asset else { throw InstallError("The Apple Home setup tool is missing.") }
        let session = URLSession(configuration: .ephemeral, delegate: DirectConnection(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let source = try String(contentsOf: asset, encoding: .utf8)
        return try await install(at: panel, source: source, beforeSave: beforeSave) { try await session.data(for: $0) }
    }

    static func install(at panel: URL, source: String,
                        beforeSave: () throws -> Void = {},
                        fetch: (URLRequest) async throws -> (Data, URLResponse)) async throws -> String {
        let resetURL = panel.appending(path: "api/v1/reset")
        let (resetData, resetReply) = try await fetch(URLRequest(
            url: resetURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8
        ))
        let epoch: UInt32?
        switch (resetReply as? HTTPURLResponse)?.statusCode {
        case 200:
            let resetStatus = try JSONDecoder().decode(ResetStatus.self, from: resetData)
            guard !resetStatus.pending else { throw InstallError("The display is resetting. Try again when it is ready.") }
            epoch = resetStatus.epoch
        case 404: epoch = nil
        case 401, 403: throw InstallError("The display configuration is password protected.")
        default: throw InstallError("The display could not confirm that it is ready to change settings.")
        }
        let destination = panel.appending(path: "api/v1/config")
        var read = URLRequest(url: destination, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        read.setValue("2", forHTTPHeaderField: "X-Panel-Config-Version")
        let (current, remote) = try await fetch(read)
        guard let response = remote as? HTTPURLResponse else { throw InstallError("The display did not respond.") }
        guard response.statusCode != 401 else { throw InstallError("The display configuration is password protected.") }
        guard response.statusCode == 200, response.value(forHTTPHeaderField: "X-Panel-Config-Version") == "2",
              let generation = response.value(forHTTPHeaderField: "ETag") else {
            throw InstallError("This display does not support Apple Home page setup.")
        }
        let proposed = try generate(input: current, source: source)
        try beforeSave()
        guard let layout = proposed else {
            return "The Apple Home page is already on this display."
        }

        var write = read
        write.httpMethod = "PUT"
        write.setValue(format, forHTTPHeaderField: "Content-Type")
        write.setValue(generation, forHTTPHeaderField: "If-Match")
        if let epoch { write.setValue(String(epoch), forHTTPHeaderField: "X-EspDesktop-Epoch") }
        write.httpBody = layout
        let (_, result) = try await fetch(write)
        guard let saved = result as? HTTPURLResponse else { throw InstallError("The display did not respond.") }
        switch saved.statusCode {
        case 204: return "The Apple Home page is ready on your display."
        case 202: return "The Apple Home page is ready. The display could not update its legacy backup."
        case 409, 412, 428: throw InstallError("The display layout changed during setup. Try again to use its latest layout.")
        case 413: throw InstallError("There is not enough room on the display for the Apple Home page.")
        default: throw InstallError("Could not save the Apple Home page (HTTP \(saved.statusCode)).")
        }
    }

    static func generate(input: Data, source: String) throws -> Data? {
        guard input.count <= 512 * 1024, let js = JSContext() else {
            throw InstallError("The display configuration could not be opened.")
        }
        let encode: @convention(block) (String) -> [UInt8] = { Array($0.utf8) }
        let decode: @convention(block) ([UInt8]) -> String? = { String(bytes: $0, encoding: .utf8) }
        js.setObject(encode, forKeyedSubscript: "appleHomeEncodeUTF8" as NSString)
        js.setObject(decode, forKeyedSubscript: "appleHomeDecodeUTF8" as NSString)
        js.evaluateScript(source)
        let result = js.objectForKeyedSubscript("buildAppleHomePage")?.call(withArguments: [Array(input)])
        if let error = js.exception { throw InstallError(error.toString() ?? "Could not prepare the Apple Home page.") }
        if result?.isNull == true { return nil }
        guard let bytes = result?.toArray() as? [UInt8], !bytes.isEmpty else {
            throw InstallError("Could not prepare the Apple Home page.")
        }
        return Data(bytes)
    }

    private struct ResetStatus: Decodable {
        let epoch: UInt32
        let pending: Bool
    }

    struct InstallError: LocalizedError {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }

    private final class DirectConnection: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest) async -> URLRequest? { nil }
    }
}
