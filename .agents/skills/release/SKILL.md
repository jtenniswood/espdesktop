---
name: release
description: >-
  Create a coordinated EspDesktop GitHub release with flashable firmware for all
  supported screens and a Developer ID signed, Apple-notarized Mac app, using the
  verified draft release workflow. Use for /release, a patch/minor/major release,
  or publishing firmware and Mac release downloads. Editing this skill does not
  itself request a release.
---

# Release Screen Firmware and the Mac App

Use `.github/workflows/release.yml` (`Build Release`) to build both products from
one immutable source revision. It builds all release devices, signs and notarizes
EspDesktop on a GitHub Mac runner, and signs the Sparkle automatic-update feed.
Build Release creates a private candidate. Install and open its notarized app
on the Mac handling the release, then ask once whether it works. Use
`.github/workflows/publish-release.yml` (Publish Release) after confirmation
to verify and publish those same files.

An explicit release request includes this local Mac installation. Editing or
inspecting this skill does not start a release.

## 1. Select the source and check readiness

Read the selected checkout's `AGENTS.md` and release workflow. Use current
`origin/main` unless the user explicitly selects another source. Confirm that
requested features have actually reached that source: a PR merged into another
feature branch is not necessarily on main.

```bash
git status --short --branch
git fetch origin --tags --prune
gh auth status
gh release list --limit 10
git tag --list 'v*' --sort=-v:refname | head -20
```

Use a separate clean worktree for release preparation, preserving unrelated
edits in the user's checkout. Do not switch or reset a dirty checkout. Only
committed, pushed source can be released; include release-related edits through
a reviewed preparation PR before tagging. Confirm required CI is successful for
the selected revision and the workflow's self-hosted firmware runners are
available. The Mac job uses a GitHub-hosted macOS runner; it does not depend on the local Keychain.

Check repository secret **names only**:

```bash
gh secret list --json name --jq '.[].name'
```

All seven must be configured:

```text
MACOS_DEVELOPER_ID_P12_BASE64
MACOS_DEVELOPER_ID_P12_PASSWORD
MACOS_DEVELOPER_ID_APPLICATION
APPLE_NOTARY_KEY_BASE64
APPLE_NOTARY_KEY_ID
APPLE_NOTARY_ISSUER_ID
SPARKLE_PRIVATE_KEY
```

The P12 must contain the Developer ID **Application** certificate and private
key. The notary credentials are an App Store Connect **team** API key. The
Sparkle private key must match `macos/EspDesktop/Packaging/sparkle-public-key.txt`.
Never print secret values, commit key material, substitute ad-hoc signing, or
replace a missing Sparkle key without addressing existing app update trust.

Secret names alone do not prove valid credentials. Use a successful signing test
or release run as evidence, noting when credentials have changed since that run.
If `test-mac-signing.yml` is available, use it for an authorized isolated credential
test; do not publish a throwaway release as a credential test. Missing credentials
block the coordinated release, not just its Mac portion.

## 2. Choose the version

Use full semantic tags: `vMAJOR.MINOR.PATCH`. Use an explicitly supplied full tag
exactly. Normalize short tags such as `v1.1` to `v1.1.0` and confirm the selection
before starting the publishing workflow. For a requested release type, calculate
from the latest stable tag, ignoring prereleases, and confirm the selected tag:

- Patch: `v1.2.3` → `v1.2.4`.
- Feature/minor: `v1.2.3` → `v1.3.0`.
- Major: `v1.2.3` → `v2.0.0`.
- With no stable release, default to `v1.0.0`.

Preserve an explicitly requested prerelease such as `v1.2.3-beta.1`. Firmware,
Mac filenames and release metadata share this tag. The workflow sets the Mac
marketing version to its numeric portion and uses the release workflow run
number for `CFBundleVersion`; verify that it increases relative to the previous
shipped Mac build. Do not copy a build number from an independent test workflow.

