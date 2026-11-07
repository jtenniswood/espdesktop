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
    if '#define LVGL_VERSION_MAJOR 9' not in (source / 'lv_version.h').read_text():
        parser.error('This rendering check requires the firmware LVGL 9 source')
    output = args.output or Path(tempfile.mkdtemp(prefix='espdesktop-lvgl-render-'))
    output.mkdir(parents=True, exist_ok=True)
    output = output.resolve()
    config = root / 'tests/firmware/lvgl_render_conf.h'
    subprocess.run([args.cmake, '-S', str(source), '-B', str(output / 'build'),
                    f'-DLV_BUILD_CONF_PATH={config}', '-DCONFIG_LV_BUILD_EXAMPLES=OFF',
                    '-DCONFIG_LV_BUILD_DEMOS=OFF', '-DCONFIG_LV_USE_THORVG_INTERNAL=OFF'], check=True)
    subprocess.run([args.cmake, '--build', str(output / 'build'), '-j', '6'], check=True)
    binary = output / 'render-test'
    subprocess.run([args.compiler, '-std=c++17', f'-DLV_CONF_PATH="{config}"',
                    '-I', str(source), '-I', str(root / 'components/espdesktop'),
                    str(root / 'tests/firmware/instant_button_render_test.cpp'),
                    str(output / 'build/lib/liblvgl.a'), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], cwd=output, check=True)
    print(f'Rendered frames: {output}')


if __name__ == '__main__':
    main()
