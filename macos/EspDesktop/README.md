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

The output is `./.build/standalone/EspDesktop.app`. For distribution, set `CODE_SIGN_IDENTITY` to a Developer ID Application certificate and notarize the resulting app. This bundle is not App Sandbox-restricted, so keyboard shortcut cards can use macOS Accessibility after the user grants permission.

To build a drag-to-Applications disk image from the local app bundle:

```bash
ALLOW_ADHOC=1 ./Packaging/build_dmg.sh
```

The output is `./.build/standalone/EspDesktop-1.0.0.dmg` (with the app version in the filename). It contains the app and an Applications shortcut in a Finder icon view. Pass an existing app bundle path as the first argument when packaging a signed build. Set `SKIP_FINDER_LAYOUT=1` only for headless build machines where Finder cannot be automated.

The manual release workflow signs and notarizes this standalone app and its disk image for each firmware release. Configure these repository secrets before using it: `MACOS_DEVELOPER_ID_P12_BASE64`, `MACOS_DEVELOPER_ID_P12_PASSWORD`, `MACOS_DEVELOPER_ID_APPLICATION`, `APPLE_NOTARY_KEY_BASE64`, `APPLE_NOTARY_KEY_ID`, and `APPLE_NOTARY_ISSUER_ID`. The certificate must be a Developer ID Application certificate, and the API key must be permitted to submit software for notarization. The workflow uploads the stapled, verified ZIP and DMG to the GitHub release.

For Xcode debugging, open `Package.swift`, choose **EspDesktop**, and click Run. See the [public Mac app guide](https://jtenniswood.github.io/espdesktop/getting-started/mac-app) for pairing, Accessibility and first-run setup.

Use the menu-bar icon to connect or disconnect, open the browser editor with **Customize Display**, or open **Mac Settings**. The settings toolbar offers **Display**, **Apps**, **Folders**, **Updates** and **Support**. **Launch at login** is available in the packaged app. The local Swift launcher shows installation guidance for this setting.

The Mac shares approved app and folder names and identifiers with the paired display. Folder paths stay on the Mac. It also shares system statistics while connected. To show a reading on stable firmware, use a [Companion Stat subpage tile](https://jtenniswood.github.io/espdesktop/features/subpages#mac-statistics).

The display can request approved app and folder actions, validated keyboard shortcuts and web URLs. Website cards open in the default browser. Pairing uses a temporary code, a credential stored in macOS Keychain and certificate pinning. See [Permissions & Security](https://jtenniswood.github.io/espdesktop/mac-controls/security) for details.

### Companion updates

Choose **Updates** from the menu-bar menu or **Check Now** in the **Updates** tab. Sparkle presents native update dialogs with download and installation controls. **Automatically check for updates** is on by default and checks daily while the app is running. **Automatically install updates** is off by default; enabling it allows verified updates to download in the background and install on quit. macOS may still request authorization. Turn off automatic checks to stop scheduled downloads as well. Enable **Launch at login** on the **Display** tab to keep Companion available after signing in.

The updater uses an HTTPS feed published alongside each stable GitHub release. Archives and the feed are signed with the public key embedded in the app. Update feeds are separated by Companion protocol version, so an incompatible protocol upgrade requires manually installing a matching app/firmware release. If there is no published feed yet, a manual check reports that it cannot retrieve update information. Local Swift launches without an app bundle show installation guidance.

Release setup: store the private Ed25519 seed in the repository secret `SPARKLE_PRIVATE_KEY`; the matching public key is in `Packaging/sparkle-public-key.txt`. Keep a backup of the private key in Keychain. The release workflow requires this secret in addition to the existing Apple signing/notarization credentials, generates and verifies a signed appcast with Sparkle's tools, and publishes it with the notarized ZIP and DMG. Never commit the private key. Do not replace the public key after shipping without following Sparkle's key-rotation procedure. Use increasing release build numbers; Sparkle compares `CFBundleVersion`.

Ad-hoc local app builds embed Sparkle and disable library validation only for that local signature. Developer ID release builds retain library validation and sign Sparkle's nested helper components with the same signing identity as the app.

### Keyboard shortcut permission

Use **Open Settings** beside **Enable Shortcuts**, then enable **EspDesktop** under Privacy & Security → Accessibility. Return to EspDesktop to refresh the status. The shortcut setup row disappears once access is enabled and reappears if access is revoked. macOS owns this permission; the app cannot grant it itself.

### Preserve Accessibility approval across local builds

Use `Packaging/build_local.sh` for apps you install and use. Install an Apple signing certificate **and its private key** in Keychain first. List available fingerprints with `security find-identity -v -p codesigning`, then run:

```sh
CODE_SIGN_IDENTITY=<40-character-fingerprint> ./Packaging/build_local.sh
```

After a successful build, the helper saves only the certificate fingerprint in `~/.config/espdesktop/signing-identity`, shared by all worktrees. Later builds need only `./Packaging/build_local.sh`. It refuses missing identities and checks that a new build satisfies the installed certificate-signed app's designated requirement before reporting success. Install consistently at `/Applications/EspDesktop.app`; do not reset Accessibility during ordinary updates.

Switching from the existing ad-hoc app requires one final Accessibility approval. Future compatible certificate-signed builds should retain it. Use the same Developer ID Application identity as the release pipeline to keep local builds and releases compatible. An Apple Development identity may preserve local-build approval but is not interchangeable with Developer ID releases. macOS still owns permission decisions; a bundle ID, signing team, or certificate-policy change can require approval again.

`ALLOW_ADHOC=1 Packaging/build_standalone.sh` remains for disposable CI verification, not persistent local testing. The release workflow already uses Developer ID signing and notarization; keep its bundle identifier and signing identity consistent between releases.
