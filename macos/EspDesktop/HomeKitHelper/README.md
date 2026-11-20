# EspDesktop Home prototype

The Catalyst app runs Apple Home scenes and compatible accessory power and blind controls at the request of the paired
EspDesktop companion. Home names, scene names, HomeKit IDs and accessory data stay
on the Mac. The display gets dedicated Apple Home cards with the labels entered
in EspDesktop. The companion sends only those labels and opaque action references.

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
API and room for an Apple Home folder. In **Displays**, choose **Apple Home** for
the display and connect Apple Home. Allow macOS access. A single home is selected
automatically. If prompted to choose a home, click **Continue** to return to the
control list. EspDesktop reconnects in the background when it starts.
Use **Change Home** to switch when several are available. Pick a scene or an accessory control, add a card and enter its display
label. The first new card creates the folder or replaces the default numbered
prototype cards inside it. Verify that a light-only scene runs while another Mac
app is frontmost. Check that repeated saves update the card in place.

Public distribution needs a supported path for the HomeKit entitlement. Apple's
developer terms also restrict using HomeKit API data off the Apple device. Confirm
the distribution path and the terms before adding scene names or state to the
screen. See [Apple's developer agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/).
