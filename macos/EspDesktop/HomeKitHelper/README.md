# EspDesktop Home prototype

The Catalyst app reads Apple Home scenes and runs them at the request of the paired
EspDesktop companion. Home names, scene names, HomeKit IDs and accessory data stay
within the Catalyst app. The display gets a standard subpage of numbered buttons.
The Mac companion maps those buttons to locally authorised scene slots.

The companion build requires `ESPDESKTOP_EXPERIMENTAL_APPLE_HOME=1` and the
repository's Node dependencies to include the page setup tool. The helper builds
separately from `EspDesktopHome.xcodeproj`. Open the project in Xcode, select the
**Mac Catalyst** destination and use an Apple Development identity and HomeKit
provisioning profile from the same team as the signed companion. Include the test
Mac in that profile. If Xcode reports that the new app ID is missing the HomeKit
entitlement, build once for the generic iOS destination with automatic signing,
then rebuild for Mac Catalyst. Install the signed Mac helper in `~/Applications`
and open it once so macOS can find it. The companion checks the helper's signing
identity before launching it.

For a local test, use a display paired over Wi-Fi with the version 2 configuration
API and a free tile on its main page. In the companion, open **Apple Home** and
choose **Connect Apple Home**. Allow macOS access and choose a home when there are
several. Setup uses the only connected Wi-Fi display automatically, or lets you
pick a display when there are several. Check the numbered assignments on the Mac,
then test a scene that controls an ordinary light. Move another app to the front
and verify the scene still runs. Repeat setup to check there is one Apple Home page.

Public distribution needs a supported path for the HomeKit entitlement. Apple's
developer terms also restrict using HomeKit API data off the Apple device. Confirm
the distribution path and the terms before adding scene names or state to the
screen. See [Apple's developer agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/).
