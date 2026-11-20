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
    static let supportButton: NSImage? = {
        guard let url = Bundle.companionResources?.url(
            forResource: "buy-me-a-coffee-button",
            withExtension: "png"
        ), let data = try? Data(contentsOf: url) else { return nil }
        return NSImage(data: data)
    }()
}
