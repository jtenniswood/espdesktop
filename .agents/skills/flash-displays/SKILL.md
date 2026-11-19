---
name: flash-displays
description: Flash and test the 4-inch S3 at 192.168.6.100 or the 7-inch V3 at 192.168.6.107 using the active EspDesktop worktree and pinned ESPHome. Use for /flash-displays or firmware upload requests for these devices.
---

# Flash Displays

## Select the display

| Display | Network address | Device profile |
| --- | --- | --- |
| 4-inch S3 (Guition 4848S040) | `192.168.6.100` | `guition-esp32-s3-4848s040` |
| 7-inch V3 (Guition JC1060P470, ESP32-P4 v3.1–v3.99) | `192.168.6.107` | `guition-esp32-p4-jc1060p470-v3` |

- A bare `/flash-displays` defaults to the S3. An explicit `all` or `all displays` selects both targets. Use only the selected targets and state them before starting.
- Accept the IP or its `http://` URL as the same device. Pass the bare IP to ESPHome for OTA. Use OTA by default and honor the requested transport when specified.
- Use USB for the S3 only when explicitly requested. For a requested V3 firmware trial, honor the user's standing approval for USB on this particular display. Identify the board before writing. A USB port name alone is insufficient.
- Editing this skill does not initiate a flash or device test.

## Shared preflight

1. Resolve `REPO_ROOT` with `git rev-parse --show-toplevel` and check `git status --short --branch`. Build the selected revision from this worktree. Disclose local changes if they are included in the build.
2. Use the ESPHome version pinned by `.github/esphome.env`. Match the firmware target and revision to the selected device before uploading. If a named YAML, firmware artifact, or USB identity is unclear, resolve it before writing.
3. For OTA, check reachability at the selected address before and after the upload. Allow time for reboot and retry the reachability check once if needed. On an upload or verification failure, report the error and stop before writing to another display.

## 4-inch S3

Use `devices/guition-esp32-s3-4848s040/dev.yaml` by default. Resolve any user-named YAML inside that device directory.

The development configuration requires an existing local `secrets.yaml` with `wifi_ssid` and `wifi_password`. Honor `ESPDESKTOP_SECRETS`; otherwise use the main checkout's `secrets.yaml`. In the device directory, link it if absent and verify any existing file or symlink resolves to the same source. Stop if the source is missing or the link would replace a different file. Keep credentials out of output and Git.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMON_GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
MAIN_CHECKOUT="$(dirname "$COMMON_GIT_DIR")"
SECRETS_SOURCE="${ESPDESKTOP_SECRETS:-$MAIN_CHECKOUT/secrets.yaml}"

cd "$REPO_ROOT/devices/guition-esp32-s3-4848s040"
test -f "$SECRETS_SOURCE" || exit 1
if [ ! -e secrets.yaml ] && [ ! -L secrets.yaml ]; then
  ln -s "$SECRETS_SOURCE" secrets.yaml
fi
test "$(realpath secrets.yaml)" = "$(realpath "$SECRETS_SOURCE")" || exit 1
```

For OTA, run from the S3 device directory:

```bash
python3 ../../scripts/local_esphome.py dev.yaml run --device 192.168.6.100 --no-logs
```

For requested USB, confirm the attached board, using `/dev/cu.usbmodem201301` as a port hint, then run:

```bash
python3 ../../scripts/local_esphome.py dev.yaml run --device "$S3_USB_PORT" --no-logs
```

## 7-inch V3

Use `builds/guition-esp32-p4-jc1060p470-v3.factory.yaml` with the pinned ESPHome container, or the dedicated V3 firmware artifact built from the requested commit. Verify the artifact's source commit and V3 profile. Use the **application image** (`.ota.bin`) from that build, which embeds the matching browser editor. This build uses the device's saved Wi-Fi settings.

Before flashing, save a private copy of the response from `GET http://192.168.6.107/api/v1/config` with header `X-Panel-Config-Version: 2`. Record the pairing status from `/connectors/status`. Keep the saved configuration out of Git and user-facing logs.

### OTA

Send the verified application image through native ESPHome OTA to this V3:

```bash
esphome upload --device 192.168.6.107 --ota-platform esphome --file "$V3_APP_IMAGE"
```

### USB

Use `/dev/cu.usbmodem1101` as a port hint. Verify the USB chip is an ESP32-P4 production revision and matches the known V3's identity. Read the installed partition table and OTA metadata, and confirm the running application slot from those records or the boot log. Check the table against the matching factory image and the slot offsets and sizes in `common/device/partitions_16mb_card_images.csv`. Verify that the application image fits the selected slot. Stop if identity, partition layout, or active slot is uncertain.

Write only that application slot and verify the write hash. This preserves the bootloader, partition table, OTA metadata, Wi-Fi, pairing, and stored cards. Reserve the full factory image and flash erase for separately requested provisioning or recovery.

```bash
esptool --chip esp32p4 --port "$V3_USB_PORT" --after hard-reset \
  write-flash "$V3_ACTIVE_APP_OFFSET" "$V3_APP_IMAGE"
```

### Verify the V3

After reboot, verify the running firmware and live editor at `192.168.6.107`. Compare the downloaded configuration with the pre-flash copy. Confirm existing Mac Companion pairing and allow time for it to reconnect. For USB, keep the serial monitor open through the boot health check and check for unexpected restarts. Report saved layout, network, and pairing checks separately from visual or touchscreen testing.

## Reporting

Say when the selected display is compiling or uploading and report the verified result or blocking error. Mention ESPHome warnings when they affect the result. A flash alone requires no Git changes. Follow the repository contribution workflow when intentionally changing this skill or source files.
