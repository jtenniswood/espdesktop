#!/usr/bin/env python3
"""Exercise production YAML routing when playback starts in each display mode."""
from pathlib import Path
import subprocess
import sys
import tempfile
import yaml

root = Path(__file__).resolve().parents[2]
class Loader(yaml.SafeLoader):
    pass
Loader.add_constructor('!lambda', lambda loader, node: loader.construct_scalar(node))
text = (root / 'common/device/screen_cover_art.yaml').read_text()
scripts = yaml.load(text[text.index('script:\n'):], Loader)['script']
started = next(script for script in scripts if script['id'] == 'cover_art_playback_started')
route = started['then'][0]['if']['then'][-1]['if']

def emit(actions):
    result = ''
    for action in actions:
        if 'if' in action:
            branch = action['if']
            result += 'if ([&]() {' + branch['condition']['lambda'] + '}()) {'
            result += emit(branch['then']) + '} else {' + emit(branch.get('else', [])) + '}'
        elif 'script.execute' in action:
            result += 'return "' + action['script.execute'] + '";'
        else:
            raise AssertionError(action)
    return result

source = r'''
#include <cassert>
#include <string>
namespace espdesktop { enum class DisplayMode { ACTIVE, CLOCK, DIMMED, OFF, COVER_ART }; }
using Mode = espdesktop::DisplayMode;
struct Display { Mode mode; bool target_mode_is(Mode wanted) const { return mode == wanted; } };
struct App { Display value; Display &display() { return value; } };
struct Bool { bool state; }; struct Text { std::string state; };
#define id(value) value
std::string route(Mode mode, bool keep_awake, std::string saver) {
  App espdesktop_app{{mode}};
  Bool media_player_sleep_prevention_enabled{keep_awake};
  Text screensaver_mode{saver};
'''
source += emit([{'if': route}])
source += r'''
  return "unrouted";
}
int main() {
  for (bool awake : {false, true}) {
    for (const std::string saver : {"timer", "sensor", "off"}) {
      assert(route(Mode::CLOCK, awake, saver) == "show_cover_art_view");
      assert(route(Mode::ACTIVE, awake, saver) ==
        (awake || saver == "off" ? "cover_art_start_delay" : "screensaver_idle_check"));
      for (Mode mode : {Mode::DIMMED, Mode::OFF, Mode::COVER_ART})
        assert(route(mode, awake, saver) == "cover_art_start_delay");
    }
  }
}
'''
with tempfile.TemporaryDirectory() as temporary:
    path = Path(temporary)
    (path / 'test.cpp').write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall', '-Wextra', '-Werror', str(path / 'test.cpp'), '-o', str(path / 'test')], check=True)
    subprocess.run([str(path / 'test')], check=True)
print('Production playback-start clock routing passed.')
