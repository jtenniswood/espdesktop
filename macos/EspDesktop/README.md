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
python3 -m venv .build/dmg-tools
source .build/dmg-tools/bin/activate
python -m pip install --require-hashes -r Packaging/dmg-requirements.txt
ALLOW_ADHOC=1 ./Packaging/build_dmg.sh
```

The output is `./.build/standalone/EspDesktop-1.0.0.dmg` (with the app version in the filename). Finder shows an arrow from EspDesktop to the Applications shortcut. Pass an existing app bundle path as the first argument when packaging a signed build.

The manual release workflow signs and notarizes this standalone app and its disk image for each firmware release. Configure these repository secrets before using it: `MACOS_DEVELOPER_ID_P12_BASE64`, `MACOS_DEVELOPER_ID_P12_PASSWORD`, `MACOS_DEVELOPER_ID_APPLICATION`, `APPLE_NOTARY_KEY_BASE64`, `APPLE_NOTARY_KEY_ID`, and `APPLE_NOTARY_ISSUER_ID`. The certificate must be a Developer ID Application certificate, and the API key must be permitted to submit software for notarization. The workflow uploads the stapled, verified ZIP and DMG to the GitHub release.

For Xcode debugging, open `Package.swift`, choose **EspDesktop**, and click Run. See the [public Mac app guide](https://espdesktop.com/getting-started/mac-app) for pairing, Accessibility and first-run setup.

Use the menu-bar icon to connect or disconnect, open the browser editor with **Customize Display**, or open **Mac Settings**. The settings toolbar offers **Display**, **Apps**, **Folders**, **Updates** and **Support**. **Launch at login** is available in the packaged app. The local Swift launcher shows installation guidance for this setting.

The Mac shares approved app and folder names and identifiers with the paired display. Folder paths stay on the Mac. It also shares system statistics while connected.

The display can request approved app and folder actions, validated keyboard shortcuts and web URLs. Website cards open in the default browser. Pairing uses a temporary code, a credential stored in macOS Keychain and certificate pinning. See [Permissions & Security](https://espdesktop.com/mac-controls/security) for details.

### Companion updates

Choose **Check for Updates…** from the **EspDesktop** app menu or from the EspDesktop icon in the menu bar. You can also choose **Check Now** in Mac Settings → Updates. **Automatically Check for Updates** is on by default. EspDesktop checks when you launch the app and daily while it’s running. Sparkle presents an update dialog when it finds a compatible version. If an update is waiting in the background, opening EspDesktop brings the dialog forward.

Turn on **Notify Me About Updates** in Mac Settings → Updates and allow macOS notifications to receive one notification per available build. Clicking the notification opens the updater. **Automatically Install Updates** is off by default. Enabling it lets Sparkle download eligible updates in the background and install on quit. macOS may still request authorization. Turn off automatic checks to stop scheduled downloads as well. Launch at Login under Display → Permissions keeps Companion available after signing in.

GitHub Pages serves the newest signed Mac update feed for each Companion protocol, including when a newer release contains only firmware. Sparkle verifies the feed and archive using the public key embedded in the app. An incompatible protocol upgrade requires manually installing a matching app and firmware release. Builds that still use the old GitHub latest-release URL may need a one-time manual update. Local Swift launches without an app bundle show installation guidance.

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
