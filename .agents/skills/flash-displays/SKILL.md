---
name: flash-displays
description: Flash and test the EspDesktop S3 by default or the 7-inch P4 V3 when named, using the active worktree and pinned ESPHome. Use for /flash-displays or display firmware upload requests.
---

# Flash Displays

## Testing scope

Use the requested development display in the active repository worktree.

| Display | OTA address | Configuration directory |
| --- | --- | --- |
| 4-inch S3 (4848S040) | `192.168.6.100` | `devices/guition-esp32-s3-4848s040` |
| 7-inch P4 V3 (JC1060P470) | `192.168.6.107` | `devices/guition-esp32-p4-jc1060p470-v3` |

- `/flash-displays` with no target, `all`, or `all displays` means the S3 only. State that scope before starting.
- Explicit requests for the 7-inch, 7inch, or 7-inch V3 select the 7-inch P4 V3. Flash both when the user explicitly names both. If the user specifies another model or revision, explain which displays this skill supports.
- Pass the selected display's bare IP to ESPHome, even if the user supplies it as an HTTP URL. Ask if the user supplies a different address for a named display.
- Use USB only when explicitly requested and the connected device is identified as the S3. Do not guess the connected hardware from the port name alone.
- Editing this skill does not authorize a flash or device test.

## YAML Selection

Use `dev.yaml` by default. A user-named YAML must resolve inside the selected display's configuration directory. If the file is missing or belongs to another display, stop and explain the issue.

## Secrets File

The development YAML requires a local `secrets.yaml` containing `wifi_ssid` and `wifi_password`. Always use this existing local file as the only secrets source:

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

For each selected display:

1. Confirm the source exists with `test -f "$SECRETS_SOURCE"`. If it is missing, stop and tell the user; do not create or guess secret values.
2. Run the following from the selected display's config directory. This creates the ignored local symlink only when `secrets.yaml` is absent, and verifies that any existing file or symlink resolves to the required source:

   ```bash
   if [ ! -e secrets.yaml ] && [ ! -L secrets.yaml ]; then
     ln -s "$SECRETS_SOURCE" secrets.yaml
   fi
   test "$(realpath secrets.yaml)" = "$(realpath "$SECRETS_SOURCE")"
   ```

3. If verification fails, report the conflicting `secrets.yaml` and leave it in place.

Never display the secrets file, include its contents in command output, or add it to Git. The per-device `.gitignore` files exclude `secrets.yaml`.

## Workflow

1. Resolve the active repository root with `git rev-parse --show-toplevel` and check `git status --short --branch`. Flash the selected worktree and branch; do not switch branches or pull as part of flashing. Preserve unrelated local changes and disclose when the flash uses a dirty checkout.
2. Confirm the selected display or displays and resolve each YAML as described above.
3. Prepare and verify each selected display's secrets link.
4. For OTA, check each selected address with `ping -c 2 -W 1000 <address>`. Before flashing the 7-inch, read `http://192.168.6.107/espdesktop/version.json` and require `device_slug` to be `guition-esp32-p4-jc1060p470-v3`. If it is unavailable or identifies a different profile, pause the 7-inch flash and report the result.
5. For explicitly requested USB, list `/dev/cu.*` ports. Prefer `/dev/cu.usbmodem201301`, or the sole obvious USB modem port, after confirming the connected display is the S3. Ask if its identity or port is unclear.
6. Run the project wrapper below. It requires the ESPHome version pinned by `.github/esphome.env` and builds from the active local repository checkout.
7. After each successful OTA upload, ping that display again and verify its profile at `/espdesktop/version.json`. If the display is still rebooting, retry once after a short delay. Report each display's outcome independently.
8. Flashing alone requires no commit or push. Follow the repository contribution workflow if source files or this skill are intentionally changed.

## Commands

Run each command from the active worktree's repository root. Use only the commands for the requested displays and connection method.

```bash
# S3 over OTA
python3 scripts/local_esphome.py devices/guition-esp32-s3-4848s040/dev.yaml run --device 192.168.6.100 --no-logs

# 7-inch P4 V3 over OTA
python3 scripts/local_esphome.py devices/guition-esp32-p4-jc1060p470-v3/dev.yaml run --device 192.168.6.107 --no-logs

# S3 over USB, only when explicitly requested and identified as S3
python3 scripts/local_esphome.py devices/guition-esp32-s3-4848s040/dev.yaml run --device /dev/cu.usbmodem201301 --no-logs
```

## Reporting

Say which display is compiling or uploading. Mention ESPHome warnings only when they affect the result. Report whether each upload succeeded and the display responded after reboot, or give the blocking error. Distinguish these checks from user-confirmed screen and control testing.
