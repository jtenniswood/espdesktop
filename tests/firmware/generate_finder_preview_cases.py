"""Render the shared Finder layout examples as C++ test data."""

import json
from pathlib import Path
import sys


def initializer(*items):
    return "{" + ", ".join(items) + "}"


source, output = map(Path, sys.argv[1:])
cases = json.loads(source.read_text(encoding="utf-8"))
rows = []
for case in cases:
    catalogue = [initializer(*map(json.dumps, entry)) for entry in case["catalogue"]]
    expected = [initializer(*map(json.dumps, entry)) for entry in case["expected"]]
    row = initializer(
        json.dumps(case["order"]),
        initializer(*map(json.dumps, case["buttons"])),
        initializer(*catalogue),
        str(case["capacity"]),
        initializer(*expected),
    )
    rows.append(f"  {row},")
output.write_text("\n".join(rows) + "\n", encoding="utf-8")
