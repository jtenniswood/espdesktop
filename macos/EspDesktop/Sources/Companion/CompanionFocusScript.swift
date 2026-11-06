import Foundation

@MainActor
struct CompanionApplicationFocusPublisher {
    private var previous: String?

    mutating func publish(_ application: String?, send: (String) -> Void) {
        guard let application, application != previous else { return }
        previous = application
        send(application)
    }

    mutating func reset() { previous = nil }
}

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

/// A foreground-app change invalidates a pending query, not the Mac's focus.
/// Retry immediately rather than publishing an empty state that would close the
/// newly activated application's shortcut page on the display.
@MainActor
enum CompanionFocusQuery {
    // Activation can be reported before the app's first window is visible.
    // Retry locally instead of waiting for the one-second background poll.
    static func waitForVisibleWindow(
        isCurrentApplication: () -> Bool,
        hasVisibleWindow: () -> Bool
    ) async -> Bool {
        for attempt in 0..<6 {
            guard !Task.isCancelled, isCurrentApplication() else { return false }
            if hasVisibleWindow() { return true }
            if attempt < 5 {
                do { try await Task.sleep(for: .milliseconds(50)) }
                catch { return false }
            }
        }
        return false
    }

    static func readStable(
        currentApplication: () -> pid_t?,
        query: () async -> [String]
    ) async -> [String] {
        while !Task.isCancelled {
            let application = currentApplication()
            let result = await query()
            if application == currentApplication() { return result }
        }
        return []
    }
}
