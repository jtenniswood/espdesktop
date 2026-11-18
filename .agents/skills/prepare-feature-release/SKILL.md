---
name: prepare-feature-release
description: Check or prepare an EspDesktop feature, branch, or pull request for release. Review user-facing translations, docs, homepage and demo coverage, manual screenshots, upgrade compatibility, release notes, and test evidence. Use for feature readiness and follow-up edits before the separate release workflow.
---

# Prepare a Feature for Release

## Establish the scope

- Use the requested PR, branch, or commit range. If the user gives no target, use the active feature branch. If there is no identifiable feature, ask which one to review.
- Resolve the repository root with `git rev-parse --show-toplevel` and read its `AGENTS.md`. Review the feature diff against its base, including relevant local edits, linked issues, PR discussion, and check results where available. For a merged feature, use the original PR diff to understand the change and current main to see which follow-ups are still needed.
- Identify what people can do differently and where they do it: on the physical display, in the web editor or installer, in the Mac app, or through an integration. Use that scope to select the checks below.

## Choose the mode

- **Check readiness** when asked to check, audit, or review. Inspect the feature and run applicable verification. Return a checklist and proposed fixes without changing tracked files or the PR.
- **Prepare for release** when asked to prepare or fix. Make feature-related fixes in the existing feature worktree and PR, preserving other work. If the feature is already merged, use a separate worktree and follow-up PR from current main. Follow `AGENTS.md` for checks, commits, pushes, and ready-for-review PRs. Link the original PR and any relevant issue in a follow-up.
- Use the [release skill](../release/SKILL.md) for a separate request to cut or publish a release. Keep feature preparation within the PR workflow. Treat flashing and installing builds as separate work when requested.

## Check the feature

- **Translations.** Use the applicable guidance in the [translations skill](../translations/SKILL.md) for new or changed static text on the physical display, including loading states, errors, and confirmations. Apply any fixes within the feature's chosen worktree and PR. Verify translation keys and generated output, report any English fallbacks, and specify a non-English device check for text that could clip or wrap. For web or Mac UI text, follow the conventions for that surface.
- **Documentation.** Use the [docs-review skill](../docs-review/SKILL.md) to find missing or stale guidance. Prefer updating the relevant existing guide with where to start, prerequisites, steps, what success looks like, and any meaningful limits. Check affected setup, troubleshooting, navigation, and compatibility references. Update source files for generated content. See [docs discovery](../../../dev-docs/docs-discovery.md) for site checks and guide navigation.
- **Homepage and demo.** Review [the homepage](../../../docs/index.md) for features that give a new visitor a clear reason to use EspDesktop. Draft a short benefit and a link to the relevant guide when warranted. Check whether the interactive demo or existing homepage copy has become misleading. Verify claims against the supported hardware and release scope before using them in public copy.
- **Manual images.** List missing or stale screenshots and photos only where they help someone recognise a screen, follow a step, or understand a result. For each, name the guide and section, the device or app, steps to reach the right state, what to frame, a proposed filename under `docs/public/images/`, and alt text. Mark whether it is needed for accurate instructions or optional. The user captures the images. Keep published instructions usable while images are pending and avoid broken references. When supplied, add the images using the site's conventions and verify them in the docs preview.
- **Upgrade and compatibility.** Check affected existing layouts, settings, backups, and migration paths, using data from before the feature where useful. Verify any minimum firmware or Mac app version, integration requirement, device restriction, or preview flag before documenting it. Use the [compatibility contract](../../../dev-docs/compatibility-contract.md) and [public release device list](../../../product/release_devices.json). If availability depends on a particular release, record when the docs or homepage copy can go live.
- **Verification and release notes.** Use the [check matrix](../../../dev-docs/check-matrix.md) and the PR testing guidance from `scripts/pr_testing_guidance.py` to choose checks. For public docs changes, run `npm run docs:build` and review changed pages in preview when available. Record the tested revision and distinguish automated checks from physical testing. Give the user a short test with the build, device or app, steps, and expected result. Include an upgrade or recovery check when that path changes. Draft a user-facing release-note bullet describing the benefit and any action needed, and keep it with the feature's PR or readiness report for release handoff.

## Hand off the result

Summarise the target PR or revision, changes made or proposed, and verification results. For each remaining item, name who needs to act, what they need to do, and whether release depends on it. Include the shot list, hands-on test steps, and release-note draft when relevant. Call out checks that could not run and the reason. On repeat runs, carry forward evidence that still applies, recheck affected items after changes, and focus on what is still open.