Set `TAG` to the selected full tag.

## 3. Verify release source readiness

No preparation PR is required. The Build Release workflow prepares the selected
tag's web compatibility privately, verifies its bundles, and passes the same web
assets through firmware compilation and publication. Pages uses the published
EspDesktop release catalogue and deploys the verified release artifacts.

Keep the selected source checkout clean and generated outputs current before
tagging. Run `npm run check:release-preflight`. The compatibility helper retains
`dev`, the five current stable releases and the latest prerelease. Preserve the
coordinated firmware and signed, notarized Mac app release checks below.

## 4. Create the immutable tag and draft

First inspect whether the tag, draft or workflow run already exists. Reuse an
existing draft only when its remote tag resolves to the intended `SOURCE_SHA`.
Never move an existing release tag or rebuild different source under it.

For a new tag:

```bash
git tag -a "$TAG" "$SOURCE_SHA" -m "Release $TAG"
git push origin "$TAG"
gh release create "$TAG" --verify-tag --draft \
  --notes "Screen firmware and the signed Mac app are being built and verified. This draft is awaiting confirmation of the local Mac installation." \
  --fail-on-no-commits
```

For a prerelease, add `--prerelease --latest=false` to release creation. Keep it
out of the stable automatic-update channel. Do not publish the draft manually
or use a `release.published` event to start the build: that exposes an incomplete
release before its downloads are verified.

```bash
git ls-remote --exit-code --tags origin "refs/tags/$TAG" "refs/tags/$TAG^{}"
gh release view "$TAG" --json isDraft,tagName,url
```

## 5. Dispatch and monitor both builds

After the tag and draft are verified, dispatch the workflow from that same tag:

```bash
gh workflow run release.yml --ref "$TAG" -f release_tag="$TAG"
gh run list --workflow release.yml --event workflow_dispatch --limit 10 \
  --json databaseId,status,conclusion,headBranch,headSha,createdAt,url
```

Match the run to the tag and `SOURCE_SHA`, then monitor with bounded status/log
checks. Report meaningful progress and failures for both paths:

- Product preflight and every device in `python3 scripts/device_matrix.py release`.
- Firmware assembly, recovery images where declared, manifests and provenance.
- Mac tests, P12 import, Developer ID signing, Apple acceptance of app and DMG,
  stapling, signature/Gatekeeper checks and Sparkle feed signature verification.
- Prepare Release Candidate, which verifies the compatibility manifest
  and records the candidate run ID and fingerprint.

On failure, inspect the failed job and confirm the release remains a draft.
Never publish a partial firmware-only release to bypass a Mac failure. For a
transient failure, retry the failed jobs of the same source-pinned run after
diagnosis; inspect pending Apple submission IDs before resubmitting. Stop retries
if the same failure recurs without new evidence or a repair. Source changes need
a new reviewed revision and new tag, not a moved tag. Do not close issues unless
explicitly requested.

## 6. Install the candidate Mac app and ask once

Download the Mac ZIP and compatibility manifest from the successful
`CANDIDATE_RUN` into a fresh staging directory:

```bash
gh run download "$CANDIDATE_RUN" -n espdesktop-app-release -D "$STAGE/mac"
gh run download "$CANDIDATE_RUN" -n release-candidate-compatibility -D "$STAGE"
```

Check that `companion-compatibility.json` names the selected tag and source SHA.
Compare its SHA-256 to the candidate fingerprint in the run summary and check
the ZIP's SHA-256 against its manifest entry. Retain the matched manifest hash
as `CANDIDATE_FINGERPRINT`. Extract the ZIP with `ditto -x -k` and verify the
app's Developer ID signature, notarization ticket and Gatekeeper assessment.

