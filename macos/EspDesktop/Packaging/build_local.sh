#!/bin/bash
# Build local apps with a persistent certificate instead of an ad-hoc signature.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IDENTITY_FILE="${ESPDESKTOP_SIGNING_IDENTITY_FILE:-${HOME}/.config/espdesktop/signing-identity}"
INSTALLED_APP="${ESPDESKTOP_INSTALLED_APP:-/Applications/EspDesktop.app}"
IDENTITY="${CODE_SIGN_IDENTITY:-}"
if [[ -z "${IDENTITY}" && -f "${IDENTITY_FILE}" ]]; then
    IDENTITY="$(cat "${IDENTITY_FILE}")"
fi
if [[ ! "${IDENTITY}" =~ ^[[:xdigit:]]{40}$ ]]; then
    echo "Set CODE_SIGN_IDENTITY to the 40-character fingerprint of a certificate from: security find-identity -v -p codesigning" >&2
    echo "Use the same Developer ID Application identity as releases when testing release updates. Ad-hoc signatures cannot preserve Accessibility approval." >&2
    exit 2
fi
IDENTITY="$(printf '%s' "${IDENTITY}" | tr '[:lower:]' '[:upper:]')"
if ! security find-identity -v -p codesigning | grep -Fq " ${IDENTITY} "; then
    echo "The saved signing certificate and private key are unavailable. Install/unlock them in Keychain; refusing to fall back to ad-hoc signing." >&2
    exit 2
fi

# Check the new app against the identity macOS has already approved.
REQUIREMENT=""
if [[ -d "${INSTALLED_APP}" ]]; then
    REQUIREMENT="$(codesign -d -r- "${INSTALLED_APP}" 2>&1 | sed -n -E 's/^(# )?designated => //p')"
    if [[ -z "${REQUIREMENT}" ]]; then
        echo "Could not read the installed app identity; refusing an unchecked update." >&2
        exit 2
    fi
    if [[ "${REQUIREMENT}" == cdhash* ]]; then
        echo "Migrating from an ad-hoc build: approve Accessibility once after installing this certificate-signed build." >&2
        REQUIREMENT=""
    fi
fi
CODE_SIGN_IDENTITY="${IDENTITY}" ALLOW_ADHOC=0 "${SCRIPT_DIR}/build_standalone.sh"
APP="${OUTPUT_DIR:-${SCRIPT_DIR}/../.build/standalone}/EspDesktop.app"
if [[ -n "${REQUIREMENT}" ]]; then
    codesign --verify --strict -R "=${REQUIREMENT}" "${APP}" || {
        echo "Signing identity changed. Do not replace the installed app: Accessibility approval may be lost." >&2
        exit 2
    }
fi
# Share the selected certificate across worktrees, without storing private keys.
mkdir -p "$(dirname "${IDENTITY_FILE}")"
(umask 077; printf '%s\n' "${IDENTITY}" > "${IDENTITY_FILE}")
echo "Persistent signing verified. Install at ${INSTALLED_APP}; do not reset Accessibility between builds."
