#!/usr/bin/env python3
"""Build Linux release artifacts for the EspDesktop companion.

Produces a portable PyInstaller executable and a Debian package under
``dist/linux``:

    python3 -I linux/Packaging/build_linux_release.py --version 1.6.0

The Debian package is architecture-independent and depends on the distribution's
``python3-pyqt6``. The standalone executable bundles Python and PyQt6 and is
built in a pinned Debian bookworm container, so it needs Docker on the build
machine. Use ``--skip-deb`` or ``--skip-standalone`` to build only one.
"""

from __future__ import annotations

import argparse
import os
import pathlib
import platform
import re
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
LINUX = ROOT / "linux"
PACKAGE = LINUX / "espdesktop_companion"
PACKAGING = LINUX / "Packaging"
DEFAULT_OUTPUT = ROOT / "dist" / "linux"
BUILDER_IMAGE = "espdesktop-linux-builder:1"
HOST_ARCH = platform.machine()
CONTRACT = ROOT / "product" / "v2" / "companion_capabilities.json"


def run(args: list[str]) -> None:
    result = subprocess.run(args, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(args)}")


def package_version() -> str:
    text = (PACKAGE / "__init__.py").read_text(encoding="utf-8")
    match = re.search(r'__version__\s*=\s*"([^"]+)"', text)
    if not match:
        raise SystemExit("could not read __version__ from espdesktop_companion")
    return match.group(1)


def normalize_version(value: str) -> str:
    version = value.strip().removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-.+~][0-9A-Za-z.+~-]+)?", version):
        raise SystemExit(f"invalid release version: {value}")
    return version


