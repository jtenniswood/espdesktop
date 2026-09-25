---
name: local-build
description: Build and open an isolated Hermes Experimental macOS app from the PR associated with the current chat, with an explicit origin/main rebase option for testing. Use for Hermes PR test builds, not releases or merging PRs into main.
---

# Local build: Hermes Experimental

Produce a working macOS test app for the PR associated with the current chat in `jtenniswood/hermes-agent`. The deliverable is an open, visibly verified **Hermes Experimental** app, not merely a successful compile. Explain results in approachable language.

## Scope and source of truth

- Read the repository's root `AGENTS.md` and the scoped desktop guides before changing code. Identify the PR explicitly linked, named, or otherwise associated with the current chat, then verify its live head/base, merge status, and relevant CI state. Check the checkout, remotes, fork parent, dirty worktrees, and branch heads; never rely on a previous run's PR list or paths.
- Build from that associated PR's head by default. Do not substitute fork `main`, upstream `main`, or a stack of unrelated open PRs as the source. Include prerequisite PRs only when the target PR depends on them or the user asks to test a stack.
- If the chat does not make the target PR clear, or the desired base is unclear, ask the user whether to build the associated PR as it stands or rebase it onto `origin/main` for the test. Do not guess. When the user explicitly requests a rebase/main-based test, use the freshly fetched `origin/main` as the base and layer the target PR on top; preserve the original PR branch and report the exact base and PR SHAs used.
- When separately asked to sync the fork, merge or fast-forward upstream `NousResearch/hermes-agent` into the fork's `main` without discarding fork-only commits. Check the exact remote head before a non-force push. Do not reset or force-push main. If the requested sync cannot be done safely, stop before changing the remote and explain why.
- Keep the user's main checkout and standard installed Hermes app untouched. Create or reuse a separate worktree and an integration branch without a `codex/` prefix, such as `experimental/local-build-<date>`. Commit and push integration updates according to the repository instructions. Do not create a PR, merge original PRs into main, close PRs, or schedule monitoring unless separately requested.
- Treat an unspecified “update branch” as updating the Experimental integration branch. Do not rewrite or push the original PR branches unless the user clearly asks for that; identify any PR-specific fix that remains integration-only.

## Integrate and test the target PR

1. Record a source snapshot for the target PR: its live head/base SHAs, merge status, and relevant CI state. If the user requested a rebase/main-based test, also record the freshly fetched `origin/main` SHA. Inspect ancestry and overlapping changes before integrating any explicitly requested prerequisite PRs.
2. Start from the target PR's declared base, or the requested `origin/main` base, then apply the target PR head while preserving contributor authorship. Resolve conflicts to retain both base behavior and the PR's intent. Do not silently drop a PR change to make a merge pass. Keep the original PR branch unchanged; make integration-only fixes on the separate Experimental branch and identify them as such.
3. If the user asks to test a PR stack, inspect ancestry, overlapping changes, and stable patch identity before choosing dependency order; numeric PR order can duplicate or undo work. Include only the requested/required PRs.
4. Run focused tests for the target PR's affected behavior, relevant typechecks/lint, and a build or runtime check where the change warrants it. Fix discovered integration defects with focused regression coverage and commit the fix. Use `scripts/run_tests.sh` for Python tests; use the desktop's declared npm scripts/Vitest for desktop code. Distinguish a pre-existing or host-only failure by checking the unchanged base or the exact failing command before attributing it to the PR.
5. Re-read the target PR head before packaging. If it moved during integration, incorporate the new commits and repeat affected checks. Freeze the tested SHAs for the build; disclose later base or PR movement instead of chasing a moving target indefinitely.

## Build without replacing Hermes

- Name the app **Hermes Experimental** in the bundle and macOS UI. Use a distinct bundle ID (for example `com.nousresearch.hermes.experimental`), executable, app-data directory, Hermes home, and URL scheme. Ensure this app cannot register or take over the standard `hermes://` handler. Keep any test-only safeguard on the integration branch, not fork main.
- Use the repository's desktop build and packaging commands. If native compilation fails because this Mac selects an incompatible SDK, verify an installed compatible SDK and set `SDKROOT` for tests/build; do not change app source to conceal a toolchain fault. Check that the selected backend Python can import required dependencies, including `yaml`, before launching.
- Package a real `.app`; keep the previous Experimental bundle until the replacement is verified. A temporary unsigned bundle is acceptable for local testing; do not install it into `/Applications`, sign/notarize it, or publish a release unless requested.
- Replace only the previous Hermes Experimental process. Open the new app and verify the running process path, embedded build stamp, bundle ID/name, actual desktop window, and a usable backend connection or clearly explain why one is unavailable. Confirm the standard app still owns `hermes://` and that its data was not reused.

## Handoff

Give the user the clickable local app path and integration branch/commit. Summarize which PR heads were included, per-PR tests and any full-suite or CI gaps, fixes made, and whether the app is running. State if upstream advanced after the frozen snapshot. Never describe a green build or a “Gateway ready” label alone as proof of untested interactions.
