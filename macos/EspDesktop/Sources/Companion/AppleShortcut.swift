import Foundation

struct AppleShortcut: Identifiable, Equatable, Sendable {
    static let actionPrefix = "appleshortcut."
    let id: UUID
    let name: String

    var actionIdentifier: String { Self.actionPrefix + id.uuidString.lowercased() }

    static func identifier(from action: String) -> UUID? {
        guard action.hasPrefix(actionPrefix) else { return nil }
        return UUID(uuidString: String(action.dropFirst(actionPrefix.count)))
    }

    static func parseCatalogue(_ output: String) -> [Self] {
        var identifiers: Set<UUID> = []
        return output.split(whereSeparator: \.isNewline).compactMap { line in
            guard line.hasSuffix(")"), let separator = line.range(of: " (", options: .backwards),
                  let id = UUID(uuidString: String(line[separator.upperBound..<line.index(before: line.endIndex)])),
                  separator.lowerBound != line.startIndex, identifiers.insert(id).inserted else { return nil }
            return Self(id: id, name: String(line[..<separator.lowerBound]))
        }
        .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}

enum AppleShortcutsCLI {
    static func list() async -> [AppleShortcut]? {
        await Task.detached(priority: .utility) {
            let process = makeProcess(["list", "--show-identifiers"])
            let output = Pipe()
            process.standardOutput = output
            do {
                try process.run()
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                guard process.terminationStatus == 0,
                      let text = String(data: data, encoding: .utf8) else { return nil }
                let shortcuts = AppleShortcut.parseCatalogue(text)
                return !shortcuts.isEmpty || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? shortcuts : nil
            } catch {
                return nil
            }
        }.value
    }

    static func run(_ id: UUID) async -> Bool {
        await withCheckedContinuation { continuation in
            let process = makeProcess(["run", id.uuidString])
            process.terminationHandler = { process in
                continuation.resume(returning: process.terminationStatus == 0)
            }
            do {
                try process.run()
            } catch {
                continuation.resume(returning: false)
            }
        }
    }

    private static func makeProcess(_ arguments: [String]) -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/shortcuts")
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        return process
    }
}
