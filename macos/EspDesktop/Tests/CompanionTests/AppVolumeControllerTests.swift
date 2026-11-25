import XCTest
@testable import Companion

@available(macOS 14.2, *)
final class AppVolumeControllerTests: XCTestCase {
    func testWebKitHelpersMatchTheirOwningApp() {
        let safari = "com.apple.Safari"
        let otherApp = "com.example.Other"

        for helper in ["com.apple.WebKit.GPU", "com.apple.WebKit.WebContent"] {
            XCTAssertTrue(AppVolumeController.webKitHelperBelongsToApp(helper, appBundleID: safari) { safari })
            XCTAssertFalse(AppVolumeController.webKitHelperBelongsToApp(helper, appBundleID: safari) { otherApp })
            XCTAssertFalse(AppVolumeController.webKitHelperBelongsToApp(helper, appBundleID: safari) { nil })
        }
    }

    func testUnrelatedProcessesDoNotUseTheWebKitOwnershipLookup() {
        for helper in ["com.spotify.client", "com.google.Chrome.helper", nil] {
            XCTAssertFalse(AppVolumeController.webKitHelperBelongsToApp(helper, appBundleID: "com.apple.Safari") {
                XCTFail("Only WebKit audio helpers should use the ownership lookup")
                return nil
            })
        }
    }
}
