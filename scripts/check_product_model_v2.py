#!/usr/bin/env python3
"""Check or regenerate the aggregate Product Model v2 catalogues."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from product_model_v2 import (
    PRODUCT_MODEL_V2_JSON,
    ProductModelV2Error,
    load_product_model_v2,
    render_catalogue,
)


def sync_catalogues(update: bool) -> bool:
    model = load_product_model_v2()
    outputs = {
        model.source_path("cardContract"): render_catalogue(model.card_contract_data()),
        model.source_path("deviceCatalog"): render_catalogue(model.device_catalog_data()),
    }
    clean = True
    for path, expected in outputs.items():
        if path.is_file() and path.read_text(encoding="utf-8") == expected:
            continue
        if update:
            path.write_text(expected, encoding="utf-8")
        else:
            print(f"{path.name} is stale. Run python3 scripts/check_product_model_v2.py --update.")
            clean = False
    return clean


def assert_model_rejects(mutate, message: str) -> None:
    data = json.loads(PRODUCT_MODEL_V2_JSON.read_text(encoding="utf-8"))
    mutate(data)
    with TemporaryDirectory() as directory:
        path = Path(directory) / "model.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        try:
            load_product_model_v2(path)
        except ProductModelV2Error as exc:
            assert message in str(exc), exc
        else:
            raise AssertionError(f"Invalid Product Model accepted. Expected {message!r}.")


def run_self_test() -> None:
    assert sync_catalogues(False)
    model = load_product_model_v2()
    assert model.entries["cards"][""].name == "default_switch.json"
    assert_model_rejects(lambda data: data["sources"].pop("icons"), "sources must define every")
    assert_model_rejects(
        lambda data: data["entries"]["cards"].pop("media"), "entries.cards must list every",
    )
    assert_model_rejects(
        lambda data: data["entries"]["devices"].pop("guition-esp32-s3-4848s040"),
        "entries.devices must list every",
    )
    assert_model_rejects(
        lambda data: data["sources"]["cardContract"].update(path="README.md"),
        "must name its catalogue output",
    )
    assert_model_rejects(
        lambda data: data["entries"]["cards"].update(media=data["entries"]["cards"][""]),
        "entries.cards.media must name its definition",
    )
    print("Product Model v2 self-test passed.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--update", action="store_true", help="regenerate both aggregate catalogues")
    args = parser.parse_args()
    try:
        if args.self_test:
            run_self_test()
        elif not sync_catalogues(args.update):
            return 1
    except (AssertionError, ProductModelV2Error) as exc:
        print(f"ERROR: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
