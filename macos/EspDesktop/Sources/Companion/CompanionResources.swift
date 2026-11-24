import AppKit

extension Bundle {
    static var companionResources: Bundle? {
        // The packaged app nests the SwiftPM bundle inside Contents/Resources.
        if main.bundleURL.pathExtension == "app" {
            return main.url(forResource: "EspDesktop_Companion", withExtension: "bundle")
                .flatMap { Bundle(url: $0) }
        }
        return .module
    }
}

@MainActor
enum CompanionArtwork {
    private static let supportButtonFilename = "buy-me-a-coffee-button.png"

    static let supportButton: NSImage? = {
        let bundledURL = Bundle.companionResources?.url(
            forResource: supportButtonFilename,
            withExtension: nil
        )
        let cacheURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("io.espdesktop.app", isDirectory: true)
            .appendingPathComponent(supportButtonFilename)
        return loadSupportButton(bundledURL: bundledURL, cacheURL: cacheURL)
    }()

    static func loadSupportButton(bundledURL: URL?, cacheURL: URL?) -> NSImage? {
        if let bundledURL, let data = try? Data(contentsOf: bundledURL), let image = NSImage(data: data) {
            if let cacheURL, (try? Data(contentsOf: cacheURL)) != data {
                do {
                    try FileManager.default.createDirectory(
                        at: cacheURL.deletingLastPathComponent(),
                        withIntermediateDirectories: true
                    )
                    try data.write(to: cacheURL, options: .atomic)
                } catch {
                    // The bundled image is still available if the cache cannot be written.
                }
            }
            return image
        }

        guard let cacheURL, let data = try? Data(contentsOf: cacheURL) else { return nil }
        return NSImage(data: data)
    }
}
