#!/usr/bin/env python3
"""Run production artwork touch/action lambdas against the real PIN policy."""
from pathlib import Path
import subprocess
import sys
import tempfile
import yaml

ROOT = Path(__file__).resolve().parents[2]
class Loader(yaml.SafeLoader):
    pass
Loader.add_constructor('!lambda', lambda loader, node: loader.construct_scalar(node))
text = (ROOT / 'common/device/screen_cover_art.yaml').read_text()
scripts = {script['id']: script for script in yaml.load(text[text.index('script:\n'):], Loader)['script']}
wake = scripts['cover_art_handle_touch']['then'][0]['if']['condition']['lambda']
source = r'''
#include <cassert>
#include <cstdio>
#include <string>
#include "screensaver_pin.h"
#include "display_mode_controller.h"
#define id(value) value
constexpr int LV_OBJ_FLAG_HIDDEN = 1;
struct Widget {} widget;
Widget *cover_art_screensaver = &widget;
bool lv_obj_has_flag(Widget *, int) { return false; }
bool screensaver_wake_touch_guard_active = false;
struct App { espdesktop::DisplayModeController controller; auto &display() { return controller; } } espdesktop_app;
bool uses_wake_path() { WAKE_LAMBDA }
int main() {
  auto &pin = espdesktop::screensaver_pin();
  pin.setup();
  std::string code = "0042";
  assert(pin.save(true, &code));
  pin.arm();
  espdesktop_app.display().request(espdesktop::DisplayRequestSource::MEDIA_PLAYBACK,
                                  espdesktop::DisplayMode::COVER_ART);
  assert(uses_wake_path());
  assert(pin.save(false, nullptr));
  assert(!uses_wake_path());
  std::string empty;
  assert(pin.save(true, &empty));
  pin.arm();
  assert(!uses_wake_path());
}
'''.replace('WAKE_LAMBDA', wake)
with tempfile.TemporaryDirectory() as directory:
    cpp, binary = Path(directory) / 'test.cpp', Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-pthread',
                    '-Wall', '-Wextra', '-Werror', '-I', str(ROOT / 'components/espdesktop'),
                    '-I', str(ROOT / 'tests/firmware/screensaver_pin_stubs'), str(cpp),
                    str(ROOT / 'components/espdesktop/screensaver_pin.cpp'), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Artwork wake obeys PIN protection; no playback commands remain')
