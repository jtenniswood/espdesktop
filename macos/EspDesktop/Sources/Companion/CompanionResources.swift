import Foundation

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