Follow the [archive, install, and open steps](../make-local-signed-app/SKILL.md#archive-install-and-open)
using the extracted candidate app. Verify that the installed candidate is running
from `/Applications/EspDesktop.app`. If installation fails, recover the previous
app as described there and keep the release private.

Ask one question once the candidate is running: “Does EspDesktop $TAG work on
this Mac?” Wait for a positive answer before dispatching Publish Release. If the
user reports a problem, keep the draft private. The firmware remains available
as build artifacts, and a display test is optional.

```bash
gh workflow run publish-release.yml --ref "$TAG" \
  -f release_tag="$TAG" -f candidate_run="$CANDIDATE_RUN" \
  -f confirmed_fingerprint="$CANDIDATE_FINGERPRINT"
```

Monitor Publish Release through completion. For a retry, reuse the confirmed
run and fingerprint while its artifacts are still available. Ask for a new
confirmation if the candidate changes.

## 7. Verify the complete published distribution

After Publish Release succeeds:

```bash
gh release view "$TAG" --json tagName,url,isDraft,isPrerelease,assets \
  --jq '{tagName,url,isDraft,isPrerelease,assets:[.assets[].name]}'
python3 scripts/device_matrix.py release
```

Derive expected devices from the **tagged** matrix instead of maintaining a
second list in this skill. Require nonempty downloads for all of:

| Product | Required assets |
| --- | --- |
| Each release screen | `<slug>.factory.bin`, `<slug>.ota.bin`, `<slug>.manifest.json` |
| Each screen with `recovery: true` | `<slug>.recovery.bin`, `<slug>.recovery.manifest.json` |
| Firmware provenance | `release-manifest.json` |
| Signed, notarized Mac app | `EspDesktop-${TAG#v}.zip`, `EspDesktop-${TAG#v}.dmg` |
| Signed automatic-update feed | `companion-appcast-v<protocolVersion>.xml` |
| Coordinated compatibility | `companion-compatibility.json` |

Read the protocol version from tagged `product/v2/companion_capabilities.json`.
Check the workflow's verification results, not only filenames. The compatibility
manifest must identify the same tag/source SHA and hashes for the Mac archives
and supported firmware; the release manifest verifies firmware/web provenance.
Use `scripts/companion_release.py verify` and the existing firmware verification
commands if downloaded artifacts require independent verification.

Confirm `isDraft` is false, the prerelease flag is correct, and release notes
cover both screen and Mac changes. For public download/update availability,
check the `Deploy Docs` run triggered by the successful release and its published
links; distinguish publishing from Pages propagation. Do not claim physical
screen testing or Accessibility permission persistence from CI results.

### Verify Homebrew after publication

For a stable release with a Mac ZIP, verify the Homebrew tap after **Publish
Release** succeeds and the release is public. Find the automatic run created
after the publication run and watch it with `gh run watch <run-id> --exit-status`.

```bash
gh run list --repo jtenniswood/espdesktop --workflow homebrew.yml \
  --event workflow_run --limit 10 --json databaseId,createdAt,status,conclusion,url
```

Compare the [public cask](https://github.com/jtenniswood/homebrew-tap/blob/main/Casks/espdesktop.rb)
with GitHub's published Mac ZIP metadata. Confirm the version, download URL and
SHA-256 match. If a higher stable Mac version is already public, confirm the tap
still tracks it. Skip the Homebrew check for prereleases and firmware-only releases.

If the automatic run is missing after a brief wait or fails, inspect the run
status or logs. After confirming successful publication, dispatch one recovery
run if the automatic run is missing or a transient failure has cleared.

```bash
gh workflow run homebrew.yml --repo jtenniswood/espdesktop --ref main
```

Watch the recovery run and verify the cask again.

## Report back

Give the tag, release URL and run result; confirm firmware for all declared
screens, signed/notarized Mac ZIP and DMG, and signed update feed are attached.
State whether publication and any checked Pages deployment succeeded, along with
the installed Mac version and any failures. For stable Mac releases, include
the Homebrew run URL, verified cask version and any unresolved tap issue.
