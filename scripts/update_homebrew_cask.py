#!/usr/bin/env python3
"""Generate the EspDesktop cask from public GitHub release metadata."""
import argparse
import json
import re
import sys
from pathlib import Path


REPOSITORY = "https://github.com/jtenniswood/espdesktop"
RELEASE_TAG = re.compile(r"(v?)((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))")


def render_cask(releases):
    candidates = []
    for release in releases:
        if release["draft"] or release["prerelease"]:
            continue
        tag = RELEASE_TAG.fullmatch(release["tag_name"])
        if not tag:
            continue
        prefix, version = tag.groups()
        for asset in release["assets"]:
            if asset["name"] == f"EspDesktop-{version}.zip" and asset["state"] == "uploaded":
                candidates.append((tuple(map(int, version.split("."))), prefix, version, asset))

    if not candidates:
        raise ValueError("No stable EspDesktop Mac release ZIP found")

    _, prefix, version, asset = max(candidates, key=lambda candidate: candidate[:2])
    digest = asset.get("digest") or ""
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError(f"GitHub did not report a valid SHA-256 for {asset['name']}")
    expected_url = f"{REPOSITORY}/releases/download/{prefix}{version}/{asset['name']}"
    if asset["browser_download_url"] != expected_url:
        raise ValueError(f"Unexpected download URL for {asset['name']}")

    return fr'''cask "espdesktop" do
  version "{version}"
  sha256 "{digest.removeprefix('sha256:')}"

  url "{REPOSITORY}/releases/download/{prefix}#{{version}}/EspDesktop-#{{version}}.zip"
  name "EspDesktop"
  desc "Companion app for an ESP32 touchscreen controller"
  homepage "https://espdesktop.com/"

  livecheck do
    url :url
    regex(/\Av?(\d+(?:\.\d+){{2}})\z/i)
    strategy :github_releases do |json, regex|
      json.filter_map do |release|
        next if release["draft"] || release["prerelease"]

        version = release["tag_name"]&.[](regex, 1)
        next unless version

        has_zip = release["assets"].any? do |asset|
          asset["name"] == "EspDesktop-#{{version}}.zip" && asset["state"] == "uploaded"
        end
        version if has_zip
      end
    end
  end

  auto_updates true
  depends_on arch: :arm64, macos: :ventura

  app "EspDesktop.app"

  uninstall quit: "io.espdesktop.app"
end
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cask", type=Path)
    args = parser.parse_args()
    try:
        # gh api --paginate --slurp returns a list of pages.
        cask = render_cask(release for page in json.load(sys.stdin) for release in page)
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    args.cask.write_text(cask, encoding="utf-8")


if __name__ == "__main__":
    main()
