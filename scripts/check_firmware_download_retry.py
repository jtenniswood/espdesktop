#!/usr/bin/env python3
"""Exercise transient recovery, persistent outages, and genuine compile failures."""
import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest

from retry_firmware_downloads import run


class DownloadRetryTests(unittest.TestCase):
    def invoke(self, failures, message, expected_attempts, expected_status):
        with tempfile.TemporaryDirectory() as directory:
            counter = Path(directory) / 'attempts'
            command = [sys.executable, '-c', '''
from pathlib import Path
import sys
p = Path(sys.argv[1])
n = int(p.read_text()) + 1 if p.exists() else 1
p.write_text(str(n))
if n <= int(sys.argv[2]):
    print(sys.argv[3])
    sys.exit(7)
print('Build succeeded')
''', str(counter), str(failures), message]
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                status = run(command, delay=0)
            self.assertEqual(status, expected_status)
            self.assertEqual(int(counter.read_text()), expected_attempts)
            self.assertIn(message if failures else 'Build succeeded', output.getvalue())

    def test_success_needs_no_retry(self):
        self.invoke(0, '', 1, 0)

    def test_temporary_download_failure_recovers(self):
        self.invoke(1, 'WARNING Could not prefetch cmake: Failed to download https://example.test/tool after 5 attempts: 504 Server Error', 2, 0)

    def test_esp_idf_archive_download_recovers(self):
        self.invoke(1, 'WARNING Download of https://example.test/esp-idf.tar.xz failed (504 Server Error: Gateway Time-out); retrying in 4 seconds (attempt 3/3)\n'
                    'ERROR Failed to download from all mirrors:', 2, 0)

    def test_persistent_outage_stays_failed(self):
        self.invoke(9, 'WARNING: Download failure: HTTP Error 503: Service Unavailable', 3, 7)

    def test_compile_error_is_not_retried(self):
        self.invoke(9, 'main.cpp:504: error: invalid conversion', 1, 7)

    def test_non_transient_download_failure_is_not_retried(self):
        self.invoke(9, 'Failed to download https://example.test/tool: 404 Not Found', 1, 7)


if __name__ == '__main__':
    unittest.main()
