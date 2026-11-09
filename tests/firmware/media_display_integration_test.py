#!/usr/bin/env python3
"""Compile the production Mac fullscreen Cover Art label renderers on the host."""
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap



root = Path(__file__).resolve().parents[2]
cover = (root / "common/device/screen_cover_art.yaml").read_text(encoding="utf-8")
cover = cover.split("  - id: cover_art_sync_track_text\n", 1)[1]


def label_lambda(label: str) -> str:
    lines = cover.split(f"id: {label}\n", 1)[1].splitlines()
    assert lines[0].strip() == "text: !lambda |-"
    indentation = len(lines[1]) - len(lines[1].lstrip())
    body = []
    for line in lines[1:]:
        if line.strip() and len(line) - len(line.lstrip()) < indentation:
            break
        body.append(line)
    return textwrap.dedent("\n".join(body))


source = r'''
#include <cassert>
#include <string>
#include "button_grid_string.h"
#include "media_display_text.h"
std::string cover_art_title, cover_art_artist;
#define id(x) x
'''
source += "\nstd::string cover_title() {\n" + label_lambda("cover_art_title_label") + "\n}\n"
source += "\nstd::string cover_artist() {\n" + label_lambda("cover_art_artist_label") + "\n}\n"
source += r'''
int main() {
  const std::string title = u8"RAINING IN ＯＳＡＫＡ 🌧️";
  const std::string artist = u8"Ｂeyoncé 👩🏽‍💻";
  cover_art_title = title; cover_art_artist = artist;
  assert(cover_title() == "RAINING IN OSAKA");
  assert(cover_artist() == u8"Beyoncé");
  assert(cover_art_title == title && cover_art_artist == artist);
  cover_art_title = u8"🌧️";
  assert(cover_title() == u8"—");
  assert(cover_artist() == u8"Beyoncé");
  cover_art_artist = u8"👩🏽‍💻";
  assert(cover_artist().empty());
  cover_art_title = "Next track";
  assert(cover_title() == "Next track");
  cover_art_artist = u8"Ｂeyoncé 👩🏽‍💻";
  assert(cover_artist() == u8"Beyoncé");
}
'''
with tempfile.TemporaryDirectory(prefix="media-display-test-") as tmp:
    path = Path(tmp) / "test.cpp"
    binary = Path(tmp) / "test"
    path.write_text(source, encoding="utf-8")
    subprocess.run([
        sys.argv[1] if len(sys.argv) > 1 else "g++",
        "-std=c++17", "-Wall", "-Wextra", "-Werror",
        "-I", str(root / "components/espdesktop"),
        "-I", str(root / "tests/firmware/stubs"), str(path), "-o", str(binary),
    ], check=True)
    subprocess.run([str(binary)], check=True)
print("Mac fullscreen artwork text rendering passed.")
