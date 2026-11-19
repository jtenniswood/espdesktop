import Foundation
import SQLite3
import Darwin

enum AllowancePeriod: String, Codable, Sendable {
    case weekly, monthly
}

enum AllowanceProvider: String, CaseIterable, Sendable {
    case codex, claude, openCodeGo = "opencode-go", cursor, antigravity
}

struct AllowanceReading: Codable, Equatable, Sendable {
    var remainingPercent: Int
    var resetsAt: UInt32?
    var period: AllowancePeriod = .weekly
    var observedAt: UInt32

    var valid: Bool {
        (0...100).contains(remainingPercent) && observedAt > 0 && (resetsAt.map { $0 > observedAt } ?? true)
            && Double(observedAt) <= Date().timeIntervalSince1970 + 60
    }

    func wireValue(service: String) -> [String: Any] {
        ["service": service, "remainingPercent": remainingPercent,
         "resetsAt": resetsAt ?? 0, "observedAt": observedAt]
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

    static func readClaude() async -> (account: ClaudeAccount, reading: AllowanceReading?) {
        await Task.detached(priority: .utility) { fetchClaude() }.value
    }

    private static func fetchClaude() -> (ClaudeAccount, AllowanceReading?) {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let candidates = [home.appendingPathComponent(".local/bin/claude").path,
                          "/opt/homebrew/bin/claude", "/usr/local/bin/claude"]
        guard let executable = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) })
        else { return (.missingCLI, nil) }
        guard let auth = runUsageCommand(executable, arguments: ["auth", "status"], from: home, timeout: 5),
              let reply = try? JSONDecoder().decode(ClaudeAuthReply.self, from: auth)
        else { return (.unknown, nil) }

        let account = ClaudeAccount.from(loggedIn: reply.loggedIn, method: reply.authMethod)
        guard account == .detected else { return (account, nil) }

        // Use Claude Code's built-in local usage command with custom commands and tools disabled.
        let arguments = ["--safe-mode", "--strict-mcp-config", "--tools", "",
                         "--no-session-persistence", "--output-format", "json", "-p", "/usage"]
        let result = runUsageCommand(executable, arguments: arguments, from: home, timeout: 15)
        return (account, result.flatMap { parseClaude($0) })
    }

    static func parseClaude(_ data: Data, observedAt: Date = .now) -> AllowanceReading? {
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
        let reading = AllowanceReading(remainingPercent: 100 - used,
                                         resetsAt: UInt32(resetTime), observedAt: UInt32(now))
        return reading.valid ? reading : nil
    }

    private static func runUsageCommand(_ executable: String, arguments: [String],
                                  from home: URL, directory: URL? = nil, timeout: Double) -> Data? {
        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.currentDirectoryURL = directory ?? home
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
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            process.waitUntilExit()
            deadline.cancel()
        }
        let maximumBytes = 1024 * 1024
        var data = Data()
        do {
            while let chunk = try output.fileHandleForReading.read(upToCount: 16384), !chunk.isEmpty {
                guard data.count + chunk.count <= maximumBytes else { return nil }
                data.append(chunk)
            }
        } catch {
            return nil
        }
        process.waitUntilExit()
        return data
    }

    enum OpenCodeGoStatus: Equatable, Sendable {
        case checking, missingLogin, rejected, noSubscription, unavailable, available
    }

    private struct OpenCodeGoAuthFile: Decodable {
        let go: OpenCodeGoCredential?
        enum CodingKeys: String, CodingKey { case go = "opencode-go" }
    }

    private struct OpenCodeGoCredential: Decodable {
        let type: String
        let key: String?
    }

    private struct OpenCodeGoReply: Decodable {
        struct Usage: Decodable {
            struct Window: Decodable {
                let percent: Double
                let resetsAt: String
            }

            // Decode each meter independently so a missing or malformed window
            // cannot discard the other provider-reported limit.
            let weekly: Window?
            let monthly: Window?

            private enum CodingKeys: String, CodingKey { case weekly, monthly }

            init(from decoder: Decoder) throws {
                let values = try decoder.container(keyedBy: CodingKeys.self)
                weekly = try? values.decode(Window.self, forKey: .weekly)
                monthly = try? values.decode(Window.self, forKey: .monthly)
            }
        }

        let usage: Usage
    }

    private final class RejectUsageRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest,
                        completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    static func openCodeGoKey(from data: Data) -> String? {
        guard let credential = try? JSONDecoder().decode(OpenCodeGoAuthFile.self, from: data).go,
              credential.type == "api", let key = credential.key,
              !key.isEmpty, key.utf8.allSatisfy({ (33...126).contains($0) }) else { return nil }
        return key
    }

    struct OpenCodeGoUsage: Equatable, Sendable {
        let weekly: AllowanceReading?
        let monthly: AllowanceReading?
    }

    private struct OpenCodeLogin: Decodable {
        struct Metadata: Decodable {
            let orgID: String?
        }

        let type: String
        let key: String?
        let access: String?
        let metadata: Metadata?

        var token: String? {
            let value: String?
            switch type {
            case "key": value = key
            case "oauth": value = access
            default: return nil
            }
            guard let value, !value.isEmpty, value.utf8.allSatisfy({ (33...126).contains($0) }) else { return nil }
            return value
        }
    }

    private static func activeOpenCodeLogins(database: URL) -> [OpenCodeLogin] {
        var db: OpaquePointer?
        defer { sqlite3_close(db) }
        guard sqlite3_open_v2(database.path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { return [] }
        let query = """
            SELECT value FROM credential
            WHERE active = 1 AND integration_id IN ('opencode-go', 'opencode')
            ORDER BY CASE integration_id WHEN 'opencode-go' THEN 0 ELSE 1 END, time_updated DESC
            """
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(statement) }

        var logins: [OpenCodeLogin] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let value = sqlite3_column_text(statement, 0) else { continue }
            let data = Data(bytes: value, count: Int(sqlite3_column_bytes(statement, 0)))
            if let login = try? JSONDecoder().decode(OpenCodeLogin.self, from: data), login.token != nil {
                logins.append(login)
            }
        }
        return logins
    }

    static func readOpenCodeGo() async -> (status: OpenCodeGoStatus, reading: OpenCodeGoUsage?) {
        let defaultData = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/share")
        let environment = ProcessInfo.processInfo.environment
        let xdgData = environment["XDG_DATA_HOME"]
        let dataDirectory = (xdgData.flatMap { $0.hasPrefix("/") ? URL(fileURLWithPath: $0) : nil } ?? defaultData)
            .appendingPathComponent("opencode")
        let customDatabase = environment["OPENCODE_DB"].flatMap { $0.hasPrefix("/") ? URL(fileURLWithPath: $0) : nil }
        let database = customDatabase ?? dataDirectory.appendingPathComponent("opencode.db")
        let logins = activeOpenCodeLogins(database: database)
        // A Console login is scoped with the same workspace header OpenCode sends.
        if let active = logins.first, let token = active.token {
            return await fetchOpenCodeGo(token: token, workspace: active.metadata?.orgID)
        }
        let authFile = dataDirectory.appendingPathComponent("auth.json")
        guard let data = try? Data(contentsOf: authFile), let key = openCodeGoKey(from: data)
        else { return (.missingLogin, nil) }
        return await fetchOpenCodeGo(token: key, workspace: nil)
    }

    private static func fetchOpenCodeGo(token: String, workspace: String?) async
        -> (status: OpenCodeGoStatus, reading: OpenCodeGoUsage?) {
        var request = URLRequest(url: URL(string: "https://opencode.ai/zen/go/v1/usage")!, timeoutInterval: 12)
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        if let workspace, !workspace.isEmpty, workspace.utf8.allSatisfy({ (33...126).contains($0) }) {
            request.setValue(workspace, forHTTPHeaderField: "x-opencode-org-id")
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForResource = 15
        let session = URLSession(configuration: configuration)
        defer { session.finishTasksAndInvalidate() }
        guard let (payload, response) = try? await session.data(for: request, delegate: RejectUsageRedirects()),
              let response = response as? HTTPURLResponse else { return (.unavailable, nil) }
        if response.statusCode == 401 { return (.rejected, nil) }
        if response.statusCode == 403 {
            // A Cloudflare denial can have the same status as an unsubscribed workspace.
            let body = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
            let error = body?["error"] as? [String: Any]
            if error?["message"] as? String == "OpenCode Go subscription required." {
                return (.noSubscription, nil)
            }
            return (.unavailable, nil)
        }
        guard response.statusCode == 200, let reading = parseOpenCodeGo(payload)
        else { return (.unavailable, nil) }
        return (.available, reading)
    }

    static func parseOpenCodeGo(_ data: Data, observedAt: Date = .now) -> OpenCodeGoUsage? {
        guard let usage = try? JSONDecoder().decode(OpenCodeGoReply.self, from: data).usage else { return nil }
        let weekly = usage.weekly.flatMap { openCodeReading($0, period: .weekly, observedAt: observedAt) }
        let monthly = usage.monthly.flatMap { openCodeReading($0, period: .monthly, observedAt: observedAt) }
        guard weekly != nil || monthly != nil else { return nil }
        return OpenCodeGoUsage(weekly: weekly, monthly: monthly)
    }

    private static func openCodeReading(_ window: OpenCodeGoReply.Usage.Window, period: AllowancePeriod, observedAt: Date) -> AllowanceReading? {
        guard (0...100).contains(window.percent) else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions.insert(.withFractionalSeconds)
        var reset = formatter.date(from: window.resetsAt)
        if reset == nil {
            formatter.formatOptions.remove(.withFractionalSeconds)
            reset = formatter.date(from: window.resetsAt)
        }
        guard let reset, reset > observedAt else { return nil }
        let now = observedAt.timeIntervalSince1970
        let resetTime = reset.timeIntervalSince1970
        guard now >= 1, resetTime <= Double(UInt32.max) else { return nil }
        let reading = AllowanceReading(remainingPercent: Int((100 - window.percent).rounded()),
                                         resetsAt: UInt32(resetTime), period: period, observedAt: UInt32(now))
        return reading.valid ? reading : nil
    }

    private struct CursorCLIAuth: Decodable {
        let accessToken: String
    }

    private struct CursorIdentity: Decodable {
        let sub: String
        let exp: Double
    }

    private struct CursorMonthlyUsage: Decodable {
        struct Individual: Decodable {
            struct Plan: Decodable {
                let enabled: Bool?
                let totalPercentUsed: Double?
                let used: Double?
                let limit: Double?
            }

            let plan: Plan?
        }

        let billingCycleEnd: String
        let individualUsage: Individual?
        let membershipType: String?
        let isUnlimited: Bool?
    }

    private struct CursorWeeklyUsage: Decodable {
        let isUnified: Bool
        let usagePercent: Double?
        let nextResetTimestampUtc: String?
        let includedLimitZero: Bool?
    }

    static func cursorSessionCookie(from data: Data, now: Date = .now) -> String? {
        guard let token = try? JSONDecoder().decode(CursorCLIAuth.self, from: data).accessToken
        else { return nil }
        let base64URL = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts.allSatisfy({ !$0.isEmpty && $0.unicodeScalars.allSatisfy(base64URL.contains) })
        else { return nil }
        var payload = parts[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.utf8.count % 4) % 4)
        guard let decoded = Data(base64Encoded: payload),
              let identity = try? JSONDecoder().decode(CursorIdentity.self, from: decoded),
              identity.exp > now.timeIntervalSince1970 + 60,
              let user = identity.sub.split(separator: "|").last,
              user.unicodeScalars.allSatisfy(base64URL.contains)
        else { return nil }
        return "WorkosCursorSessionToken=\(user)%3A%3A\(token)"
    }

    static func readCursor() async -> AllowanceReading? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let authFile = home.appendingPathComponent(".cursor/auth.json")
        guard let data = try? Data(contentsOf: authFile), let cookie = cursorSessionCookie(from: data)
        else { return nil }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForResource = 12
        let session = URLSession(configuration: configuration)
        defer { session.finishTasksAndInvalidate() }
        // The shared X subscription pool takes priority over legacy monthly usage.
        async let weekly = fetchCursorUsage("api/dashboard/get-sand-usage-status", method: "POST", cookie: cookie, session: session)
        async let monthly = fetchCursorUsage("api/usage-summary", method: "GET", cookie: cookie, session: session)
        return await parseCursor(monthly: monthly, weekly: weekly)
    }

    private static func fetchCursorUsage(_ route: String, method: String, cookie: String, session: URLSession) async -> Data? {
        var request = URLRequest(url: URL(string: "https://cursor.com/\(route)")!, timeoutInterval: 10)
        request.httpMethod = method
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method == "POST" {
            request.setValue("https://cursor.com", forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data("{}".utf8)
        }
        guard let (payload, response) = try? await session.data(for: request, delegate: RejectUsageRedirects()),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return payload
    }

    static func parseCursor(monthly: Data?, weekly: Data?, observedAt: Date = .now) -> AllowanceReading? {
        let decoder = JSONDecoder()
        if let weekly, let usage = try? decoder.decode(CursorWeeklyUsage.self, from: weekly), usage.isUnified {
            // A confirmed shared plan must never fall back to an unrelated legacy pool.
            guard usage.includedLimitZero != true, let percent = usage.usagePercent,
                  let reset = usage.nextResetTimestampUtc else { return nil }
            return cursorReading(usedPercent: percent, reset: reset, observedAt: observedAt, maxDays: 8, period: .weekly)
        }
        guard let monthly, let usage = try? decoder.decode(CursorMonthlyUsage.self, from: monthly),
              usage.isUnlimited != true, let plan = usage.individualUsage?.plan, plan.enabled != false,
              !["team", "enterprise"].contains(usage.membershipType?.lowercased() ?? "") else { return nil }
        if let percent = plan.totalPercentUsed {
            return cursorReading(usedPercent: percent, reset: usage.billingCycleEnd, observedAt: observedAt, maxDays: 32, period: .monthly)
        }
        guard let used = plan.used, let limit = plan.limit, limit > 0 else { return nil }
        return cursorReading(usedPercent: used / limit * 100,
                             reset: usage.billingCycleEnd, observedAt: observedAt, maxDays: 32, period: .monthly)
    }

    private static func cursorReading(usedPercent: Double, reset: String, observedAt: Date, maxDays: Int, period: AllowancePeriod) -> AllowanceReading? {
        guard usedPercent.isFinite, usedPercent >= 0 else { return nil }
        let formatter = ISO8601DateFormatter()
        let wholeSeconds = formatter.date(from: reset)
        formatter.formatOptions.insert(.withFractionalSeconds)
        guard let date = wholeSeconds ?? formatter.date(from: reset),
              date.timeIntervalSince(observedAt) <= Double(maxDays * 86400),
              observedAt.timeIntervalSince1970 >= 1,
              date.timeIntervalSince1970 <= Double(UInt32.max),
              date > observedAt else { return nil }
        let reading = AllowanceReading(remainingPercent: Int((100 - min(100, usedPercent)).rounded()),
                                         resetsAt: UInt32(date.timeIntervalSince1970), period: period,
                                         observedAt: UInt32(observedAt.timeIntervalSince1970))
        return reading.valid ? reading : nil
    }

    private struct AntigravityReport: Decodable {
        struct Command: Decodable {
            struct Quotas: Decodable {
                struct Group: Decodable {
                    struct Bucket: Decodable {
                        let id: String
                        let window: String?
                        let remainingFraction: Double?
                        let resetTime: String?
                        let disabled: Bool?
                    }

                    let buckets: [Bucket]
                }

                let groups: [Group]
            }

            let name: String
            let data: Quotas
        }

        let status: String
        let numTurns: Int
        let command: Command
    }

    static func readAntigravity() async -> AllowanceReading? {
        await Task.detached(priority: .utility) {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let binaries = [home.appendingPathComponent(".local/bin/agy").path,
                            "/opt/homebrew/bin/agy", "/usr/local/bin/agy"]
            guard let executable = binaries.first(where: FileManager.default.isExecutableFile(atPath:)) else { return nil }
            // The standalone usage command is answered by the CLI without running an agent.
            let data = runUsageCommand(executable, arguments: ["-p", "/usage", "--output-format", "json"],
                                       from: home, directory: FileManager.default.temporaryDirectory, timeout: 20)
            return data.flatMap { parseAntigravity($0) }
        }.value
    }

    static func parseAntigravity(_ data: Data, observedAt: Date = .now) -> AllowanceReading? {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let report = try? decoder.decode(AntigravityReport.self, from: data),
              report.status == "SUCCESS", report.numTurns == 0, report.command.name == "usage"
        else { return nil }

        // Gemini, Claude/GPT, and other model pools have separate quotas.
        let matches = report.command.data.groups.flatMap { $0.buckets }.filter { $0.id == "gemini-weekly" }
        let timestamp = observedAt.timeIntervalSince1970
        guard matches.count == 1, let bucket = matches.first, bucket.window == "weekly",
              bucket.disabled != true, let fraction = bucket.remainingFraction, (0...1).contains(fraction),
              (1...Double(UInt32.max)).contains(timestamp) else { return nil }

        var resetsAt: UInt32?
        if let value = bucket.resetTime {
            let formatter = ISO8601DateFormatter()
            let wholeSeconds = formatter.date(from: value)
            formatter.formatOptions.insert(.withFractionalSeconds)
            if let reset = wholeSeconds ?? formatter.date(from: value) {
                let resetTime = reset.timeIntervalSince1970
                if resetTime.rounded(.down) > timestamp.rounded(.down),
                   resetTime - timestamp <= 8 * 86400, resetTime <= Double(UInt32.max) {
                    resetsAt = UInt32(resetTime)
                }
            }
        }

        return AllowanceReading(remainingPercent: Int((fraction * 100).rounded()),
                                  resetsAt: resetsAt, observedAt: UInt32(timestamp))
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

    static func parseCodex(_ line: Data, observedAt: UInt32) -> AllowanceReading? {
        guard let reply = try? JSONDecoder().decode(Reply.self, from: line), reply.id == 2,
              let result = reply.result,
              let limits = result.rateLimitsByLimitId?["codex"] ?? result.rateLimits,
              limits.limitId == nil || limits.limitId == "codex",
              let window = [limits.primary, limits.secondary].compactMap({ $0 })
                  .first(where: { $0.windowDurationMins == 7 * 24 * 60 }),
              let resetsAt = window.resetsAt, (0...100).contains(window.usedPercent) else { return nil }
        let reading = AllowanceReading(remainingPercent: Int((100 - window.usedPercent).rounded()),
                                         resetsAt: resetsAt, observedAt: observedAt)
        return reading.valid ? reading : nil
    }

    static func readCodex() async -> AllowanceReading? {
        await Task.detached(priority: .utility) { fetchCodex() }.value
    }

    private static func fetchCodex() -> AllowanceReading? {
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
