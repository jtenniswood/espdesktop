---
name: merge
description: >-
  Prepare and merge a specific EspDesktop pull request by addressing remaining
  review feedback, resolving conflicts with main, and merging only when required
  reviews and checks are clear. Use when the user says "/merge" or asks to get a
  pull request ready and merge it.
---

# /merge

## Goal

Take one identified pull request through the repository's final review and
conflict-resolution workflows, then merge it when GitHub reports that it is
ready. Invoking this skill authorizes the merge attempt for that pull request;
it does not authorize bypassing protections, merging unrelated work, closing
issues, or claiming that physical device testing occurred.

## Workflow

### 1. Identify One Pull Request

Use the PR number or URL supplied by the user or the single PR clearly
identified by the current chat. If there is not exactly one PR with confidence,
stop and ask for its number or URL. Do not select one by recency, branch, or the
open PR list.

Record the PR's URL, title, base and head branches, draft state, review decision,
merge state, and checks. Keep the same PR number through every stage below.

### 2. Clear Review Feedback

Read and follow [the `pr-review` skill](../pr-review/SKILL.md) completely for the
identified PR. Address and push all actionable unresolved feedback and resolve
only the threads that were actually addressed.

Do not continue toward merge if actionable feedback remains, a requested change
is intentionally left open, or the review workflow cannot safely complete.
Report what blocks the merge instead.

### 3. Update the Branch and Resolve Conflicts

After review feedback is clear, read and follow [the `resolve-pr-conflicts`
skill](../resolve-pr-conflicts/SKILL.md) completely for the same PR. Bring the
latest base branch into the PR branch and resolve any conflicts, preserving both
the PR's intent and newer base-branch changes. Push the result.

The nested skill normally leaves a PR open; for this `/merge` workflow, continue
to the readiness gate below because the user explicitly requested a merge.

If the source branch cannot be updated, the conflict resolution is uncertain,
or a replacement PR would be required, stop without merging and explain the
next action needed.

### 4. Recheck Merge Readiness

After every review fix, conflict resolution, base-branch update, and other push
is complete, refresh GitHub state and record the current head as the candidate
head SHA. Wait for checks triggered by that exact commit to finish. Before
merging, require all of the following for the candidate head:

- the PR is open and not a draft;
- GitHub reports it mergeable with no conflicts;
- no actionable unresolved review threads or change requests remain;
- all required reviews and required status checks have passed;
- the user has confirmed testing that still applies to the candidate head;
- branch protection does not report another unmet requirement.

Run any focused local check required by the two nested skills. Do not treat a
local build as physical device testing, and do not waive a required check
because a similar local command passed.

Keep prior test confirmation when a branch update leaves the tested behavior
unchanged. Compare the tested revision with the candidate head, including changes
brought in from the base branch. Consider the code, configuration, and build inputs
that affect the tested behavior. A documentation-only update can carry the
confirmation forward. Ask for a focused retest if the update changes the tested
behavior or you cannot establish that the earlier test still applies. If the user
has yet to confirm testing, prepare the PR as far as possible and ask them to test
it before merging.

Recheck GitHub readiness and required checks after every change to the head,
including when the earlier test confirmation still applies.

If GitHub is still calculating mergeability, refresh briefly. If checks are
pending, wait for them rather than enabling auto-merge. If any gate fails, leave
the PR open and report the exact blocker with links where possible. Never use an
administrator override or otherwise bypass branch protection.

### 5. Merge

Refresh the PR once more and compare its current head SHA with the candidate head
recorded and validated in step 4. If they differ, do not merge; return to step 4
and validate the new head. Merge the identified PR using the repository's
established merge method, preferring squash when no clear convention is
available. Bind the merge to the unchanged candidate head SHA so it fails safely
if another commit arrives. Prefer GitHub connector tools when available and pass
their expected-head equivalent; otherwise use
`gh pr merge <number> --squash --match-head-commit <candidate-head-sha>` (or the
established method's equivalent).

Do not delete the source branch or close linked issues as part of this skill.
After the command returns, refresh the PR. If GitHub placed it in a merge queue,
monitor the queued PR at reasonable intervals until GitHub reports it merged or
reports that it left the queue without merging. Do not treat queue admission as
success, and do not stop merely because the PR remains open while queued. If it
leaves the queue without merging, report the rejection or failed requirement
and leave the PR open. Otherwise, verify that GitHub reports the PR as merged. A
successful command or queue admission alone is not sufficient confirmation.

## Final Update

Keep the result concise and include:

- the PR number, title, and URL;
- review feedback addressed or confirmation that none remained;
- conflict/base-branch update performed;
- final checks and review state;
- the verified merge result, or the precise blocker if it stayed open.