def copy_package(destination: pathlib.Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for source in sorted(PACKAGE.iterdir()):
        if not source.is_file() or source.suffix != ".py":
            continue
        shutil.copy2(source, destination / source.name)
    # The runtime reads the protocol contract next to the package. Without this
    # copy an installed deb or bundle cannot start.
    shutil.copy2(CONTRACT, destination / CONTRACT.name)


def directory_size_kib(root: pathlib.Path) -> int:
    total = 0
    for path in root.rglob("*"):
        if path.is_file() and not path.is_symlink():
            total += path.stat().st_size
    return max(1, (total + 1023) // 1024)


def write_control(stage: pathlib.Path, version: str) -> None:
    control = f"""Package: espdesktop-companion
Version: {version}
Architecture: all
Maintainer: jdnla <jdnla@users.noreply.github.com>
Installed-Size: {directory_size_kib(stage)}
Depends: python3 (>= 3.10), python3-pyqt6
Section: utils
Priority: optional
Homepage: https://espdesktop.com
Description: Linux companion for EspDesktop displays
 Control an EspDesktop touchscreen from this KDE Plasma desktop: pair with the
 display, launch and switch applications, open folders and websites, lock the
 session, and expose Home Assistant actions.
"""
    debian = stage / "DEBIAN"
    debian.mkdir(parents=True, exist_ok=True)
    (debian / "control").write_text(control, encoding="utf-8")
    hooks = """#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t /usr/share/icons/hicolor || true
fi
exit 0
"""
    for name in ("postinst", "postrm"):
        path = debian / name
        path.write_text(hooks, encoding="utf-8")
        path.chmod(0o755)


def build_deb(version: str, output: pathlib.Path) -> pathlib.Path:
    if shutil.which("dpkg-deb") is None:
        raise SystemExit("dpkg-deb is required to build the Debian package")
    stage = pathlib.Path(tempfile.mkdtemp(prefix="espdesktop-deb-"))
    try:
        library = stage / "usr/lib/espdesktop-companion"
        copy_package(library / "espdesktop_companion")
        shutil.copy2(LINUX / "run.py", library / "run.py")
        (library / "run.py").chmod(0o755)

        bin_dir = stage / "usr/bin"
        bin_dir.mkdir(parents=True)
        os.symlink("../lib/espdesktop-companion/run.py", bin_dir / "espdesktop-companion")

        applications = stage / "usr/share/applications"
        applications.mkdir(parents=True)
        shutil.copy2(
            PACKAGING / "espdesktop-companion.desktop",
            applications / "espdesktop-companion.desktop",
        )
        icons = stage / "usr/share/icons/hicolor/scalable/apps"
        icons.mkdir(parents=True)
        shutil.copy2(
            PACKAGING / "espdesktop-companion.svg",
            icons / "espdesktop-companion.svg",
        )

        docs = stage / "usr/share/doc/espdesktop-companion"
        docs.mkdir(parents=True)
        shutil.copy2(LINUX / "README.md", docs / "README.md")
        shutil.copy2(ROOT / "LICENSE", docs / "copyright")

        write_control(stage, version)
        stage.chmod(0o755)
        for path in stage.rglob("*"):
            if path.is_symlink():
                continue
            if path.is_dir():
                path.chmod(0o755)
            elif path.stat().st_mode & 0o111:
                path.chmod(0o755)
            else:
                path.chmod(0o644)
        output.mkdir(parents=True, exist_ok=True)
        deb = output / f"espdesktop-companion_{version}_all.deb"
        run(["dpkg-deb", "--root-owner-group", "--build", str(stage), str(deb)])
        return deb
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def build_standalone(version: str, output: pathlib.Path) -> pathlib.Path:
    if shutil.which("docker") is None:
        raise SystemExit("Docker is required to build the standalone executable")
    dockerfile = PACKAGING / "Dockerfile.standalone"
    run(
        [
            "docker",
            "build",
            "--tag",
            BUILDER_IMAGE,
            "--file",
            str(dockerfile),
            str(PACKAGING),
        ]
    )
    output.mkdir(parents=True, exist_ok=True)
    work = pathlib.Path(tempfile.mkdtemp(prefix="espdesktop-standalone-"))
    for subdirectory in ("home", "pyinstaller"):
        (work / subdirectory).mkdir()
    try:
        run(
            [
                "docker",
                "run",
                "--rm",
                "--user",
                f"{os.getuid()}:{os.getgid()}",
                "-e",
                "HOME=/work/home",
                "-e",
                "PYINSTALLER_CONFIG_DIR=/work/pyinstaller",
                "-v",
                f"{ROOT}:/src:ro",
                "-v",
                f"{output}:/out",
                "-v",
                f"{work}:/work",
                BUILDER_IMAGE,
                "pyinstaller",
                "--onefile",
                "--clean",
                "--noconfirm",
                "--name",
                "espdesktop-companion",
                "--paths",
                "/src/linux",
                "--add-data",
                "/src/product/v2/companion_capabilities.json:espdesktop_companion",
                "--distpath",
                "/out",
                "--workpath",
                "/work/build",
                "--specpath",
                "/work",
                "/src/linux/run.py",
            ]
        )
        built = output / "espdesktop-companion"
        if not built.is_file():
            raise SystemExit("PyInstaller did not produce the executable")
        target = output / f"EspDesktop-Companion-{version}-linux-{HOST_ARCH}"
        built.replace(target)
        target.chmod(0o755)
        return target
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--version",
        default=package_version(),
        help="Release version, with or without a leading v (default: package version)",
    )
    parser.add_argument(
        "--output-dir",
        type=pathlib.Path,
        default=DEFAULT_OUTPUT,
        help=f"Artifact directory (default: {DEFAULT_OUTPUT.relative_to(ROOT)})",
    )
    parser.add_argument("--skip-deb", action="store_true")
    parser.add_argument("--skip-standalone", action="store_true")
    args = parser.parse_args()

    version = normalize_version(args.version)
    output = args.output_dir.resolve()
    if not args.skip_deb:
        deb = build_deb(version, output)
        print(f"Built {deb}")
    if not args.skip_standalone:
        binary = build_standalone(version, output)
        print(f"Built {binary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
