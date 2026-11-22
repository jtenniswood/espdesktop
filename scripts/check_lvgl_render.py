"""Render state/shape regressions with real LVGL, without a physical display."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lvgl-source', type=Path, required=True)
    parser.add_argument('--cmake', default=shutil.which('cmake') or 'cmake')
    parser.add_argument('--compiler', default='c++')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source = args.lvgl_source.resolve(strict=True)
    version_header = source / 'include' / 'lvgl' / 'lv_version.h'
    if not version_header.exists():
        version_header = source / 'lv_version.h'
    version = version_header.read_text().splitlines()
    if '#define LVGL_VERSION_MAJOR 9' not in version or not any(
        line.startswith('#define LVGL_VERSION_MINOR ') and int(line.split()[-1]) >= 5
        for line in version
    ):
        parser.error('This rendering check requires LVGL 9.5 or newer in the 9.x series')
    output = args.output or Path(tempfile.mkdtemp(prefix='espdesktop-lvgl-render-'))
    output.mkdir(parents=True, exist_ok=True)
    output = output.resolve()
    config = root / 'tests/firmware/lvgl_render_conf.h'
    subprocess.run([args.cmake, '-S', str(source), '-B', str(output / 'build'),
                    f'-DLV_BUILD_CONF_PATH={config}', '-DCONFIG_LV_BUILD_EXAMPLES=OFF',
                    '-DCONFIG_LV_BUILD_DEMOS=OFF', '-DCONFIG_LV_USE_THORVG_INTERNAL=OFF'], check=True)
    subprocess.run([args.cmake, '--build', str(output / 'build'), '-j', '6'], check=True)
    library = next((output / 'build').rglob('liblvgl.a'))
    binary = output / 'render-test'
    subprocess.run([args.compiler, '-std=c++17', f'-DLV_CONF_PATH="{config}"',
                    '-I', str(source), '-I', str(root / 'components/espdesktop'),
                    str(root / 'tests/firmware/instant_button_render_test.cpp'),
                    str(library), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], cwd=output, check=True)
    print(f'Rendered frames: {output}')


if __name__ == '__main__':
    main()
