#!/usr/bin/env python3
"""Regression checks for firmware-size reporting, including the nightly overflow."""
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
import unittest

from report_firmware_size import measure, ota_capacity, report, PARTITION


def partition(kind, subtype, size):
    return PARTITION.pack(0x50AA, kind, subtype, 0x20000, size, b"test", 0)


class FirmwareSizeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.build = self.root / "build/espdesktop-test/build"
        (self.build / "partition_table").mkdir(parents=True)
        (self.build / "project_description.json").write_text(json.dumps({
            "app_bin": "/config/builds/.esphome/build/espdesktop-test/build/espdesktop-test.bin",
        }))
        self.app = self.build / "espdesktop-test.bin"
        self.table = self.build / "partition_table/partition-table.bin"
        self.table.write_bytes(partition(1, 2, 4096) + partition(0, 16, 0x6F0000)
                              + partition(0, 17, 0x6F0000) + bytes.fromhex("ebeb") + b"\xff" * 30)
        self.summary = self.root / "summary.md"

    def run_report(self, size, compile_status=0):
        with self.app.open("wb") as handle:
            handle.truncate(size)
        output = io.StringIO()
        with redirect_stdout(output):
            status = report("test.recovery.yaml", self.root, compile_status, self.summary)
        return status, output.getvalue()

    def test_healthy_image_uses_app_not_factory_size(self):
        (self.build / "firmware.factory.bin").write_bytes(b"factory")
        status, output = self.run_report(6 * 1024 * 1024)
        self.assertEqual(status, 0)
        self.assertNotIn("::warning::", output)
        self.assertEqual(measure(self.root), (6 * 1024 * 1024, 0x6F0000))
        self.assertIn("960.0 KiB", self.summary.read_text())

    def test_nightly_overflow_reports_even_when_compile_fails(self):
        status, output = self.run_report(0x6F4400, compile_status=1)
        self.assertEqual(status, 1)
        self.assertIn("exceeds OTA partition by 17,408 bytes", output)
        self.assertIn("-17.0 KiB", self.summary.read_text())

    def test_oversize_fails_even_if_compiler_returns_success(self):
        self.assertEqual(self.run_report(0x6F0001)[0], 1)

    def test_warning_boundary_and_exact_fit(self):
        self.assertNotIn("::warning::", self.run_report(0x6F0000 - 128 * 1024)[1])
        status, output = self.run_report(0x6F0000 - 128 * 1024 + 1)
        self.assertEqual(status, 0)
        self.assertIn("::warning::", output)
        self.assertEqual(self.run_report(0x6F0000)[0], 0)
        self.assertEqual(self.summary.read_text().count("## Firmware size"), 1)

    def test_other_compile_failure_is_not_masked(self):
        status, output = self.run_report(1024, compile_status=2)
        self.assertEqual(status, 1)
        self.assertIn("build failed", output)

    def test_missing_binary_is_not_reported_as_success(self):
        for compile_status in (0, 1):
            with redirect_stdout(io.StringIO()):
                self.assertEqual(report("missing", self.root, compile_status, self.summary), 1)
        self.assertIn("unavailable", self.summary.read_text())

    def run_nightly_wrapper(self, compile_status):
        repo = Path(__file__).resolve().parents[1]
        workflow = (repo / ".github/workflows/nightly-firmware.yml").read_text()
        match = re.search(r'"\$\{ESPHOME_IMAGE\}" -c \'\n(.*?)\n\s*\' sh ',
                          workflow, re.DOTALL)
        self.assertIsNotNone(match, "nightly container shell was not found")
        # Model the official entrypoint's final exec without running Docker or
        # a real compile. Execute the production shell and size reporter.
        entrypoint = self.root / "entrypoint.sh"
        entrypoint.write_text('#!/bin/sh\nexec sh -c \'exit "$TEST_COMPILE_STATUS"\'\n')
        entrypoint.chmod(0o755)
        script = match.group(1).replace("/entrypoint.sh", str(entrypoint)).replace(
            "/config/scripts/report_firmware_size.py", str(repo / "scripts/report_firmware_size.py"))
        self.app.write_bytes(b"firmware")
        result = subprocess.run(["/bin/sh", "-c", script, "sh", "test.yaml",
                                 "test.yaml", str(self.root)],
                                env={**os.environ, "TEST_COMPILE_STATUS": str(compile_status)},
                                text=True, capture_output=True)
        self.assertTrue((self.root / "firmware-size-summary.md").is_file(), result.stderr)
        self.assertIn("test.yaml", (self.root / "firmware-size-summary.md").read_text())
        return result

    def test_nightly_reports_after_successful_exec_entrypoint(self):
        result = self.run_nightly_wrapper(0)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_nightly_reports_and_propagates_failed_exec_entrypoint(self):
        result = self.run_nightly_wrapper(2)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("build failed", result.stdout)

    def test_empty_binary_and_ambiguous_builds_fail(self):
        self.assertEqual(self.run_report(0)[0], 1)
        other = self.root / "other/build"
        (other / "partition_table").mkdir(parents=True)
        (other / "project_description.json").write_text("{}")
        (other / "partition_table/partition-table.bin").write_bytes(self.table.read_bytes())
        with self.assertRaisesRegex(ValueError, "found 2"):
            measure(self.root)

    def test_smallest_ota_slot_not_data_or_factory_partition(self):
        data = partition(1, 2, 4096) + partition(0, 0, 200) + partition(0, 16, 900) + partition(0, 17, 800)
        self.assertEqual(ota_capacity(data), 800)

    def test_invalid_or_missing_partitions_fail(self):
        for data in (b"", b"bad", b"\x00" * 32, partition(1, 2, 4096), partition(0, 16, 0)):
            with self.subTest(data=data), self.assertRaises(ValueError):
                ota_capacity(data)


if __name__ == "__main__":
    unittest.main()
