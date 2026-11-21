import AppKit
import CoreServices

struct AppleShortcut: Identifiable, Equatable, Sendable {
    static let actionPrefix = "appleshortcut."
    let id: UUID
    let name: String
    let color: UInt32?

    init(id: UUID, name: String, color: UInt32? = nil) {
        self.id = id
        self.name = name
        self.color = color
    }

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

enum AppleShortcutColors {
    private static let helper = "com.apple.shortcuts.events"
    private static let shortcutClass: OSType = 0x73726374 // 'srct'
    private static let colorProperty: OSType = 0x636F6C72 // 'colr'

    static func read(for ids: [UUID], allowPrompt: Bool) async -> [UUID: UInt32] {
        guard !ids.isEmpty else { return [:] }
        if NSRunningApplication.runningApplications(withBundleIdentifier: helper).isEmpty,
           let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: helper) {
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = false
            guard (try? await NSWorkspace.shared.openApplication(at: url, configuration: configuration)) != nil
                else { return [:] }
        }

        return await Task.detached(priority: .utility) {
            let target = NSAppleEventDescriptor(bundleIdentifier: helper)
            var sendOptions: NSAppleEventDescriptor.SendOptions = [.waitForReply, .neverInteract]
            if !allowPrompt { sendOptions.insert(.init(rawValue: UInt(kAEDoNotPromptForUserConsent))) }

            var colors: [UUID: UInt32] = [:]
            for id in ids {
                guard let shortcut = objectSpecifier(
                    shortcutClass, form: OSType(formUniqueID), key: .init(string: id.uuidString), container: .null()
                ), let property = objectSpecifier(
                    OSType(cProperty), form: OSType(formPropertyID), key: .init(typeCode: colorProperty), container: shortcut
                ) else { break }
                let event = NSAppleEventDescriptor(
                    eventClass: AEEventClass(kAECoreSuite), eventID: AEEventID(kAEGetData), targetDescriptor: target,
                    returnID: AEReturnID(kAutoGenerateReturnID), transactionID: AETransactionID(kAnyTransactionID)
                )
                event.setParam(property, forKeyword: AEKeyword(keyDirectObject))
                // A denied or unavailable helper should cost one request per refresh.
                guard let reply = try? event.sendEvent(options: sendOptions, timeout: 3) else { break }
                if let error = reply.paramDescriptor(forKeyword: AEKeyword(keyErrorNumber)),
                   error.int32Value != 0 {
                    if error.int32Value == errAENoSuchObject { continue }
                    break
                }
                if let value = reply.paramDescriptor(forKeyword: AEKeyword(keyDirectObject)),
                   let color = rgb24(value) {
                    colors[id] = color
                }
            }
            return colors
        }.value
    }

    private static func objectSpecifier(
        _ type: OSType, form: OSType, key: NSAppleEventDescriptor, container: NSAppleEventDescriptor
    ) -> NSAppleEventDescriptor? {
        guard var keyDescriptor = key.aeDesc?.pointee, var containerDescriptor = container.aeDesc?.pointee
            else { return nil }
        var specifier = AEDesc()
        let status = withExtendedLifetime((key, container)) {
            CreateObjSpecifier(type, &containerDescriptor, form, &keyDescriptor, false, &specifier)
        }
        guard status == noErr else { return nil }
        return NSAppleEventDescriptor(aeDescNoCopy: &specifier)
    }

    static func rgb24(_ descriptor: NSAppleEventDescriptor) -> UInt32? {
        // Shortcuts exposes a Carbon RGBColor with three unsigned 16-bit channels.
        guard descriptor.descriptorType == DescType(typeRGBColor), descriptor.data.count == 6 else { return nil }
        return descriptor.data.withUnsafeBytes { bytes in
            let red = UInt32(bytes.loadUnaligned(fromByteOffset: 0, as: UInt16.self))
            let green = UInt32(bytes.loadUnaligned(fromByteOffset: 2, as: UInt16.self))
            let blue = UInt32(bytes.loadUnaligned(fromByteOffset: 4, as: UInt16.self))
            return ((red + 128) / 257) << 16 | ((green + 128) / 257) << 8 | (blue + 128) / 257
        }
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
