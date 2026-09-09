#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPOSITORY_DIR="$(cd "${PROJECT_DIR}/../.." && pwd)"
ARCHIVE="${1:?Pass the notarized Companion ZIP}"
RELEASE_TAG="${2:?Pass the release tag}"
OUTPUT_DIR="${3:?Pass the feed output directory}"
: "${SPARKLE_PRIVATE_KEY:?Set the Sparkle Ed25519 private signing key}"
if [[ ! "${RELEASE_TAG}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$ ]]; then
    echo "Invalid Companion release tag" >&2
    exit 2
fi
VERSION="${RELEASE_TAG#v}"
if [[ "$(basename "${ARCHIVE}")" != "EspDesktop-${VERSION}.zip" ]]; then
    echo "Companion ZIP does not match the release tag" >&2
    exit 2
fi
PROTOCOL_VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["protocol"]["version"])' "${REPOSITORY_DIR}/product/v2/companion_capabilities.json")"
FEED_NAME="companion-appcast-v${PROTOCOL_VERSION}.xml"
SPARKLE_TOOLS="${PROJECT_DIR}/.build/artifacts/sparkle/Sparkle/bin"
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "${STAGING_DIR}"' EXIT
mkdir -p "${OUTPUT_DIR}"
cp "${ARCHIVE}" "${STAGING_DIR}/"
cat > "${STAGING_DIR}/EspDesktop-${VERSION}.txt" <<NOTES
EspDesktop ${VERSION}
This update uses Companion protocol ${PROTOCOL_VERSION}. Review the release notes for display firmware requirements:
https://github.com/jtenniswood/espdesktop/releases/tag/${RELEASE_TAG}
NOTES
# The secret is supplied over stdin, never in arguments or logs.
printf '%s' "${SPARKLE_PRIVATE_KEY}" | "${SPARKLE_TOOLS}/generate_appcast" \
    --ed-key-file - --maximum-deltas 0 --embed-release-notes \
    --download-url-prefix "https://github.com/jtenniswood/espdesktop/releases/download/${RELEASE_TAG}/" \
    -o "${OUTPUT_DIR}/${FEED_NAME}" "${STAGING_DIR}"
printf '%s' "${SPARKLE_PRIVATE_KEY}" | "${SPARKLE_TOOLS}/sign_update" \
    --ed-key-file - --verify "${OUTPUT_DIR}/${FEED_NAME}"
echo "Built and verified signed Companion feed: ${FEED_NAME}"
