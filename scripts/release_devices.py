"""Firmware release targets and their public installer availability."""

import json
from pathlib import Path

RELEASE_DEVICES = Path(__file__).resolve().parents[1] / "product/release_devices.json"


def _validate_device_list(devices, field):
    if (not isinstance(devices, list)
            or any(not isinstance(slug, str) or not slug for slug in devices)
            or len(devices) != len(set(devices))):
        raise ValueError(f"{field} must be a list of unique device slugs")


def _load_device_lists(path):
    config = json.loads(path.read_text(encoding="utf-8"))
    public = config["devices"]
    artifact_only = config.get("artifactOnlyDevices", [])
    _validate_device_list(public, "devices")
    _validate_device_list(artifact_only, "artifactOnlyDevices")
    if not public:
        raise ValueError("devices must contain at least one public device")
    if set(public).intersection(artifact_only):
        raise ValueError("public and artifact-only release devices must be distinct")
    return public, artifact_only


def load_release_devices(path=RELEASE_DEVICES):
    """Return devices published through the website and web installer."""
    public, _ = _load_device_lists(path)
    return public


def load_firmware_release_devices(path=RELEASE_DEVICES):
    """Return all devices whose binaries are attached to GitHub releases."""
    public, artifact_only = _load_device_lists(path)
    return public + artifact_only
