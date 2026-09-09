#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPOSITORY_DIR="$(cd "${PROJECT_DIR}/../.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_DIR}/.build/standalone}"
APP_NAME="EspDesktop.app"
APP_DIR="${OUTPUT_DIR}/${APP_NAME}"
EXECUTABLE_NAME="EspDesktop"
VERSION="${MARKETING_VERSION:-1.0.0}"
BUILD_NUMBER="${CURRENT_PROJECT_VERSION:-1}"
PRODUCT_BUNDLE_IDENTIFIER="${PRODUCT_BUNDLE_IDENTIFIER:-io.espdesktop.app}"
ALLOW_ADHOC="${ALLOW_ADHOC:-0}"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This script must run on macOS because it uses SwiftPM and codesign." >&2
    exit 1
fi

if [[ "${ALLOW_ADHOC}" != "1" && -z "${CODE_SIGN_IDENTITY:-}" ]]; then
    echo "Set CODE_SIGN_IDENTITY to a Developer ID Application identity, or use ALLOW_ADHOC=1 for local verification only." >&2
    exit 2
fi

rm -rf "${APP_DIR}" "${OUTPUT_DIR}/AppIcon.iconset" "${OUTPUT_DIR}/generate_macos_icon"
mkdir -p "${APP_DIR}/Contents/MacOS" "${APP_DIR}/Contents/Resources"

echo "Building the standalone EspDesktop app…"
swift build \
    --package-path "${PROJECT_DIR}" \
    --configuration release \
    --product "${EXECUTABLE_NAME}" \
    -Xswiftc -warnings-as-errors

BUILD_BIN_PATH="$(swift build \
    --package-path "${PROJECT_DIR}" \
    --configuration release \
    --product "${EXECUTABLE_NAME}" \
    --show-bin-path)"
cp "${BUILD_BIN_PATH}/${EXECUTABLE_NAME}" "${APP_DIR}/Contents/MacOS/${EXECUTABLE_NAME}"
# SwiftPM resources must travel with the app, including the support button artwork.
cp -R "${BUILD_BIN_PATH}/EspDesktop_Companion.bundle" "${APP_DIR}/Contents/Resources/"
cp "${SCRIPT_DIR}/Info.plist" "${APP_DIR}/Contents/Info.plist"
cp "${SCRIPT_DIR}/PrivacyInfo.xcprivacy" "${APP_DIR}/Contents/Resources/PrivacyInfo.xcprivacy"

# Embed the pinned SwiftPM binary, preserving Sparkle's bundle symlinks.
SPARKLE_ROOT="${PROJECT_DIR}/.build/artifacts/sparkle/Sparkle"
SPARKLE_FRAMEWORK="${SPARKLE_ROOT}/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework"
mkdir -p "${APP_DIR}/Contents/Frameworks"
ditto "${SPARKLE_FRAMEWORK}" "${APP_DIR}/Contents/Frameworks/Sparkle.framework"
PROTOCOL_VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["protocol"]["version"])' "${REPOSITORY_DIR}/product/v2/companion_capabilities.json")"
plutil -replace SUFeedURL -string "https://github.com/jtenniswood/espdesktop/releases/latest/download/companion-appcast-v${PROTOCOL_VERSION}.xml" "${APP_DIR}/Contents/Info.plist"
plutil -replace SUPublicEDKey -string "$(cat "${SCRIPT_DIR}/sparkle-public-key.txt")" "${APP_DIR}/Contents/Info.plist"


ICONSET_DIR="${OUTPUT_DIR}/AppIcon.iconset"
ICON_GENERATOR="${OUTPUT_DIR}/generate_macos_icon"
CLANG_MODULE_CACHE_PATH="${OUTPUT_DIR}/clang-module-cache" swiftc \
    "${REPOSITORY_DIR}/scripts/generate_macos_icon.swift" \
    -o "${ICON_GENERATOR}"
CLANG_MODULE_CACHE_PATH="${OUTPUT_DIR}/clang-module-cache" "${ICON_GENERATOR}" \
    "${SCRIPT_DIR}/AppIcon.png" "${ICONSET_DIR}"
iconutil --convert icns --output "${APP_DIR}/Contents/Resources/AppIcon.icns" "${ICONSET_DIR}"

plutil -replace CFBundleIdentifier -string "${PRODUCT_BUNDLE_IDENTIFIER}" "${APP_DIR}/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "${VERSION}" "${APP_DIR}/Contents/Info.plist"
plutil -replace CFBundleVersion -string "${BUILD_NUMBER}" "${APP_DIR}/Contents/Info.plist"
plutil -lint "${APP_DIR}/Contents/Info.plist"
plutil -lint "${APP_DIR}/Contents/Resources/PrivacyInfo.xcprivacy"

SIGNING_IDENTITY="${CODE_SIGN_IDENTITY:--}"
SPARKLE_EMBEDDED="${APP_DIR}/Contents/Frameworks/Sparkle.framework/Versions/B"
# Sign nested executable code from the inside out before signing the outer app.
for component in \
    "${SPARKLE_EMBEDDED}/Autoupdate" \
    "${SPARKLE_EMBEDDED}/XPCServices/Downloader.xpc" \
    "${SPARKLE_EMBEDDED}/XPCServices/Installer.xpc" \
    "${SPARKLE_EMBEDDED}/Updater.app" \
    "${APP_DIR}/Contents/Frameworks/Sparkle.framework"; do
    codesign --force --options runtime --sign "${SIGNING_IDENTITY}" "${component}"
done
ENTITLEMENTS="${SCRIPT_DIR}/EspDesktop.entitlements"
if [[ "${SIGNING_IDENTITY}" == "-" ]]; then
    ENTITLEMENTS="${OUTPUT_DIR}/adhoc.entitlements"
    cp "${SCRIPT_DIR}/EspDesktop.entitlements" "${ENTITLEMENTS}"
    /usr/libexec/PlistBuddy -c "Add :com.apple.security.cs.disable-library-validation bool true" "${ENTITLEMENTS}"
fi

codesign --force --options runtime \
    --entitlements "${ENTITLEMENTS}" \
    --sign "${SIGNING_IDENTITY}" "${APP_DIR}"

if codesign --display --entitlements - "${APP_DIR}" 2>&1 | grep -q 'com.apple.security.app-sandbox'; then
    echo "The standalone bundle must not contain the App Sandbox entitlement." >&2
    exit 1
fi

codesign --verify --deep --strict "${APP_DIR}"
echo "Built and verified: ${APP_DIR}"
