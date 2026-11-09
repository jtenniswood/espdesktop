"""Public firmware release targets; development profiles remain independent."""

import json
from pathlib import Path

RELEASE_DEVICES = Path(__file__).resolve().parents[1] / "product/release_devices.json"


def load_release_devices(path=RELEASE_DEVICES):
    devices = json.loads(path.read_text(encoding="utf-8"))["devices"]
    if (not isinstance(devices, list) or not devices
            or any(not isinstance(slug, str) or not slug for slug in devices)
            or len(devices) != len(set(devices))):
        raise ValueError("release devices must be a non-empty list of unique device slugs")
    return devices
