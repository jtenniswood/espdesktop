---
name: flash-displays
description: Build and flash EspDesktop display firmware from the current repository worktree to the primary 4-inch S3 test display at 192.168.6.100. Use when asked to flash, reflash, update, upload, or test the current branch on the primary display over OTA or explicitly requested USB.
---

# Flash Displays

## Scope

Flash firmware from the current EspDesktop worktree to the primary test display only:

| Display | ESPHome config directory | Default OTA target |
|---|---|---|
| Primary 4-inch S3 (`4848S040`) | `devices/guition-esp32-s3-4848s040` | `192.168.6.100` |

An invocation without a display or target means this device over OTA. If the user requests another display, stop and explain that this repo skill is intentionally limited to the primary tester at `192.168.6.100`. Use USB only when the user explicitly asks for it.

Use `dev.yaml` unless the user names another YAML file. Resolve a bare filename inside the config directory and a repo-relative path from the repository root. Stop rather than guessing if the file is missing or outside this worktree.

## Current Worktree

Always build from the worktree in which the skill is invoked:

```bash
ESPDESKTOP_REPO_ROOT="$(git rev-parse --show-toplevel)"
git status --short --branch
git rev-parse --short HEAD
```

Do not switch to `main`, pull, merge, rebase, or otherwise change the checked-out branch before flashing. This skill exists to test feature branches without changing `main`.

If the worktree has changes, do not discard or commit them. Tell the user that the flash will include the current uncommitted files and continue only when that matches their request.

Resolve the config and project wrapper beneath `ESPDESKTOP_REPO_ROOT`. Do not use an EspControl checkout, a fixed `/home/...` path, or a different worktree.

## Secrets

The development YAML needs an ignored `secrets.yaml`. Never read, display, modify, copy, or commit its contents.

From `devices/guition-esp32-s3-4848s040`:

1. If `secrets.yaml` already exists and resolves to a file, use it without inspecting it.
2. Otherwise use `ESPDESKTOP_SECRETS_FILE` when supplied; if it is unset, use `${ESPDESKTOP_REPO_ROOT}/secrets.yaml`.
3. Verify the source exists. If it does not, stop and ask for the existing secrets file path. Never create or guess credentials.
4. Create only an ignored symlink and verify it:

   ```bash
   ESPDESKTOP_SECRETS_SOURCE="${ESPDESKTOP_SECRETS_FILE:-${ESPDESKTOP_REPO_ROOT}/secrets.yaml}"
   test -f "$ESPDESKTOP_SECRETS_SOURCE"
   ln -s "$ESPDESKTOP_SECRETS_SOURCE" secrets.yaml
   test "$(realpath secrets.yaml)" = "$(realpath "$ESPDESKTOP_SECRETS_SOURCE")"
   git check-ignore -q secrets.yaml
   ```

If another file or symlink already occupies `secrets.yaml`, do not replace it without the user's approval.

## Workflow

1. Report the current branch, short commit, YAML, and OTA or USB target before starting.
2. Confirm the S3 config directory, selected YAML, `scripts/local_esphome.py`, and ignored secrets setup exist in the current worktree.
3. For OTA, check reachability with `ping -c 2 -W 1000 192.168.6.100`. A failed preflight ping is a blocker unless the user explicitly asks to attempt OTA anyway.
4. For USB, list `/dev/cu.*`. Prefer `/dev/cu.usbmodem201301`; if absent, use the only obvious `/dev/cu.usbmodem*` port. Ask when no single port is clear.
5. Run the project wrapper from the S3 config directory:

   ```bash
   cd "$ESPDESKTOP_REPO_ROOT/devices/guition-esp32-s3-4848s040"
   python3 ../../scripts/local_esphome.py dev.yaml run --device 192.168.6.100 --no-logs
   ```

   Substitute the selected in-repo YAML when explicitly requested. For an explicitly requested USB flash, replace the IP with the selected `/dev/cu.usbmodem*` port.
6. After `INFO OTA successful`, allow the display to reboot, then ping it. Retry once after a short delay before reporting a failure.
7. Do not claim hands-on feature behavior from a successful compile or OTA upload. Report compilation, upload, post-reboot reachability, and physical testing as separate evidence.

## Reporting

Keep updates concise. Say which branch and commit are compiling or uploading to `192.168.6.100`. Mention warnings only when they affect the result. Clearly identify any blocker. Do not commit or push merely because firmware was flashed.
