---
name: sign-notarize-espdesktop
description: Build and Developer ID sign EspDesktop for persistent Accessibility identity, submit it to Apple notarization, staple and verify the ticket, and install when requested. Use for EspDesktop signing, notarization, or signed local rebuilds; does not publish GitHub releases or flash firmware.
---

# Sign and notarize EspDesktop

Use the existing packaging tools and the user's saved Keychain credentials. Match the requested scope: signing only, notarizing an existing app, or a complete build/sign/notarize/install. A request to create or explain this skill does not authorize running the pipeline.

## Select the exact app

- Locate the EspDesktop checkout from the current task and `git rev-parse --show-toplevel`; work from the selected worktree and read applicable AGENTS.md. Run repository-relative commands from that root.
- Determine the requested worktree/ref from the task, `git worktree list`, branch status, and relevant PR ancestry. Do not assume main contains the UI currently being tested: stacked PRs may merge into another feature branch first.
- For notarizing the installed app, start with `/Applications/EspDesktop.app`; no rebuild is needed. For a new build, retain the user's current feature changes and record source commit and dirty state. Ask only when the intended source cannot be established.
- Do not replace an app simply because another task has a more recent binary timestamp. Do not launch packaged copies from multiple temporary worktrees.

## Verify signing prerequisites

- Run `security find-identity -v -p codesigning`. A usable **Developer ID Application** identity needs both its certificate and private key; Developer ID Installer cannot sign the app.
- The local helper is `macos/EspDesktop/Packaging/build_local.sh`. Read it before running. It saves a certificate fingerprint (not a private key) in `~/.config/espdesktop/signing-identity`, shared across worktrees.
- Run the helper without overriding the saved identity. If first-time setup is needed, use the verified fingerprint through `CODE_SIGN_IDENTITY`. Never fall back to `ALLOW_ADHOC=1` for an app installed for normal use: ad-hoc identity changes on each build.
- Inspect the installed app with `codesign -d -r-`. Some macOS versions print `# designated =>`, others `designated =>`; handle either. A new signed build must satisfy the installed certificate-signed app's designated requirement. Do not weaken that requirement to an identifier-only check.
- The initial ad-hoc-to-Developer-ID transition can require one new Accessibility approval. Do not run `tccutil reset`, alter the privacy database, or broaden Keychain trust during routine builds.
- If `codesign` prompts for the signing key, the user enters the login Keychain password locally. Explain that Allow is per operation and Always Allow permits repeated signing by codesign. Never collect the password in chat or change access for all private keys.
- Keep build/package mutations sequential; concurrent packaging into the same output folder can corrupt the result.

## Notarize with the saved local profile

Use the user-configured `notarytool` Keychain profile. **EspDesktop** is a suggested profile name, not an assumption that credentials exist. Substitute the selected name wherever `EspDesktop` appears after `--keychain-profile` below. Never print stored secrets. If no profile exists, have the user run `xcrun notarytool store-credentials EspDesktop` interactively using their own Apple Account, team ID and app-specific password.

The repository's `notarize_standalone.sh` may require API-key environment variables. Do not force conversion from the already-working Keychain profile, export private keys, or invent those variables. For the local profile workflow:

1. Verify the app with `codesign --verify --deep --strict` and inspect signing authority, team and timestamp. Stage a copy in a unique temporary output directory. Preserve the installed app until verification succeeds.
2. Create the submission ZIP using `ditto -c -k --keepParent <staged.app> <submission.zip>`.
3. Submit with `xcrun notarytool submit <submission.zip> --keychain-profile EspDesktop --output-format json`. Save the JSON and submission ID in that output directory.
4. Resume that ID with `xcrun notarytool info` or `wait`, using the same profile. Use bounded waits (e.g. `--timeout 45s`) and keep the user informed. If interrupted or a request times out, inspect the saved ID/history before submitting again. Do not create scheduled polling unless requested.
5. Continue only for explicit **Accepted** status. For **Invalid**, obtain `xcrun notarytool log <id> --keychain-profile EspDesktop`, diagnose, and fix within authorized scope before resubmitting a changed artifact. Authentication failure needs credential repair. If Apple is still processing after a few bounded waits, report the pending ID and leave the installed app untouched rather than claim completion.
6. Run `xcrun stapler staple <staged.app>`, `xcrun stapler validate <staged.app>`, `codesign --verify --deep --strict <staged.app>`, and `spctl --assess --type execute --verbose=4 <staged.app>`. Gatekeeper should report `accepted` and `source=Notarized Developer ID`.
7. Make the final distribution ZIP **after** stapling. An app-only request does not require a DMG. If a DMG is requested, use the repo's DMG builder, submit that artifact as well, and staple/validate it.

## Install and verify when in scope

- Installing/reopening may be authorized by the current task or established update workflow; notarization alone does not imply publishing a release.
- If the installed app is the exact submitted build (compare its executable and signature identity), staple it in place and validate it; no app replacement or restart is necessary.
- Otherwise verify the replacement satisfies the installed signed identity, preserve a uniquely named backup outside Applications, stop only the identified EspDesktop instance, install consistently at `/Applications/EspDesktop.app`, and reopen that exact path. Do not leave duplicate app backups in Applications.
- Verify the running executable path, signature, ticket, and Gatekeeper assessment. Use UI inspection when changed UI needs confirmation.
- Signing continuity is not proof of Accessibility continuity. Only claim permission persisted after the user/runtime confirms it across a changed signed build. Notarization does not grant Accessibility permission.

Report the source/build, installed path if changed, Apple acceptance and validation results, final artifact link, and any remaining user approval or pending state. Do not publish releases, upload credentials to GitHub, merge PRs, or flash devices unless separately requested.

## References

Consult current Apple documentation when credentials, errors or requirements differ from this workflow:
- https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
- https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
