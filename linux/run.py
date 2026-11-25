#!/usr/bin/env python3
"""Launch the EspDesktop Linux companion from a checkout."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from espdesktop_companion.app import main  # noqa: E402

raise SystemExit(main())
