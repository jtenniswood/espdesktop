---
name: build-signed-app-flash-firmware
description: Build and Developer ID sign EspDesktop, flash the selected development display, then archive and replace /Applications/EspDesktop.app when the current request authorizes the full local test update. Use for combined Mac app and firmware testing, not releases or notarization-only work.
---

# Build, flash, and install EspDesktop locally

Use this workflow when the user wants a matching local Mac app and development firmware. Keep the app and firmware on the same selected checkout and revision. Do not publish a release, notarize, or create a PR as part of this operational workflow.

## Confirm scope and source

- A request to run the complete workflow authorizes building, flashing the requested display, and replacing the installed Mac app. Do not ask for the same approval again.
- If the user asks only to build, do not flash or install. If they have not authorized a flash target or app replacement in the current task, finish the build and ask before those remaining side effects.
- Use the checkout or managed worktree selected for the current task. Never silently switch branches or copy changes to `main`. Read `git status --short --branch` and `git rev-parse HEAD`; record the revision and whether the tree is dirty.
- Build both outputs from that same source. Keep the user's working changes intact and report the exact revision used.
- Default to `devices/guition-esp32-s3-4848s040/dev.yaml` over OTA at `192.168.6.100` when no display is specified. This is the user's designated 4-inch S3 test display. If they name another display, use its correct profile and target; for ambiguous hardware names consult `.agents/skills/flash-displays/SKILL.md` or ask one concise question.

## Build the signed Mac app

1. Check for a valid Developer ID Application identity with `security find-identity -v -p codesigning`. Do not use Developer ID Installer for an app bundle and never fall back to an ad-hoc signature for the installed app.
2. Run `macos/EspDesktop/Packaging/build_local.sh` from `macos/EspDesktop`. It uses the saved certificate fingerprint and checks that the new app satisfies the installed app's designated signing requirement.
3. If Swift reports that `SwiftUIMacros` cannot be found under Command Line Tools, retry with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` set for the helper. Do not change signing identity to work around a toolchain error.
4. Verify `macos/EspDesktop/.build/standalone/EspDesktop.app` with `codesign --verify --deep --strict` and confirm its Developer ID authority, team identifier, and timestamp. If the signing key prompts, the user enters any Keychain password locally; never request or print it.
5. Build only. Do not overwrite or install `/Applications/EspDesktop.app` until the selected firmware flash has succeeded.

If no Developer ID certificate/private key is available, stop before flashing. Explain that the user must install or unlock their signing certificate in Keychain. Do not create ad-hoc output as a substitute.

## Flash the selected display

- Use the development `dev.yaml` profile unless the user specifies a different repository YAML.
- For the default S3 profile, use the already-approved secrets source `/Users/jtenniswood/Git/espcontrol-pr-1432/devices/guition-esp32-s3-4848s040/secrets.yaml`. Before creating a symlink, verify the source still exists and is a file with `test -f /Users/jtenniswood/Git/espcontrol-pr-1432/devices/guition-esp32-s3-4848s040/secrets.yaml`; if that check fails, stop and report that the approved source is unavailable rather than creating a dangling link or guessing another source. If the profile has no `secrets.yaml`, create only an ignored symlink to the verified source, then confirm the destination resolves with `test -f secrets.yaml`. If a different file or link already exists, stop rather than replacing it. Never read, print, copy, or commit secret contents.
- For another display, preserve and use its already-configured local secrets file. Stop if it is missing or points to an unexpected source; do not guess credentials.
- Before OTA, check the selected target with `ping -c 2 -W 1000 <target>`. If it is unreachable, stop before flashing and report the target.
- From the selected device directory, run the repo-pinned wrapper so it builds the current checkout with the ESPHome version in `.github/esphome.env`:

  ```bash
  python3 ../../scripts/local_esphome.py dev.yaml run --device <target> --no-logs
  ```

- Flash one display at a time. USB is only for a user-specified USB flash; select the connected port rather than guessing.
- Require `INFO OTA successful` (or the corresponding successful USB upload) before replacing the Mac app. After OTA, ping the device again; if the first ping fails during reboot, wait briefly and retry once.
- If build/upload fails or OTA recovery cannot be confirmed, leave `/Applications/EspDesktop.app` unchanged. Keep the signed build available in the worktree and report the firmware failure.

## Replace the installed Mac app

Only run this section when replacement is included in the current user request.

1. Confirm the currently installed app is `/Applications/EspDesktop.app`. Compare its designated requirement with the signed build; do not weaken verification to bundle identifier alone.
2. Find any running EspDesktop process and verify its executable path. Quit only the process launched from `/Applications/EspDesktop.app`, gracefully, before replacing it. Do not stop a copy running from another path.
3. Create a unique archive directory under `~/Library/Application Support/EspDesktop/Archives/`, for example `YYYY-MM-DD_HHMMSS_local-update`. Never overwrite an existing archive.
4. Record the previous app's original path, bundle version, build number, executable SHA-256, signing authority, and archive time in `original-app.txt` beside the archived `EspDesktop.app`. Record the replacement source commit only when known; do not infer the old app's source commit from its build number.
5. Move the old app into the archive, then copy the verified signed app to `/Applications/EspDesktop.app` with `ditto` so bundle resources and metadata are retained.
6. Verify the installed copy with `codesign --verify --deep --strict` and `codesign --verify --strict -R "=<installed app designated requirement>"`. If copying, verification, or launch fails, preserve the failed copy separately and restore the archived original app to `/Applications/EspDesktop.app`.
7. Open `/Applications/EspDesktop.app`, then verify the running executable path and signature at that exact location. Do not claim Accessibility permission persisted unless the user/runtime confirms it.

This workflow Developer ID signs but does not notarize. Report the `spctl --assess --type execute --verbose=4 /Applications/EspDesktop.app` result. If it says `Unnotarized Developer ID`, explain that this local app can be tested on this Mac, but sharing it may trigger Gatekeeper. Only notarize when separately requested, following `.agents/skills/sign-notarize-espdesktop/SKILL.md` and the user's saved notarization credentials.

## Report

State the source revision and dirty/clean status, signed app build result and installed path, selected display and target, upload and post-reboot reachability result, archived app location, and signature/Gatekeeper result. Separate successful compilation or OTA from confirmation that the user has visually tested the display. Do not claim a physical UI result from build, ping, or HTTP evidence alone.
