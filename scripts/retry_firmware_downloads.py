#!/usr/bin/env python3
"""Retry a build only when its log records a transient download failure."""
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
import time

# Match download diagnostics, not arbitrary compiler errors containing numbers.
TRANSIENT_DOWNLOAD = re.compile(
    r"(?:Failed to download|Download failure|Could not prefetch|Download of [^\n]* failed)[^\n]*"
    r"(?:\b50[0234]\b|timed? out|Connection reset|Temporary failure in name resolution)",
    re.IGNORECASE,
)


def run(command: list[str], *, delay: float = 30) -> int:
    for attempt in range(1, 4):
        with tempfile.TemporaryFile(mode="w+t") as log:
            with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  text=True, errors="replace") as process:
                for line in process.stdout:
                    print(line, end="", flush=True)
                    log.write(line)
                status = process.wait()
            log.seek(0)
            transient = any(TRANSIENT_DOWNLOAD.search(line) for line in log)
        if status == 0 or not transient or attempt == 3:
            return status
        wait = delay * attempt
        print(f"Transient build-tool download failure; retrying in {wait:g}s "
              f"(attempt {attempt + 1}/3).", flush=True)
        time.sleep(wait)
    raise AssertionError("unreachable")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: retry_firmware_downloads.py COMMAND [ARG ...]")
    sys.exit(run(sys.argv[1:]))
