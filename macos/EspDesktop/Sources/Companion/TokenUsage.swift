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

    func isCurrent(at date: Date = .now) -> Bool {
        let now = date.timeIntervalSince1970
        return now < Double(resetsAt) && now - Double(observedAt) < 15 * 60
    }

    func wireValue(service: String) -> [String: Any] {
        ["service": service, "remainingPercent": remainingPercent,
         "resetsAt": resetsAt, "observedAt": observedAt]
    }
}

enum TokenUsage {
    enum ClaudeAccount: Equatable, Sendable {
        case checking, missingCLI, signedOut, apiKey, otherProvider, detected, unknown

        static func from(loggedIn: Bool, method: String?) -> Self {
            guard loggedIn else { return .signedOut }
            switch method {
            case "api_key", "api_key_helper": return .apiKey
            case "third_party": return .otherProvider
            case "claude.ai", "oauth_token": return .detected
            default: return .unknown
            }
        }
    }

    private struct ClaudeAuthReply: Decodable {
        let loggedIn: Bool
        let authMethod: String?
    }

    private struct ClaudeUsageReply: Decodable {
        let is_error: Bool
        let num_turns: Int
        let local_command: String
        let result: String
    }

    static func readClaude() async -> (account: ClaudeAccount, reading: WeeklyUsageReading?) {
        await Task.detached(priority: .utility) { fetchClaude() }.value
    }

    private static func fetchClaude() -> (ClaudeAccount, WeeklyUsageReading?) {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let candidates = [home.appendingPathComponent(".local/bin/claude").path,
                          "/opt/homebrew/bin/claude", "/usr/local/bin/claude"]
        guard let executable = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) })
        else { return (.missingCLI, nil) }
        guard let auth = runClaude(executable, arguments: ["auth", "status"], from: home, timeout: 5),
              let reply = try? JSONDecoder().decode(ClaudeAuthReply.self, from: auth)
        else { return (.unknown, nil) }

        let account = ClaudeAccount.from(loggedIn: reply.loggedIn, method: reply.authMethod)
        guard account == .detected else { return (account, nil) }

        // Use Claude Code's built-in local usage command with custom commands and tools disabled.
        let arguments = ["--safe-mode", "--strict-mcp-config", "--tools", "",
                         "--no-session-persistence", "--output-format", "json", "-p", "/usage"]
        let result = runClaude(executable, arguments: arguments, from: home, timeout: 15)
        return (account, result.flatMap { parseClaude($0) })
    }

    static func parseClaude(_ data: Data, observedAt: Date = .now) -> WeeklyUsageReading? {
        guard let reply = try? JSONDecoder().decode(ClaudeUsageReply.self, from: data),
              !reply.is_error, reply.num_turns == 0, reply.local_command == "usage" else { return nil }
        // The CLI also prints session limits and model-specific weekly limits.
        let pattern = #"(?im)^\s*Current week \(all models\):\s+(\d{1,3})% used\s*[·,]\s*resets\s+([A-Za-z]{3} \d{1,2})(?: at |, )(\d{1,2}(?::\d{2})?\s*[ap]m)\s*\(([^)\r\n]+)\)\s*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: reply.result, range: NSRange(reply.result.startIndex..., in: reply.result))
        else { return nil }

        let fields = (1..<match.numberOfRanges).compactMap { index in
            Range(match.range(at: index), in: reply.result).map { String(reply.result[$0]) }
        }
        guard fields.count == 4, let used = Int(fields[0]), (0...100).contains(used),
              let zone = TimeZone(identifier: fields[3]) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let year = calendar.component(.year, from: observedAt)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        let time = fields[2].replacingOccurrences(of: " ", with: "").uppercased()
        formatter.dateFormat = time.contains(":") ? "yyyy MMM d h:mma" : "yyyy MMM d ha"
        // The CLI omits the year. The next weekly reset can cross New Year's Day.
        guard let reset = [year, year + 1].compactMap({ formatter.date(from: "\($0) \(fields[1]) \(time)") })
            .first(where: { (0...8 * 24 * 60 * 60).contains($0.timeIntervalSince(observedAt)) })
        else { return nil }
        let now = observedAt.timeIntervalSince1970
        let resetTime = reset.timeIntervalSince1970
        guard now >= 1, resetTime <= Double(UInt32.max) else { return nil }
        let reading = WeeklyUsageReading(remainingPercent: 100 - used,
                                         resetsAt: UInt32(resetTime), observedAt: UInt32(now))
        return reading.valid ? reading : nil
    }

    private static func runClaude(_ executable: String, arguments: [String],
                                  from home: URL, timeout: Double) -> Data? {
        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.currentDirectoryURL = home
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = "\(home.path)/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        environment["LC_ALL"] = "en_US.UTF-8"
        process.environment = environment
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        do { try process.run() } catch { return nil }

        let deadline = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        deadline.schedule(deadline: .now() + timeout)
        deadline.setEventHandler {
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        }
        deadline.resume()
        defer {
            process.waitUntilExit()
            deadline.cancel()
        }
        return output.fileHandleForReading.readDataToEndOfFile()
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
