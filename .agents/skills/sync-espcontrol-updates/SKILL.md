---
name: sync-espcontrol-updates
description: >-
  Review recent closed and merged PRs in jtenniswood/espcontrol and port applicable
  changes into jtenniswood/espdesktop with validation and a ready-for-review PR.
  Use when the user invokes "sync espcontrol updates", /sync-espcontrol-updates,
  or asks to bring recent EspControl changes into EspDesktop. Defaults to the
  last 24 hours; respect an explicit date range or research-only request.
---

# Sync EspControl Updates

Bring relevant changes from https://github.com/jtenniswood/espcontrol/pulls into
EspDesktop while preserving its separate product behaviour. Produce a review
accounting for every source PR in the requested window, an isolated port branch,
and a ready-for-review destination PR when changes are needed.

## Establish the window and destination

- Default to the 24 hours ending at the start of the invocation. Record exact UTC
  start/end timestamps once and keep that window fixed throughout the sync.
  Use the user's dates, duration, or explicit PR list when supplied.
- Verify the destination checkout's remote is `jtenniswood/espdesktop`, inspect
  its working tree, and read its current `AGENTS.md`. If invoked elsewhere,
  locate the user's existing EspDesktop checkout from available context.
- Fetch current destination `main`. Check open destination PRs and merged history
  for earlier ports of the same source changes. Do not duplicate an existing port
  or modify another active feature branch simply because its files overlap.
- For implementation, use a separate worktree and descriptive feature branch
  from latest `origin/main`. Follow an explicit request to continue an existing
  sync branch. Honour a research-only request without editing or publishing.

## Review the source PRs

Use GitHub tools or `gh` to retrieve PRs closed within the window. A `closed`
query includes merged PRs; inspect both `closedAt` and `mergedAt`. Verify exact
boundary timestamps and handle pagination or query limits so the list is complete.
Use merge/closure time for the default window, not authors' commit timestamps.

For every source PR, record its number, title, URL, merge SHA when present,
changed files, practical effect, and disposition:

- **Port:** applicable changes are absent from the destination.
- **Already present:** equivalent behaviour is on destination main; cite evidence.
- **Covered by an open PR:** link the existing destination work and avoid duplication.
- **Not applicable:** explain the product, device, or release-specific reason.
- **Closed without merging:** record the closure context; do not import rejected
  or abandoned code merely because it appears in the closed list.

Read actual patches, relevant final code, tests, and review discussion rather
than relying on PR titles or summaries. For a merge commit, inspect its diff
against its first parent to identify what actually landed. Examine ancestry for
stacked PRs and overlaps; apply changes in merge/dependency order and retain later
corrections to earlier changes.

A source release-version entry is not automatically a destination release. Check
EspDesktop's own release contract and catalogue before porting release metadata.
If nothing applicable remains, return the accounting without an empty branch or PR.

## Port the behaviour

- Use targeted patches or three-way merges against the source patch's base.
  Preserve unrelated destination changes; do not replace whole files with
  upstream versions or blindly cherry-pick a renamed repository's commits.
- Adapt `components/espcontrol`, namespaces, macros and application IDs to the
  destination equivalents where required. Preserve original source/issue links;
  do not globally rewrite provenance URLs into nonexistent EspDesktop issues.
- Check interaction with Mac Companion, pairing/network settings, device
  capabilities, and existing configuration compatibility. A clean textual merge
  does not establish behavioural compatibility.
- For deferred Cover Art work, account for Mac Companion artwork without a Home
  Assistant media-player entity. Capture and recheck the source and ownership
  across yields; retain Companion's image transport instead of sending it through
  the HA URL/retry pipeline. Adapt regression harnesses to destination code paths.
- Review infrastructure fixes together. A retry that performs broad Docker
  container/volume pruning can undermine a later parallel-build cleanup fix.
  Use the destination's guarded cleanup and bounded retries where appropriate;
  test failure paths with mocks rather than running destructive maintenance.
- Carry over relevant tests and documentation. Regenerate web bundles, manifests,
  and generated documentation from EspDesktop sources instead of copying upstream
  generated output. For web changes, use `python3 scripts/build.py www`; measure
  the resulting bundle before updating its migration size baseline.

## Validate the integrated result

Use the destination's current check graph, dependency requirements and pinned
ESPHome version. Run relevant host, web, configuration and generated-output checks;
for broad firmware/web syncs, run the required CI graph and docs build. Include
meaningful checks of destination-specific adaptations and cancellation/failure paths.

For firmware changes, choose representative affected devices from the current
catalogue and broaden for distinct hardware paths. Shared S3/P4 changes normally
warrant the 4-inch S3, 7-inch P4 and 4.3-inch P4 factory builds; use the full current
matrix when device-wide coverage is needed. Read an applicable compile skill if
available, and use `.github/esphome.env` and `builds/<slug>.factory.yaml`.

If Docker cannot read external components through worktree Git metadata, build
from a normal temporary Git snapshot or a correctly mounted worktree. Verify that
all firmware inputs match the final port revision. Do not count an earlier build
as coverage for a later firmware change. Avoid concurrent heavy local builds.

Resolve introduced failures. If a pre-existing check blocks validation, verify it
against unchanged destination code and make only justified test maintenance;
never weaken a test merely to obtain a pass. Report environmental limitations
separately and use permitted execution or remote CI where appropriate.

## Publish and monitor

Follow the repository workflow: commit completed changes, push, and create or
update a PR marked ready for review. Include:

- Exact review window and a source-PR disposition table, including exclusions.
- Practical changes and any destination-specific adaptations.
- Source PR/issue links, without auto-closing issues awaiting physical confirmation.
- Actual validation results, affected devices and concise manual test steps.
- Separate statuses for host/browser checks, firmware builds and physical testing.

Use `gh pr checks` for destination CI status. Address actionable feedback and
failures within this sync's scope, validate fixes, and commit/push each completed
update. Resolve only review threads actually addressed.

When repository/user instructions authorize continued monitoring and the app
supports it, reuse or create a monitor for this destination PR and its build runs.
Keep it quiet for unchanged running/queued work and notify on meaningful feedback,
failure, completion, or required user action. Stop monitoring when the PR closes.
Do not promise background monitoring unless it was successfully configured.

Long-running builds can continue under that monitor after the initial handoff;
identify pending targets/runs explicitly rather than reporting them as passed.
This sync does not itself authorize device flashing, merging, issue closure, or
publishing a release. Follow any separate explicit authorization from the user.

Finish with a concise count of reviewed/ported/excluded changes, the destination
PR link, confirmed checks, pending builds if any, and remaining device testing.
