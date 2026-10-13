---
name: make-local-signed-app
description: Build EspDesktop locally with the saved Developer ID certificate, upload it to Apple for notarization, archive the previous app, and install and open the verified build in Applications. Use for “make local signed app” or repeating this local installation workflow; does not publish a release or flash displays.
---

# Make local signed app

Produce a new Developer ID signed, Apple-notarized EspDesktop app and install it at `/Applications/EspDesktop.app`. This workflow uploads the app bundle to Apple. Honor narrower requests and existing authorization; creating or editing this skill does not authorize executing it. If automatic approval review blocks an action, explain the action and rejection reason and request the missing approval without bypassing the block.

## Select and build the source

- Resolve the EspDesktop repository from the active chat and read its applicable `AGENTS.md`. The usual primary checkout is `/Users/jtenniswood/Git/espdesktop`.
- Honor a requested PR, branch, or worktree and retain its intended changes. When repeating the standalone workflow without a feature source in context, fetch and build latest `origin/main` in a unique, isolated detached worktree. Do not reset or update the primary checkout: its local `main` may be stale and contain unrelated changes.
- Record the source commit and dirty state. This is packaging work; no commit or PR is needed unless source files actually change. Follow the repository branch/commit/push workflow for any necessary code fixes.
- Read `macos/EspDesktop/Packaging/build_local.sh` and the standalone helper it calls. Use the local helper with the saved identity in `~/.config/espdesktop/signing-identity`; do not override it or fall back to ad-hoc signing. Verify a usable Developer ID Application identity with `security find-identity -v -p codesigning`.
- Use a unique output directory and a new numeric `CURRENT_PROJECT_VERSION` to identify the local build. Preserve the installed marketing version unless the user requests a version change; do not imply a published release.
- Prefer full Xcode for this Mac. Run with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` after verifying it exists. The command-line toolset failed in the verified workflow with missing `SwiftUIMacros.StateMacro`, while full Xcode built successfully. Set the environment for the command; do not change global `xcode-select` settings.
- Keep packaging sequential. Use bounded tool waits and share meaningful progress. Allow local Keychain prompts without requesting passwords in chat.
- Sandboxed Keychain access can report zero identities, and sandboxed `codesign` checks can report an unavailable authority or invalid signature. Request normal tool escalation to check the same artifact with Keychain access before diagnosing corruption. Never skip failed verification.

## Notarize and verify

- Verify `codesign --verify --deep --strict` and inspect the certificate, team, and timestamp. Compare the new app with the installed app's designated requirement. Accept either `designated =>` or `# designated =>` output; pass the expression using `codesign --verify --strict -R "=$REQUIREMENT" <new.app>`. Preserve the full certificate requirement. For a first installation there is no installed requirement; an initial ad-hoc to Developer ID transition may require one new Accessibility approval.
- Stage the app in a unique output directory before replacing anything. Create the submission ZIP with `ditto -c -k --keepParent <staged.app> <submission.zip>`.
- The Keychain profile `EspDesktop` worked in this workflow. Verify it is still usable, for example with `xcrun notarytool history --keychain-profile EspDesktop --output-format json`. Never print or export credentials. If credentials are unavailable, have the user repair them locally.
- Submit the ZIP with `xcrun notarytool submit <submission.zip> --keychain-profile EspDesktop --output-format json`, saving the returned JSON and submission ID.
- Resume that ID with `notarytool wait` using `--timeout 45s`, or `info`. Do not resubmit the same artifact after a timeout. After a few bounded waits, leave the installed app untouched and report the pending ID if Apple is still processing. Do not schedule polling.
- Require explicit `Accepted`. For `Invalid`, retrieve the submission log and diagnose within the authorized scope.
- Run `xcrun stapler staple`, `xcrun stapler validate`, `codesign --verify --deep --strict`, and `spctl --assess --type execute --verbose=4` on the staged app. Require Gatekeeper acceptance with `source=Notarized Developer ID`.
- Create the final app ZIP after stapling. A DMG is unnecessary for this local app request.

## Archive, install, and open

- Only after all checks pass, stop the identified installed EspDesktop process if running. Match its executable path; do not stop unrelated apps or other worktree instances.
- If an old app exists, archive it under `~/Library/Application Support/EspDesktop/Archives/<unique timestamp and suffix>/EspDesktop.app`. Record the old version/build, executable SHA-256, signing identity, and original installation path beside it. Record the old source commit only if known.
- Stop if archiving fails. Copy the verified staged app with `ditto` to `/Applications/EspDesktop.app`, verify its signature, stapled ticket, and Gatekeeper acceptance, then open that exact path.
- Confirm the running executable is `/Applications/EspDesktop.app/Contents/MacOS/EspDesktop`. If installation or launch fails, preserve the failed new app separately and restore and reopen the archived app when available.
- Do not reset Accessibility permissions or modify the privacy database. Signing continuity does not prove permission continuity; ask the user to test display connection and controls without claiming device testing passed.
- Preserve the final ZIP and notarization records outside the build worktree. Remove only the temporary worktree created for this build after confirming no source changes need preserving. Keep archived installed versions until cleanup is requested.

Report the installed app link, source commit/build, successful signing and Apple/Gatekeeper results, archive and ZIP links, and what the user should test. Do not publish releases, merge PRs, flash firmware, or create scheduled jobs.
