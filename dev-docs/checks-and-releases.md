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

Pull request firmware checks compile one representative P4 board (7-inch
`guition-esp32-p4-jc1060p470`) and one S3 board (4-inch
`guition-esp32-s3-4848s040`). The P4 check also compiles its recovery firmware.
Nightly builds compile every supported device, including P4 recovery firmware.
A failed nightly run opens a repository issue with the run logs, tested commit,
job results, and failed targets when available. Setup and matrix failures also
open an issue; cancelled runs do not. Each failed attempt creates a new issue.

## Public Release Devices

The first release supports only the 4-inch Guition ESP32-S3 4848S040.
`product/release_devices.json` controls firmware release builds, public firmware
downloads, and generated USB install buttons. Add another device there only when
it is ready to ship. All other device profiles and nightly/PR build coverage are
retained for future upgrades; their manual setup guides are development material.

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

**Build Release** makes the firmware and notarized Mac app available as
workflow artifacts. Its summary gives the candidate run ID and the fingerprint
of the manifest that records their file hashes and pins the release manifest
that identifies the hosted editor.

Test those files together on a Guition 4848S040. Start with a paired display
and an existing layout. Install the candidate firmware and Mac app, confirm
the Mac reconnects, and run a nested shortcut. Keep the panel on the local
network, disconnect internet access, edit the layout in the embedded editor,
and check that the edit survives a reboot.

Dispatch **Publish Release** from the same tag with the candidate run ID,
fingerprint, and confirmed hardware result. It downloads the tested artifacts
and verifies their provenance, filenames, hashes, sizes, and remote inventory
before publishing. Pages deploys the editor from that successful publish run.
Failures leave the release as a draft.

Current generated-output ownership is listed in
[Source of Truth Contract](source-of-truth.md); upgrade-sensitive public names
and formats are listed in [Compatibility Contract](compatibility-contract.md).
Use [Change the Release Workflow](playbooks/change-release-workflow.md) for the
exact edit and verification procedure.
