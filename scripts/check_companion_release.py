#!/usr/bin/env python3
"""Behavioral tests for release provenance, compatibility, and artifact tampering."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from companion_release import compatibility, digest, manifest, verify


class CompanionReleaseTests(unittest.TestCase):
    def test_published_combination_and_tampering(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            firmware = root / 'firmware'; firmware.mkdir()
            companion = root / 'companion'; companion.mkdir()
            revision = 'a' * 40
            version = 'v9.8.7'
            provenance = firmware / 'release-manifest.json'
            release = {'sourceRevision': revision, 'releaseVersion': version,
                       'webBundle': {'sha256': 'b' * 64}}
            provenance.write_text(json.dumps(release))
            for slug in compatibility()['supportedDevices']:
                for suffix in ('.ota.bin', '.factory.bin'):
                    (firmware / (slug + suffix)).write_bytes(b'firmware fixture')
            for suffix in ('.zip', '.dmg'):
                (companion / ('Companion' + suffix)).write_bytes(b'mac fixture')
            path = companion / 'companion-compatibility.json'
            record = manifest(firmware, companion, revision, version)
            self.assertEqual(record['supportedDevices'], ['guition-esp32-s3-4848s040'])
            self.assertEqual(len(record['artifacts']), 4)
            protocol = compatibility()['protocolVersion']
            self.assertEqual(record['supportedCombinations'], [{'firmwareProtocol': protocol, 'companionProtocol': protocol}])
            path.write_text(json.dumps(record))
            fingerprint = digest(path)
            verify(path, firmware, companion, revision, version, tested_fingerprint=fingerprint)
            with self.assertRaisesRegex(ValueError, 'Candidate fingerprint'):
                verify(path, firmware, companion, revision, version, tested_fingerprint='b' * 64)
            changed_editor = {**release, 'webBundle': {'sha256': 'c' * 64}}
            provenance.write_text(json.dumps(changed_editor))
            with self.assertRaisesRegex(ValueError, 'compatibility manifest'):
                verify(path, firmware, companion, revision, version, tested_fingerprint=fingerprint)
            prerelease_version = 'v9.8.7-beta.1'
            provenance.write_text(json.dumps({**release, 'releaseVersion': prerelease_version}))
            prerelease_record = manifest(firmware, companion, revision, prerelease_version)
            self.assertEqual(prerelease_record['releaseVersion'], prerelease_version)
            provenance.write_text(json.dumps(release))
            with self.assertRaises(ValueError): verify(path, firmware, companion, 'b' * 40, version)
            with self.assertRaises(ValueError): verify(path, firmware, companion, revision, 'v9.8.8')
            (companion / 'Companion.zip').write_bytes(b'tampered bytes')
            with self.assertRaisesRegex(ValueError, 'release artifacts'):
                verify(path, firmware, companion, revision, version, tested_fingerprint=fingerprint)
            (companion / 'Companion.zip').write_bytes(b'mac fixture')
            record['protocolVersion'] = 2
            path.write_text(json.dumps(record))
            with self.assertRaises(ValueError): verify(path, firmware, companion, revision, version)
            (companion / 'Extra.zip').write_bytes(b'extra build')
            with self.assertRaises(ValueError): manifest(firmware, companion, revision, version)

    def test_incomplete_and_unpinned_release(self):
        with TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with self.assertRaises(ValueError): manifest(directory, directory, 'main', 'v9.8.7')
            with self.assertRaises(ValueError): manifest(directory, directory, 'a' * 40, 'dev')
            with self.assertRaises(ValueError): manifest(directory, directory, 'a' * 40, 'v9.8.7-')
            with self.assertRaises(FileNotFoundError): manifest(directory, directory, 'a' * 40, 'v9.8.7')


if __name__ == '__main__':
    unittest.main()
