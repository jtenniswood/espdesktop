#!/usr/bin/env python3
"""Behavioral tests for release provenance, compatibility, and artifact tampering."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from companion_release import compatibility, digest, esp32_application_elf_sha256, manifest, verify


class CompanionReleaseTests(unittest.TestCase):
    def test_published_combination_and_tampering(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            firmware = root / 'firmware'; firmware.mkdir()
            companion = root / 'companion'; companion.mkdir()
            windows = root / 'windows'; windows.mkdir()
            revision = 'a' * 40
            version = 'v9.8.7'
            provenance = firmware / 'release-manifest.json'
            release = {'sourceRevision': revision, 'releaseVersion': version,
                       'webBundle': {'sha256': 'b' * 64}}
            provenance.write_text(json.dumps(release))
            elf_hash = bytes(range(32))
            image = bytearray(208)
            image[:2] = b"\xe9\x01"
            image[28:32] = (176).to_bytes(4, "little")
            image[32:36] = (0xABCD5432).to_bytes(4, "little")
            image[176:208] = elf_hash
            for slug in compatibility()['supportedDevices']:
                for suffix in ('.ota.bin', '.factory.bin'):
                    (firmware / (slug + suffix)).write_bytes(image if suffix == '.ota.bin' else b'firmware fixture')
            for suffix in ('.zip', '.dmg'):
                (companion / ('Companion' + suffix)).write_bytes(b'mac fixture')
            path = companion / 'companion-compatibility.json'
            x64 = windows / 'EspDesktop-Windows-9.8.7-x64-Setup.exe'
            arm64 = windows / 'EspDesktop-Windows-9.8.7-arm64-Setup.exe'
            x64.write_bytes(b'Windows x64 fixture')
            with self.assertRaisesRegex(ValueError, 'Expected Windows installers'):
                manifest(firmware, companion, windows, revision, version)
            arm64.write_bytes(b'')
            with self.assertRaisesRegex(ValueError, 'empty Windows installer'):
                manifest(firmware, companion, windows, revision, version)
            arm64.write_bytes(b'Windows Arm64 fixture')
            record = manifest(firmware, companion, windows, revision, version)
            public_slug = 'guition-esp32-s3-4848s040'
            artifact_only_slug = 'guition-esp32-p4-jc8012p4a1-v3'
            self.assertEqual(compatibility(public_only=True)['supportedDevices'], [public_slug])
            self.assertEqual(record['supportedDevices'], [artifact_only_slug, public_slug])
            self.assertEqual(len(record['artifacts']), 8)
            for installer in (x64, arm64):
                self.assertEqual(record['artifacts'][installer.name],
                                 {'sha256': digest(installer), 'bytes': installer.stat().st_size})
            factory = firmware / (artifact_only_slug + '.factory.bin')
            self.assertEqual(record['artifacts'][factory.name],
                             {'sha256': digest(factory), 'bytes': factory.stat().st_size})
            ota = firmware / (artifact_only_slug + '.ota.bin')
            self.assertEqual(record['artifacts'][ota.name]['appElfSha256'], elf_hash.hex())
            self.assertEqual(esp32_application_elf_sha256(ota), elf_hash.hex())
            broken = firmware / 'broken.bin'
            broken.write_bytes(b'wrong image')
            with self.assertRaisesRegex(ValueError, 'Invalid ESP32 application descriptor'):
                esp32_application_elf_sha256(broken)
            protocol = compatibility()['protocolVersion']
            self.assertEqual(record['supportedCombinations'], [{'firmwareProtocol': protocol, 'companionProtocol': protocol}])
            path.write_text(json.dumps(record))
            fingerprint = digest(path)
            verify(path, firmware, companion, windows, revision, version, tested_fingerprint=fingerprint)
            with self.assertRaisesRegex(ValueError, 'Candidate fingerprint'):
                verify(path, firmware, companion, windows, revision, version, tested_fingerprint='b' * 64)
            original_installer = arm64.read_bytes()
            arm64.write_bytes(original_installer[::-1])
            with self.assertRaisesRegex(ValueError, 'release artifacts'):
                verify(path, firmware, companion, windows, revision, version, tested_fingerprint=fingerprint)
            arm64.write_bytes(original_installer)
            wrong_version = arm64.rename(windows / 'EspDesktop-Windows-9.8.6-arm64-Setup.exe')
            with self.assertRaisesRegex(ValueError, 'Expected Windows installers'):
                verify(path, firmware, companion, windows, revision, version, tested_fingerprint=fingerprint)
            wrong_version.rename(arm64)
            changed_editor = {**release, 'webBundle': {'sha256': 'c' * 64}}
            provenance.write_text(json.dumps(changed_editor))
            with self.assertRaisesRegex(ValueError, 'compatibility manifest'):
                verify(path, firmware, companion, windows, revision, version, tested_fingerprint=fingerprint)
            prerelease_version = 'v9.8.7-beta.1'
            provenance.write_text(json.dumps({**release, 'releaseVersion': prerelease_version}))
            prerelease_record = manifest(firmware, companion, windows, revision, prerelease_version)
            self.assertEqual(prerelease_record['releaseVersion'], prerelease_version)
            provenance.write_text(json.dumps(release))
            with self.assertRaises(ValueError): verify(path, firmware, companion, windows, 'b' * 40, version)
            with self.assertRaises(ValueError): verify(path, firmware, companion, windows, revision, 'v9.8.8')
            (companion / 'Companion.zip').write_bytes(b'tampered bytes')
            with self.assertRaisesRegex(ValueError, 'release artifacts'):
                verify(path, firmware, companion, windows, revision, version, tested_fingerprint=fingerprint)
            (companion / 'Companion.zip').write_bytes(b'mac fixture')
            record['protocolVersion'] = 2
            path.write_text(json.dumps(record))
            with self.assertRaises(ValueError): verify(path, firmware, companion, windows, revision, version)
            (companion / 'Extra.zip').write_bytes(b'extra build')
            with self.assertRaises(ValueError): manifest(firmware, companion, windows, revision, version)

    def test_incomplete_and_unpinned_release(self):
        with TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with self.assertRaises(ValueError): manifest(directory, directory, directory, 'main', 'v9.8.7')
            with self.assertRaises(ValueError): manifest(directory, directory, directory, 'a' * 40, 'dev')
            with self.assertRaises(ValueError): manifest(directory, directory, directory, 'a' * 40, 'v9.8.7-')
            with self.assertRaises(FileNotFoundError): manifest(directory, directory, directory, 'a' * 40, 'v9.8.7')


if __name__ == '__main__':
    unittest.main()
