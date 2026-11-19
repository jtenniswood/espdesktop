#!/usr/bin/env python3
"""Build EspDesktop's static icon font while preserving the existing glyph IDs."""
import hashlib
from io import BytesIO
from urllib.request import urlopen

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from build import ICONS_JSON, MDI_VERSION, ROOT, load_json, web_mdi_icon_codepoints

ASSETS = ROOT / "common" / "assets"
FONT_DIR = ASSETS / "fonts"
GOOGLE_REV = "10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7"
GOOGLE_SOURCE = (
    f"https://raw.githubusercontent.com/google/material-design-icons/{GOOGLE_REV}/"
    "variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D"
)
GOOGLE_TTF_SHA256 = "f7837ba8573d9a7a74931618ced8307bc81f96d49af296bf6c8052c772ed5282"
GOOGLE_CODEPOINTS_SHA256 = "a7404d9e5a1b63f496cf05ace45d386075886b5a7f123fba9f29527cb6006fde"


def download_source(extension, expected_sha):
    with urlopen(f"{GOOGLE_SOURCE}.{extension}", timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected_sha:
        raise ValueError(f"Material Symbols {extension} did not match the pinned checksum")
    return data


def replace_outlines(font, symbols, names, mapping):
    destination = font.getBestCmap()
    source = symbols.getBestCmap()
    native_codepoints = web_mdi_icon_codepoints(load_json(ICONS_JSON))
    glyph_table = font["glyf"]
    metrics = font["hmtx"].metrics
    em_size = font["head"].unitsPerEm
    scale = em_size / symbols["head"].unitsPerEm
    # Center Google's square glyph box in the existing MDI line metrics.
    y_offset = (font["hhea"].ascent + font["hhea"].descent - em_size) / 2
    replaced = set()

    for style, remaps in mapping.items():
        fill = {"outlined": 0, "filled": 1}[style]
        glyphs = symbols.getGlyphSet(location={"FILL": fill, "GRAD": 0, "opsz": 24, "wght": 400})
        for existing, symbol in remaps.items():
            target_name = destination[int(native_codepoints[existing], 16)]
            if target_name in replaced:
                raise ValueError(f"Multiple replacements for {existing}")
            upstream = glyphs[source[names[symbol]]]
            width, _ = metrics[target_name]
            x_offset = (width - upstream.width * scale) / 2

            outline = DecomposingRecordingPen(glyphs)
            upstream.draw(outline)
            pen = TTGlyphPen(None)
            outline.replay(TransformPen(pen, (scale, 0, 0, scale, x_offset, y_offset)))
            glyph = pen.glyph()
            glyph.recalcBounds(glyph_table)
            glyph_table[target_name] = glyph
            replaced.add(target_name)

    # The upstream font relies on the TrueType flag that sets the left side
    # bearing to xMin, even though its hmtx table stores zero bearings.
    # Materialize those bearings so fontTools preserves the original alignment
    # when it recalculates the flag and font bounds.
    for name, (advance, _) in metrics.items():
        glyph = glyph_table[name]
        if glyph.numberOfContours:
            glyph.recalcBounds(glyph_table)
            metrics[name] = (advance, glyph.xMin)

    return len(replaced)


def main():
    symbols = TTFont(BytesIO(download_source("ttf", GOOGLE_TTF_SHA256)))
    codepoints = download_source("codepoints", GOOGLE_CODEPOINTS_SHA256).decode("ascii")
    names = {name: int(codepoint, 16) for name, codepoint in map(str.split, codepoints.splitlines())}
    with TTFont(FONT_DIR / f"materialdesignicons-webfont-{MDI_VERSION}.ttf", recalcTimestamp=False) as font:
        mapping = load_json(ASSETS / "material_symbols.json")
        count = replace_outlines(font, symbols, names, mapping)
        names_table = font["name"]
        replaced_name_ids = {0, 1, 3, 4, 6, 10, 11, 13, 14}
        names_table.names = [
            record for record in names_table.names if record.nameID not in replaced_name_ids
        ]
        for name_id, value in {
            0: "Pictogrammers. Contains outlines copyright 2026 Google LLC.",
            1: "EspDesktop Icons",
            3: "EspDesktop Icons 1",
            4: "EspDesktop Icons",
            6: "EspDesktopIcons",
            10: "Derived from Material Design Icons and Material Symbols Outlined. Selected glyph outlines and metrics were modified.",
            13: "Apache License, Version 2.0",
            14: "https://www.apache.org/licenses/LICENSE-2.0",
        }.items():
            names_table.setName(value, name_id, 3, 1, 0x409)
        font.save(FONT_DIR / "espdesktop-icons-1.ttf")
    print(f"Generated EspDesktop Icons with {count} Material Symbols.")


if __name__ == "__main__":
    main()
