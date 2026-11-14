#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="EspDesktop.app"
APP_PATH="${1:-${PROJECT_DIR}/.build/standalone/${APP_NAME}}"
VOLUME_NAME="${VOLUME_NAME:-EspDesktop}"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This script must run on macOS because it uses hdiutil." >&2
    exit 1
fi

if ! command -v dmgbuild >/dev/null 2>&1; then
    echo "Install the disk image tools from ${SCRIPT_DIR}/dmg-requirements.txt in a Python virtual environment." >&2
    exit 1
fi

if [[ ! -d "${APP_PATH}" ]]; then
    if [[ -n "${1:-}" ]]; then
        echo "EspDesktop app bundle not found: ${APP_PATH}" >&2
        exit 2
    fi
    echo "EspDesktop app bundle not found; building it first…"
    "${SCRIPT_DIR}/build_standalone.sh"
fi

APP_PATH="$(cd "$(dirname "${APP_PATH}")" && pwd)/$(basename "${APP_PATH}")"
APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP_PATH}/Contents/Info.plist")"
OUTPUT_DIR="${OUTPUT_DIR:-$(dirname "${APP_PATH}")}"
DMG_PATH="${DMG_PATH:-${OUTPUT_DIR}/EspDesktop-${APP_VERSION}.dmg}"

mkdir -p "${OUTPUT_DIR}"
rm -f "${DMG_PATH}"
echo "Building EspDesktop disk image with the drag-to-Applications layout…"
dmgbuild -s "${SCRIPT_DIR}/dmg-layout.py" \
    -D "app=${APP_PATH}" \
    -D "background=${SCRIPT_DIR}/install-background.tiff" \
    "${VOLUME_NAME}" "${DMG_PATH}"
hdiutil verify "${DMG_PATH}" >/dev/null
echo "Built and verified: ${DMG_PATH}"
