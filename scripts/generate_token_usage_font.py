#!/usr/bin/env python3
"""Rebuild the small Token Usage icon font from its SVG sources (requires fonttools)."""
from pathlib import Path
import xml.etree.ElementTree as ET

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

ASSETS = Path(__file__).resolve().parents[1] / "common" / "assets"
ICONS = {0xE900: "codex", 0xE901: "claude", 0xE902: "opencode-go"}


def main():
    font = FontBuilder(1000, isTTF=True)
    names = [".notdef", *ICONS.values()]
    font.setupGlyphOrder(names)
    font.setupCharacterMap(ICONS)
    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (1000, 0)}
    for name in ICONS.values():
        svg = ET.parse(ASSETS / "token_usage" / f"{name}.svg").getroot()
        pen = TTGlyphPen(None)
        scale = 840 / 24
        outline = TransformPen(Cu2QuPen(pen, 1), (scale, 0, 0, -scale, 80, 920))
        for path in svg.findall("{http://www.w3.org/2000/svg}path"):
            parse_path(path.attrib["d"], outline)
        glyph = pen.glyph()
        glyph.recalcBounds(None)
        glyphs[name] = glyph
        metrics[name] = (1000, glyph.xMin)

    font.setupGlyf(glyphs)
    font.setupHorizontalMetrics(metrics)
    font.setupHorizontalHeader(ascent=1000, descent=0)
    font.setupNameTable({
        "familyName": "EspDesktop Usage Icons",
        "styleName": "Regular",
        "fullName": "EspDesktop Usage Icons Regular",
        "psName": "EspDesktopUsageIcons-Regular",
    })
    font.setupOS2(sTypoAscender=1000, sTypoDescender=0, usWinAscent=1000, usWinDescent=0)
    font.setupPost()
    font.font.recalcTimestamp = False
    font.setupHead(created=2082844800, modified=2082844800)
    font.save(ASSETS / "fonts" / "token-usage-icons.ttf")


if __name__ == "__main__":
    main()
