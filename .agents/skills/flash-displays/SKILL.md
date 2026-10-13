---
name: flash-displays
description: Flash and test only the EspDesktop S3 at 192.168.6.100 using the active worktree and pinned ESPHome. Use for /flash-displays or display firmware upload requests; other displays are excluded from this testing workflow.
---

# Flash Displays

## Testing scope

Only flash or test the 4-inch S3 (`4848S040`) at `192.168.6.100` in this workflow. Use `devices/guition-esp32-s3-4848s040` in the active repository worktree.

- `/flash-displays` with no target, `all`, or `all displays` means the S3 only. State that scope before starting.
- Do not ping, connect to, flash, or otherwise test the other displays, including over USB. A request naming another display does not override this restriction; explain that this skill is limited to the S3. A broader workflow requires the user to explicitly change this testing restriction first.
- OTA uses `192.168.6.100`; accept `http://192.168.6.100` as a reference to that same device and pass the bare IP to ESPHome. Do not substitute another OTA target.
- Use USB only when explicitly requested and the connected device is identified as the S3. Do not guess the connected hardware from the port name alone.
- Editing this skill does not authorize a flash or device test.

## YAML Selection

Use `dev.yaml` by default. Resolve another user-named YAML inside the S3 configuration directory. A repo-relative path must resolve inside `devices/guition-esp32-s3-4848s040` in the active worktree. If the file is missing or belongs to another display, stop and explain the issue rather than guessing.

## Secrets File

The S3 development YAML requires a local `secrets.yaml` containing `wifi_ssid` and `wifi_password`. Always use this existing local file as the only secrets source:

```text
${ESPDESKTOP_SECRETS:-<main-checkout>/secrets.yaml}
```

Resolve the active and main checkout paths dynamically before using secrets or
device configs. The `ESPDESKTOP_SECRETS` override is optional:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMON_GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
MAIN_CHECKOUT="$(dirname "$COMMON_GIT_DIR")"
SECRETS_SOURCE="${ESPDESKTOP_SECRETS:-$MAIN_CHECKOUT/secrets.yaml}"
```

Before flashing the S3:

1. Confirm the source exists with `test -f "$SECRETS_SOURCE"`. If it is missing, stop and tell the user; do not create or guess secret values.
2. Run the following from the S3's config directory. This creates the ignored local symlink only when `secrets.yaml` is absent, and verifies that any existing file or symlink resolves to the required source:

   ```bash
   if [ ! -e secrets.yaml ] && [ ! -L secrets.yaml ]; then
     ln -s "$SECRETS_SOURCE" secrets.yaml
   fi
   test "$(realpath secrets.yaml)" = "$(realpath "$SECRETS_SOURCE")"
   ```

3. If verification fails, stop and explain that the S3 already has a different `secrets.yaml`; do not replace it without the user's approval.

Never display the secrets file, include its contents in command output, or add it to Git. The per-device `.gitignore` files exclude `secrets.yaml`.

## Workflow

1. Resolve the active repository root with `git rev-parse --show-toplevel` and check `git status --short --branch`. Flash the selected worktree and branch; do not switch branches or pull as part of flashing. Preserve unrelated local changes and disclose when the flash uses a dirty checkout.
2. Confirm the S3-only scope and resolve the YAML as described above.
3. Prepare and verify the S3 secrets link. Honor a secrets path already supplied by the user (via `ESPDESKTOP_SECRETS`); never print or commit secrets.
4. For OTA, check only `192.168.6.100` with `ping -c 2 -W 1000 192.168.6.100`.
5. For explicitly requested USB, list `/dev/cu.*` ports. Prefer `/dev/cu.usbmodem201301`, or the sole obvious USB modem port, after confirming the connected display is the S3. Ask if its identity or port is unclear.
6. Run the project wrapper below. It requires the ESPHome version pinned by `.github/esphome.env` and builds from the active local repository checkout.
7. After OTA, ping the S3 again. If reboot causes a failure, retry once after a short delay. Report upload failures without moving on to another display.
8. Flashing alone requires no commit or push. Follow the repository contribution workflow if source files or this skill are intentionally changed.

## Commands

Run from the S3 config directory in the active worktree:

```bash
cd "$REPO_ROOT/devices/guition-esp32-s3-4848s040"
# S3 over OTA
python3 ../../scripts/local_esphome.py dev.yaml run --device 192.168.6.100 --no-logs

# S3 over USB, only when explicitly requested and identified as S3
python3 ../../scripts/local_esphome.py dev.yaml run --device /dev/cu.usbmodem201301 --no-logs
```

## Reporting

Say when the S3 is compiling or uploading. Mention ESPHome warnings only when they affect the result. Report whether the S3 uploaded successfully and responded after reboot, or give the blocking error. Distinguish these checks from user-confirmed screen and control testing.
