import Foundation

enum CompanionResources {
    static let bundle: Bundle? = {
        // The packaged app keeps resources under Contents/Resources. SwiftPM's
        // generated lookup can otherwise fall back to the build machine's path.
        if Bundle.main.bundleURL.pathExtension == "app" {
            return Bundle.main.url(forResource: "EspDesktop_Companion", withExtension: "bundle")
                .flatMap { Bundle(url: $0) }
        }
        return .module
    }()
}
