import Foundation

/// Focus discovery must not hold up incoming keyboard shortcuts on the main actor.
/// Run the read-only script in a child process so an unresponsive browser or
/// Automation prompt can be stopped without blocking the app or its connection.
enum CompanionFocusScript {
    static func read(_ source: String, timeout: TimeInterval = 2) async -> String? {
        await Task.detached(priority: .utility) {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", source]
            let output = Pipe()
            process.standardOutput = output
            process.standardError = FileHandle.nullDevice
            do {
                try process.run()
            } catch {
                return nil
            }
            let deadline = DispatchWorkItem {
                if process.isRunning { process.terminate() }
            }
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout, execute: deadline)
            // Drain before waiting so a long browser URL cannot fill the pipe.
            let data = output.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            deadline.cancel()
            guard process.terminationStatus == 0 else { return nil }
            return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        }.value
    }
}
