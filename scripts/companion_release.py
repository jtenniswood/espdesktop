#!/usr/bin/env python3
"""Record and verify a source-pinned firmware/Companion release combination."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compatibility(root=ROOT):
    contract = json.loads((root / 'product/v2/companion_capabilities.json').read_text())
    devices = {path.stem: json.loads(path.read_text()) for path in (root / 'product/v2/devices').glob('*.json')}
    return {
        'schemaVersion': 1,
        'protocolVersion': contract['protocol']['version'],
        'capabilityVersion': contract['version'],
        'contractSha256': digest(root / 'product/v2/companion_capabilities.json'),
        'supportedDevices': sorted(slug for slug, device in devices.items() if device.get('config', {}).get('capabilities', {}).get('companion')),
        'supportedCombinations': [{'firmwareProtocol': contract['protocol']['version'],
                                   'companionProtocol': contract['protocol']['version']}],
        'releasePolicy': 'coordinated',
        'savedPanelConfigVersion': json.loads((root / 'product/release_contract.json').read_text())['panelConfigDocumentVersion'],
        'wireFixturesSha256': digest(root / 'compatibility/fixtures/companion_protocol_v4.json'),
    }


def esp32_application_elf_sha256(path):
    # ESP-IDF places esp_app_desc_t at the start of the first image segment:
    # 24-byte ESP32 image header, 8-byte segment header, then the descriptor.
    # Its SHA-256 field follows 144 bytes of descriptor metadata.
    with path.open("rb") as image:
        header = image.read(208)
    if (len(header) != 208 or header[0] != 0xE9 or not header[1]
            or int.from_bytes(header[28:32], "little") < 176
            or int.from_bytes(header[32:36], "little") != 0xABCD5432
            or not any(header[176:208])):
        raise ValueError(f"Invalid ESP32 application descriptor in {path.name}")
    return header[176:208].hex()


def manifest(firmware_dir, companion_dir, source_revision, version, root=ROOT):
    if not re.fullmatch(r'[0-9a-f]{40}', source_revision):
        raise ValueError('A full source revision is required')
    if not re.fullmatch(r'v?\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?', version):
        raise ValueError('A semantic release version is required')
    contract = compatibility(root)
    provenance_bytes = (firmware_dir / 'release-manifest.json').read_bytes()
    provenance = json.loads(provenance_bytes)
    if provenance.get('sourceRevision') != source_revision or provenance.get('releaseVersion') != version:
        raise ValueError('Firmware release provenance does not match the Companion release')
    artifacts = {}
    for slug in contract['supportedDevices']:
        for suffix in ('.ota.bin', '.factory.bin'):
            path = firmware_dir / (slug + suffix)
            artifacts[path.name] = {'sha256': digest(path), 'bytes': path.stat().st_size}
            if suffix == '.ota.bin':
                artifacts[path.name]['appElfSha256'] = esp32_application_elf_sha256(path)
    for suffix in ('.zip', '.dmg'):
        matches = list(companion_dir.glob('*' + suffix))
        if len(matches) != 1:
            raise ValueError(f'Expected exactly one Companion {suffix} artifact')
        path = matches[0]
        artifacts[path.name] = {'sha256': digest(path), 'bytes': path.stat().st_size}
    return {**contract, 'sourceRevision': source_revision, 'releaseVersion': version,
            'firmwareManifestSha256': hashlib.sha256(provenance_bytes).hexdigest(),
            'artifacts': artifacts,
            'validation': {'automated': 'release workflow checks', 'physicalDeviceTesting': 'not asserted'}}


def verify(path, firmware_dir, companion_dir, source_revision, version, root=ROOT, *, tested_fingerprint=None):
    if tested_fingerprint is not None and digest(path) != tested_fingerprint:
        raise ValueError('Candidate fingerprint does not match the confirmed build')
    expected = manifest(firmware_dir, companion_dir, source_revision, version, root)
    if json.loads(path.read_text()) != expected:
        raise ValueError('Companion compatibility manifest or release artifacts do not match')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['create', 'verify'])
    parser.add_argument('--firmware-dir', type=Path, required=True)
    parser.add_argument('--companion-dir', type=Path, required=True)
    parser.add_argument('--source-revision', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--tested-fingerprint', help='SHA-256 of the confirmed candidate manifest')
    args = parser.parse_args()
    if args.command == 'create':
        if args.tested_fingerprint is not None:
            parser.error('--tested-fingerprint requires verify')
        args.out.write_text(json.dumps(manifest(args.firmware_dir, args.companion_dir, args.source_revision, args.version), indent=2) + '\n')
    else:
        verify(args.out, args.firmware_dir, args.companion_dir, args.source_revision, args.version,
               tested_fingerprint=args.tested_fingerprint)


if __name__ == '__main__':
    main()
