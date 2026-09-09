# EspDesktop for macOS

EspDesktop is a native macOS 13+ menu-bar app for securely connecting a Mac to an EspDesktop display. It is distributed as a standalone Developer ID app.

For the quickest local test, double-click **Run EspDesktop.command**. macOS may ask you to confirm that you want to open a downloaded script. Keep its Terminal window open while testing; press Control-C there to stop the app.

You can run the same launcher from Terminal:

```bash
cd macos/EspDesktop
./Run\ EspDesktop.command
```

To build a standalone app bundle for local testing:

```bash
ALLOW_ADHOC=1 ./Packaging/build_standalone.sh
```

The output is `./.build/standalone/EspDesktop.app`. For distribution, set `CODE_SIGN_IDENTITY` to a Developer ID Application certificate and notarize the resulting app. This bundle is not App Sandbox-restricted, so shortcut and window-control cards can use macOS Accessibility after the user grants permission.

To build a drag-to-Applications disk image from the local app bundle:

```bash
ALLOW_ADHOC=1 ./Packaging/build_dmg.sh
```

The output is `./.build/standalone/EspDesktop-1.0.0.dmg` (with the app version in the filename). It contains the app and an Applications shortcut in a Finder icon view. Pass an existing app bundle path as the first argument when packaging a signed build. Set `SKIP_FINDER_LAYOUT=1` only for headless build machines where Finder cannot be automated.

The manual release workflow signs and notarizes this standalone app and its disk image for each firmware release. Configure these repository secrets before using it: `MACOS_DEVELOPER_ID_P12_BASE64`, `MACOS_DEVELOPER_ID_P12_PASSWORD`, `MACOS_DEVELOPER_ID_APPLICATION`, `APPLE_NOTARY_KEY_BASE64`, `APPLE_NOTARY_KEY_ID`, and `APPLE_NOTARY_ISSUER_ID`. The certificate must be a Developer ID Application certificate, and the API key must be permitted to submit software for notarization. The workflow uploads the stapled, verified ZIP and DMG to the GitHub release.

For Xcode debugging, open `Package.swift`, choose **EspDesktop**, and click Run. Installed applications are available to launch or to open validated `http://` and `https://` links. Finder folders are separate: add folders with the native picker in the app's **Folders** page, then select one for each Open folder card in the panel web editor. The app can replay keyboard shortcuts created in the panel's web editor; macOS Accessibility permission is required the first time a shortcut is used.

On first launch, the setup guide walks through Accessibility for shortcut and window-control cards, optional Mac statistics sharing, and opening EspDesktop at login. Use **General → Run Setup Guide…** to review these choices later.

Click the EspDesktop icon in the macOS menu bar to see the display address and connection status, connect or disconnect, open display settings in your browser, or open EspDesktop settings. About EspDesktop is in the application menu.
When EspDesktop is installed as a packaged `.app`, its Display tab includes a Permissions section with an **Open EspDesktop at Login** switch. The local Swift launcher does not create an app bundle, so it shows the setting as unavailable with installation guidance. macOS may require approval under **System Settings → General → Login Items**.

The app automatically shares the active session shown by macOS Control Centre with a paired 4848S040. A Companion Play / Pause card displays the state confirmed by the Mac as **Playing**, **Paused**, **Stopped**, or **Unavailable**. It waits for a system notification or the two-second refresh rather than changing the label immediately after a tap. No additional macOS permission is required.

This generic feed uses the private macOS `MediaRemote` framework, loaded dynamically rather than linked into the app. It is intended for any music, podcast, browser, or video application that publishes usable Now Playing data to macOS. If Apple changes or removes the private symbols, the app reports the feed or command as unavailable instead of switching to app-specific or web integrations. Other Companion cards remain operational.

