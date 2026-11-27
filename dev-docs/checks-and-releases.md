# Checks and Releases

This page describes how verification and release safety work. Use the generated
[Check Matrix](check-matrix.md) or a [Task Playbook](playbooks/README.md) for the
exact commands required by a change. Tool installation belongs in
[Development Environment](development-environment.md).

## Dependency-Aware Check Graph

The public npm check commands enter the dependency-aware task graph. A focused
task automatically includes its declared prerequisites; the product, fast, CI,
all, and release profiles run broader assurance sets. The release profile covers
firmware host-service tests, cross-language saved-configuration parity, browser
journeys, device-matrix validation, generated outputs, documentation, and
release manifests.

`scripts/check_tasks_data.py` is the maintained source for task commands,
dependencies, profiles, domains, input paths, cache inputs, tool requirements,
and parallel safety. `scripts/check_tasks.py` plans and executes that registry.
It can list registered tasks or explain a profile before running it.

## Parallel Execution

Normal npm aliases and CI use one worker. The explicit `check:parallel` entry
allows no more than four workers, and only dependency-independent tasks marked
parallel-safe may overlap. Browser, release, Git-state, and shared-output checks
always run alone; release profiles remain single-worker.

After the first failure, no new tasks start. Already-running tasks finish and
dependent tasks are reported as blocked. The decision to keep parallel mode
opt-in is supported by the dated
[parallel-check benchmark](history/parallel-check-benchmark.md).

## Deterministic Result Cache

Successful deterministic local checks are cached by content in the repository's
shared Git directory, so linked worktrees can reuse results. A key includes the
task and command, dependency keys, declared authored and generated inputs,
runner and registry code, lockfiles, platform, tool versions, and declared
environment variables. Any change to those values causes a fresh check.

Only successful results are stored, corrupt entries are misses, and checks that
depend on Git history, release state, external state, or shared output are never
cached. Browser smoke is cacheable only when Playwright, Node, Chromium, layouts,
and web inputs are all fingerprinted. `CI=true` disables the result cache so CI
always runs from scratch.

The task runner supports cache status, cache clearing, and a `--no-cache` option
for deliberate fresh execution.

## Changed-Path Planning

The changed-path planner considers committed, staged, unstaged, renamed,
deleted, and untracked paths relative to `main`. Unknown paths and changes to
shared helpers, generators, validators, the task runner, registry, lockfile, or
workflow definitions select the complete fast profile. Domain filters can
narrow a deliberately selected CI profile, but changed-path planning never
reduces CI coverage.

## Confidence Levels

Playbooks use three consistent levels:

- Minimum proves the narrow contract touched by a change.
- Recommended runs the normal product-level safety net for that workflow.
- Release-grade adds broad checks, browser journeys, documentation builds, or
  firmware compiles when release-facing behavior is involved.

A successful compile is automated evidence, not physical-device confirmation.
Record flashing and device behavior separately in the pull request.

## Firmware Build Coverage

Pull request firmware checks compile the release targets first, followed by one
representative of each remaining chip family. Each P4 target also compiles its
recovery firmware.
Nightly builds compile every supported device, including P4 recovery firmware.
A failed nightly run opens a repository issue with the run logs, tested commit,
job results, and failed targets when available. Setup and matrix failures also
open an issue; cancelled runs do not. Each failed attempt creates a new issue.

## Public Release Devices

The public release target is the 4-inch Guition ESP32-S3 4848S040.
In `product/release_devices.json`, `devices` enables website firmware downloads
and the web installer. `artifactOnlyDevices` enables GitHub release assets and
keeps those profiles out of the published site data. Both lists feed the
release build matrix.

## Release Boundary

Before tagging, run the complete browser suite on Linux for a pushed branch or
tag with `gh workflow run ci.yml --ref <pushed-ref> -f browser_preflight=true`.
The optional `Release Browser Preflight` job checks browser behavior without
creating a release tag or draft. It supplements the full release preflight and
does not build firmware or sign the Mac app.
It defaults to the self-hosted release runners; choose `browser_runner=ubuntu-latest`
to compare against a hosted Linux runner. Optional `browser_profile=<device-slug>`
and `browser_scope=standard-icons` inputs narrow a diagnostic run. Full browser
preflight is still required before tagging.

