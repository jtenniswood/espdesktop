import Foundation
import Darwin

struct WeeklyUsageReading: Codable, Equatable, Sendable {
    var remainingPercent: Int
    var resetsAt: UInt32
    var observedAt: UInt32

    var valid: Bool {
        (0...100).contains(remainingPercent) && observedAt > 0 && resetsAt > observedAt
            && Double(observedAt) <= Date().timeIntervalSince1970 + 60
    }

    func wireValue(service: String) -> [String: Any] {
        ["service": service, "remainingPercent": remainingPercent,
         "resetsAt": resetsAt, "observedAt": observedAt]
    }
}

enum TokenUsage {
    static let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/EspDesktop/TokenUsage")
    private static let scriptURL = directory.appendingPathComponent("claude-status-line")

    enum SetupError: Error { case invalidSettings, missingHelper }

    static func connectClaude(settings: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".claude/settings.json")) throws {
        let manager = FileManager.default
        var document = [String: Any]()
        if manager.fileExists(atPath: settings.path) {
            guard let existing = try JSONSerialization.jsonObject(with: Data(contentsOf: settings)) as? [String: Any]
            else { throw SetupError.invalidSettings }
            document = existing
        }
        var statusLine = [String: Any]()
        if let existing = document["statusLine"] {
            guard let value = existing as? [String: Any], value["type"] as? String == "command",
                  value["command"] is String else { throw SetupError.invalidSettings }
            statusLine = value
        }
        let helper = try installClaudeHelper()
        if let existing = statusLine["command"] as? String {
            if existing == helper || existing.hasPrefix(helper + " ") { return }
            statusLine["command"] = helper + " " + shellQuote(existing)
        } else {
            statusLine["command"] = helper
        }
        statusLine["type"] = "command"
        document["statusLine"] = statusLine
        try manager.createDirectory(at: settings.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: document, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
            .write(to: settings, options: .atomic)
    }

    private static func shellQuote(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private static func installClaudeHelper() throws -> String {
        guard let source = Bundle.module.url(forResource: "claude-status-line", withExtension: nil)
        else { throw SetupError.missingHelper }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: [.posixPermissions: 0o700])
        try Data(contentsOf: source).write(to: scriptURL, options: .atomic)
        return "/usr/bin/perl " + shellQuote(scriptURL.path)
    }

    static func readClaude() -> WeeklyUsageReading? {
        let snapshot = directory.appendingPathComponent("claude-weekly.json")
        guard let data = try? Data(contentsOf: snapshot), data.count <= 1024,
              let reading = try? JSONDecoder().decode(WeeklyUsageReading.self, from: data),
              reading.valid else { return nil }
        return reading
    }

    private struct Reply: Decodable {
        struct Limits: Decodable {
            struct Window: Decodable {
                let usedPercent: Double
                let windowDurationMins: Int?
                let resetsAt: UInt32?
            }

            let limitId: String?
            let primary: Window?
            let secondary: Window?
        }

        struct Result: Decodable {
            let rateLimits: Limits?
            let rateLimitsByLimitId: [String: Limits]?
        }

        let id: Int?
        let result: Result?
    }

    static func parseCodex(_ line: Data, observedAt: UInt32) -> WeeklyUsageReading? {
        guard let reply = try? JSONDecoder().decode(Reply.self, from: line), reply.id == 2,
              let result = reply.result,
              let limits = result.rateLimitsByLimitId?["codex"] ?? result.rateLimits,
              limits.limitId == nil || limits.limitId == "codex",
              let window = [limits.primary, limits.secondary].compactMap({ $0 })
                  .first(where: { $0.windowDurationMins == 7 * 24 * 60 }),
              let resetsAt = window.resetsAt, (0...100).contains(window.usedPercent) else { return nil }
        let reading = WeeklyUsageReading(remainingPercent: Int((100 - window.usedPercent).rounded()),
                                         resetsAt: resetsAt, observedAt: observedAt)
        return reading.valid ? reading : nil
    }

    static func readCodex() async -> WeeklyUsageReading? {
        await Task.detached(priority: .utility) { fetchCodex() }.value
    }

    private static func fetchCodex() -> WeeklyUsageReading? {
        let candidates = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex",
                          FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin/codex").path,
                          "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"]
        guard let executable = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            return nil
        }
        let process = Process()
        let input = Pipe()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = ["-s", "read-only", "-a", "never", "app-server", "--listen", "stdio://"]
        // A GUI launch may omit Homebrew's Node runtime from PATH.
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        process.environment = environment
        process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        guard fcntl(input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1) == 0 else { return nil }
        do { try process.run() } catch { return nil }

        let deadline = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        deadline.schedule(deadline: .now() + 15)
        deadline.setEventHandler {
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        }
        deadline.resume()
        defer {
            try? input.fileHandleForWriting.close()
            if process.isRunning { process.terminate() }
            process.waitUntilExit()
            deadline.cancel()
        }

        let initialize = #"{"id":1,"method":"initialize","params":{"clientInfo":{"name":"espdesktop","version":"1"}}}"#
        let query = #"{"method":"initialized"}"# + "\n" + #"{"id":2,"method":"account/rateLimits/read"}"#
        do {
            try input.fileHandleForWriting.write(contentsOf: Data((initialize + "\n").utf8))
            var buffer = Data()
            while true {
                let chunk = output.fileHandleForReading.availableData
                if chunk.isEmpty { break }
                buffer.append(chunk)
                while let end = buffer.firstIndex(of: 10) {
                    let line = Data(buffer.prefix(upTo: end))
                    buffer.removeSubrange(...end)
                    guard let reply = try? JSONDecoder().decode(Reply.self, from: line) else { continue }
                    if reply.id == 1 {
                        try input.fileHandleForWriting.write(contentsOf: Data((query + "\n").utf8))
                    } else if reply.id == 2 {
                        return parseCodex(line, observedAt: UInt32(Date().timeIntervalSince1970))
                    }
                }
                if buffer.count > 1_048_576 { return nil }
            }
        } catch { return nil }
        return nil
    }
}