To pair, open the display’s web settings and its Mac Companion setup page. Opening the page starts a 15-minute pairing window and shows the code. The endpoint uses the display’s configured web authentication; without a web password, anyone who can reach the page can start pairing. The physical panel can also show a code after a long press on its Wi-Fi icon. In the Mac app's **Display** page, enter the panel address and that code, then click **Pair Display** (or press Return in the code field). Progress and recovery instructions appear on the same page. Once paired, the page shows the display address, connection status, and **Open Display Settings…**. **Forget Display…** asks for confirmation before clearing the pairing. Pair on a trusted local network. The app stores the paired credential in the macOS Keychain and pins the panel certificate. Forgetting the panel clears both values.

After pairing, use the **Applications** page to approve only the installed apps
that the display may discover, launch, or control. The approved list is stored
locally on the Mac and can be changed at any time. Apps are enabled by default on fresh installs, and newly discovered apps are enabled automatically. Switch individual apps off to exclude them; existing selections are preserved when upgrading.

In **Folders**, use **Choose Again…** if a folder has been moved or removed. Removing a folder asks for confirmation and does not delete any files. **Display → Permissions → Enable Keyboard Shortcuts** shows Accessibility access and requests the native macOS permission prompt when needed. It does not automatically open System Settings; follow the displayed instructions to grant permission. Simply viewing EspDesktop settings does not request permission.

Enable **General → Share Mac system statistics** to share overall processor and memory usage, storage for the startup disk or a selected mounted local drive, combined network throughput on the primary interface, and battery level when the Mac has a battery. Memory and storage cards can show either used or free capacity. No additional macOS permission is required, and it does not collect application, file, browsing, or network-content details. Choose the corresponding type on a Companion card to show a reading.

The versioned protocol is intentionally narrow: a Mac publishes installed bundle identifiers, opaque identifiers for user-approved folders, supported media controls, a Now Playing snapshot, and system statistics when supported by the connected panel using typed JSON messages. Artwork bytes use bounded binary chunks. The panel can request one of those applications or folders, a validated keyboard shortcut, media control, or a web URL opened by one of those applications. Folder paths stay in the Mac app and are never sent to the display. It does not execute shell commands, accept app or folder paths from the panel, allow non-web URL schemes, or accept inbound network connections.

### Settings navigation

Use the native macOS toolbar to switch between **Display**, **Apps**, **Folders**, **Updates**, and **Help**. Settings opens on Display by default; the Help menu shortcut opens Help directly. Support links are in Help, and the Buy Me a Coffee button is available at the bottom right of every settings page. Window controls, toolbar selection, and application switches use standard macOS components and follow the system appearance.

### Companion updates

Choose **Check for Updates** from the menu-bar menu or the **Updates** tab. Sparkle presents native update dialogs with download and installation controls. **Automatically check for updates** is on by default and checks daily while the app is running. **Automatically install updates** is off by default; enabling it allows verified updates to download in the background and install on quit. macOS may still request authorization. Turn off automatic checks to stop scheduled downloads as well. Launch at Login under Display → Permissions keeps Companion available after signing in.

The updater uses an HTTPS feed published alongside each stable GitHub release. Archives and the feed are signed with the public key embedded in the app. Update feeds are separated by Companion protocol version, so an incompatible protocol upgrade requires manually installing a matching app/firmware release. If there is no published feed yet, a manual check reports that it cannot retrieve update information. Local Swift launches without an app bundle show installation guidance.

Release setup: store the private Ed25519 seed in the repository secret `SPARKLE_PRIVATE_KEY`; the matching public key is in `Packaging/sparkle-public-key.txt`. Keep a backup of the private key in Keychain. The release workflow requires this secret in addition to the existing Apple signing/notarization credentials, generates and verifies a signed appcast with Sparkle's tools, and publishes it with the notarized ZIP and DMG. Never commit the private key. Do not replace the public key after shipping without following Sparkle's key-rotation procedure. Use increasing release build numbers; Sparkle compares `CFBundleVersion`.

Ad-hoc local app builds embed Sparkle and disable library validation only for that local signature. Developer ID release builds retain library validation and sign Sparkle's nested helper components with the same signing identity as the app.