Firmware releases start as private GitHub drafts. The manually dispatched build
workflow checks out one immutable tag in every job, materializes the selected
tag's web compatibility entry in the private checkout, builds every public release
target, and writes only publishable files to the distribution. The firmware compile
embeds the offline editor from the same verified web artifact that Pages
receives. Its SHA-256 is checked before compilation. Generated source
and build caches are not assets.

**Build Release** makes the firmware, notarized Mac app, and unsigned Windows
setup files for x64 and Arm64 available as workflow artifacts. The Windows jobs
build from the release revision and exercise install, launch, upgrade, and
uninstall. The summary gives the candidate run ID and manifest fingerprint.
The manifest records the Windows installer hashes alongside the Mac archives
and supported firmware, and pins the release manifest for the hosted editor.

Follow the [stable release setup docs checklist](docs-discovery.md#verify-the-setup-docs-for-each-stable-release)
with the candidate and again after Pages deploys. Record any physical setup
results in the candidate test notes.

Install and open the notarized Mac app from the candidate run. Once the user
confirms the app works, dispatch **Publish Release** from the same tag with
the candidate run ID and manifest fingerprint. The workflow checks the
fingerprint and verifies the candidate artifacts before publishing. Use the
[S3 hardware session](device-runtime-tests.md#run-the-release-hardware-session)
for additional display diagnostics when needed.
Pages deploys the editor from that successful publish run. Failures leave
the release as a draft.

If a firmware release was published directly on GitHub, **Deploy Docs** can
pick up the new version before its editor is hosted. It downloads the editor
from the successful **Build Release** run for the tag and checks it against
the published release manifest before deploying.

Current generated-output ownership is listed in
[Source of Truth Contract](source-of-truth.md); upgrade-sensitive public names
and formats are listed in [Compatibility Contract](compatibility-contract.md).
Use [Change the Release Workflow](playbooks/change-release-workflow.md) for the
exact edit and verification procedure.

## Windows signing with SignPath Foundation

Before enabling Foundation signing, confirm that the project is accepted and
complete these steps under the [SignPath Foundation terms](https://signpath.org/terms).

- Verify multi-factor authentication for all release team members on GitHub and
  SignPath. Assign the maintainer as reviewer and signing approver in SignPath.
  A maintainer reviews outside contributions, including changes to build scripts
  and workflows, and manually approves each signing request.
- Inventory the files in both Windows installers and confirm licensing and
  signing scope with SignPath. The USB editor uses Microsoft’s
  [WebView2 SDK](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4370.26/License).
  The SDK package publishes BSD-style terms. Confirm whether SignPath accepts
  the packaged SDK files and treats the separately installed Windows runtime
  as a system library. Confirm whether WebView2’s required diagnostics need
  further action and how SignPath treats the Inno Setup installer and generated
  uninstaller.
  Use the Foundation certificate only for artifacts SignPath approves as
  EspDesktop’s own. Keep upstream binaries’ existing signatures.
- Configure SignPath’s trusted GitHub build to accept only artifacts built from
  the official release revision. Run every job leading to signing on a
  GitHub-hosted runner, as required by the [SignPath GitHub integration](https://docs.signpath.io/trusted-build-systems/github#checks-performed-by-signpath).
  Set its metadata restrictions to enforce
  EspDesktop as the product name and the same release version on every signed
  binary. Verify the signed app and setup together, including an in-app update,
  before recording their hashes in the release manifest. The current Windows
  CI signing test uses temporary test certificates.
- Keep the [Code signing policy](https://espdesktop.com/reference/code-signing)
  linked from the project home page and release notes. When signed builds are
  available, update the download and release pages to reflect their status.
  If SignPath receives a complaint, help verify it, investigate, and identify
  the cause.

## Homebrew

The [EspDesktop tap](https://github.com/jtenniswood/homebrew-tap) tracks the
highest stable version with a published Mac ZIP. **Update Homebrew Tap** runs
after a successful **Publish Release** workflow or a stable GitHub release
publication. It uses GitHub's asset checksum and skips firmware-only releases.

If an update fails, rerun **Update Homebrew Tap** from the default branch. It
only commits when the cask changes. The `HOMEBREW_TAP_DEPLOY_KEY` Actions secret
holds the SSH deploy key with write access to the tap repository.
