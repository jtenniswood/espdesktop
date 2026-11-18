import CoreServices
import Darwin
import Foundation

final class ApplicationFolderMonitor {
    private let stream: FSEventStreamRef

    init?(sharedApplications: URL, userApplications: URL, onChange: @escaping @Sendable () -> Void) {
        let sharedFolder = Self.eventPath(for: sharedApplications)
        let homeFolder = Self.eventPath(for: userApplications.deletingLastPathComponent())
        let userFolder = homeFolder + "/" + userApplications.lastPathComponent
        let paths = [sharedFolder, homeFolder]
        let applicationFolders = [sharedFolder, userFolder]

        // Watch the home directory so a newly created ~/Applications is detected too.
        let handler = EventHandler { changedPaths, flags in
            let rescanFlags = FSEventStreamEventFlags(
                kFSEventStreamEventFlagMustScanSubDirs | kFSEventStreamEventFlagRootChanged
            )
            if changedPaths.enumerated().contains(where: { index, path in
                flags[index] & rescanFlags != 0 || path == homeFolder || path == homeFolder + "/" ||
                    applicationFolders.contains { path == $0 || path.hasPrefix($0 + "/") }
            }) {
                onChange()
            }
        }
        defer { withExtendedLifetime(handler) {} }
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(handler).toOpaque(),
            retain: { info in
                guard let info else { return nil }
                _ = Unmanaged<EventHandler>.fromOpaque(info).retain()
                return info
            },
            release: { info in
                if let info { Unmanaged<EventHandler>.fromOpaque(info).release() }
            },
            copyDescription: nil
        )
        let options = FSEventStreamCreateFlags(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagWatchRoot)
        guard let stream = FSEventStreamCreate(nil, { _, info, _, eventPaths, flags, _ in
            guard let info, let paths = unsafeBitCast(eventPaths, to: CFArray.self) as? [String] else { return }
            Unmanaged<EventHandler>.fromOpaque(info).takeUnretainedValue().handle(paths, flags)
        }, &context, paths as CFArray, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.5, options) else {
            return nil
        }
        FSEventStreamSetDispatchQueue(stream, DispatchQueue(label: "io.espdesktop.application-folders"))
        guard FSEventStreamStart(stream) else {
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            return nil
        }
        self.stream = stream
    }

    deinit {
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
    }

    private static func eventPath(for url: URL) -> String {
        // FSEvents uses physical paths, including macOS's /private prefix.
        guard let path = realpath(url.path, nil) else { return url.path }
        defer { free(path) }
        return String(cString: path)
    }

    private final class EventHandler {
        let handle: ([String], UnsafePointer<FSEventStreamEventFlags>) -> Void

        init(_ handle: @escaping ([String], UnsafePointer<FSEventStreamEventFlags>) -> Void) {
            self.handle = handle
        }
    }
}
