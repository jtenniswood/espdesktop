#!/usr/bin/env python3
"""Load authored Product Model entries and compose the public catalogues."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
PRODUCT_MODEL_V2_JSON = ROOT / "product" / "model_v2.json"
PRODUCT_MODEL_V2_VERSION = 2
CATALOGUE_OUTPUTS = {
    "cardContract": ROOT / "product/v2/card_contract.json",
    "deviceCatalog": ROOT / "product/v2/device_catalog.json",
}
REQUIRED_SOURCES = {
    "cardContract": ("file", "generated-catalogue"),
    "cardContractShared": ("file", "authored"),
    "deviceCatalog": ("file", "generated-catalogue"),
    "deviceCatalogShared": ("file", "authored"),
    "deviceProfiles": ("file", "generated-legacy-adapter"),
    "entityNames": ("file", "authored"),
    "icons": ("file", "authored"),
    "translations": ("glob", "authored"),
    "compatibilityFixtures": ("file", "authored"),
}


class ProductModelV2Error(RuntimeError):
    pass


@dataclass(frozen=True)
class ProductSource:
    identifier: str
    path: Path
    kind: str
    role: str

    def files(self) -> tuple[Path, ...]:
        if self.kind == "file":
            return (self.path,)
        return tuple(sorted(self.path.parent.glob(self.path.name)))


@dataclass(frozen=True)
class ProductModelV2:
    sources: dict[str, ProductSource]
    entries: dict[str, dict[str, Path]]

    def source_path(self, identifier: str) -> Path:
        source = self.sources.get(identifier)
        if source is None:
            raise ProductModelV2Error(f"Product Model v2 does not define source {identifier!r}")
        if source.kind != "file":
            raise ProductModelV2Error(f"Product Model v2 source {identifier!r} is not a file")
        return source.path

    def source_directory(self, identifier: str) -> Path:
        source = self.sources.get(identifier)
        if source is None:
            raise ProductModelV2Error(f"Product Model v2 does not define source {identifier!r}")
        return source.path.parent

    def source_json(self, identifier: str) -> dict[str, Any]:
        path = self.source_path(identifier)
        return _load_json(path)

    def card_contract_data(self) -> dict[str, Any]:
        return self._compose("cardContractShared", "cards")

    def device_catalog_data(self) -> dict[str, Any]:
        return self._compose("deviceCatalogShared", "devices")

    def _compose(self, shared: str, collection: str) -> dict[str, Any]:
        data = self.source_json(shared)
        if collection not in data or data[collection] is not None:
            raise ProductModelV2Error(f"{shared} must have an empty placeholder for {collection}")
        data[collection] = {key: _load_json(path) for key, path in self.entries[collection].items()}
        return data


def render_catalogue(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def _reject_duplicate_keys(display_path: Path, pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ProductModelV2Error(f"{display_path} contains duplicate key {key!r}")
        result[key] = value
    return result


def _load_json(path: Path) -> dict[str, Any]:
    display_path = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle, object_pairs_hook=lambda pairs: _reject_duplicate_keys(display_path, pairs))
    except FileNotFoundError as exc:
        raise ProductModelV2Error(f"{display_path} is missing") from exc
    except json.JSONDecodeError as exc:
        raise ProductModelV2Error(f"{display_path} is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ProductModelV2Error(f"{display_path} must contain an object")
    return data


def _source_path(identifier: str, source_data: dict[str, Any]) -> ProductSource:
    expected_kind, expected_role = REQUIRED_SOURCES[identifier]
    if set(source_data) != {"path", "kind", "role"}:
        raise ProductModelV2Error(f"sources.{identifier} must contain path, kind, and role")
    path_value = source_data["path"]
    if not isinstance(path_value, str) or not path_value:
        raise ProductModelV2Error(f"sources.{identifier}.path must be a non-empty string")
    path = (ROOT / path_value).resolve()
    if ROOT not in path.parents and path != ROOT:
        raise ProductModelV2Error(f"sources.{identifier}.path must remain inside the repository")
    if source_data["kind"] != expected_kind:
        raise ProductModelV2Error(f"sources.{identifier}.kind must be {expected_kind!r}")
    if source_data["role"] != expected_role:
        raise ProductModelV2Error(f"sources.{identifier}.role must be {expected_role!r}")
    if expected_role == "generated-catalogue" and path != CATALOGUE_OUTPUTS[identifier]:
        raise ProductModelV2Error(f"sources.{identifier}.path must name its catalogue output")
    source = ProductSource(identifier, path, expected_kind, expected_role)
    files = source.files()
    if not files:
        raise ProductModelV2Error(f"sources.{identifier}.path does not match any files")
    if expected_kind == "file" and expected_role != "generated-catalogue" and not path.is_file():
        raise ProductModelV2Error(f"sources.{identifier}.path must name a file")
    return source


def _entry_sources(collection: str, data: Any) -> dict[str, Path]:
    if not isinstance(data, dict) or not data:
        raise ProductModelV2Error(f"entries.{collection} must be a non-empty object")
    directory = ROOT / "product" / "v2" / collection
    sources: dict[str, Path] = {}
    for identifier, path_value in data.items():
        if not isinstance(path_value, str) or not path_value:
            raise ProductModelV2Error(f"entries.{collection}.{identifier} must name a file")
        path = (ROOT / path_value).resolve()
        # The unnamed card is the default switch, a saved compatibility ID.
        name = "default_switch" if collection == "cards" and identifier == "" else identifier
        if not name or path.parent != directory or path.name != f"{name}.json" or not path.is_file():
            raise ProductModelV2Error(
                f"entries.{collection}.{identifier} must name its definition in {directory.relative_to(ROOT)}"
            )
        sources[identifier] = path
    if collection == "cards" and "" not in sources:
        raise ProductModelV2Error("entries.cards must retain the unnamed default switch")
    listed = set(sources.values())
    if len(sources) != len(listed) or listed != set(directory.glob("*.json")):
        raise ProductModelV2Error(f"entries.{collection} must list every definition file")
    return sources


def load_product_model_v2(path: Path = PRODUCT_MODEL_V2_JSON) -> ProductModelV2:
    data = _load_json(path)
    if data.get("modelVersion") != PRODUCT_MODEL_V2_VERSION:
        raise ProductModelV2Error(f"modelVersion must be {PRODUCT_MODEL_V2_VERSION}")
    if not isinstance(data.get("description"), str) or not data["description"].strip():
        raise ProductModelV2Error("description must be a non-empty string")
    sources_data = data.get("sources")
    if not isinstance(sources_data, dict) or set(sources_data) != set(REQUIRED_SOURCES):
        raise ProductModelV2Error("sources must define every Product Model v2 source exactly once")
    if not all(isinstance(value, dict) for value in sources_data.values()):
        raise ProductModelV2Error("every source must be an object")
    sources = {
        identifier: _source_path(identifier, sources_data[identifier])
        for identifier in REQUIRED_SOURCES
    }
    entries = data.get("entries")
    if not isinstance(entries, dict) or set(entries) != {"cards", "devices"}:
        raise ProductModelV2Error("entries must define cards and devices")
    return ProductModelV2(sources, {
        collection: _entry_sources(collection, definitions)
        for collection, definitions in entries.items()
    })


def source_path(identifier: str) -> Path:
    return load_product_model_v2().source_path(identifier)


def source_directory(identifier: str) -> Path:
    return load_product_model_v2().source_directory(identifier)
