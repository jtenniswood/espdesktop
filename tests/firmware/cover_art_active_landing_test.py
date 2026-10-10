#!/usr/bin/env python3
"""Compile the actual ACTIVE landing guard with the production controller."""
from pathlib import Path
import subprocess
import sys
import tempfile
import yaml

root = Path(__file__).resolve().parents[2]
class Loader(yaml.SafeLoader):
    pass
Loader.add_constructor('!lambda', lambda loader, node: loader.construct_scalar(node))
text = (root / 'common/addon/backlight.yaml').read_text()
scripts = yaml.load(text[text.index('script:\n'):], Loader)['script']
active = next(item for item in scripts if item['id'] == 'display_mode_effect_active')
landing = active['then'][-1]['if']
assert landing['then'] == [{'script.execute': 'cover_art_start_delay'}]
source = r'''
#include <cassert>
#include <string>
#include "display_mode_controller.h"
using namespace espdesktop;
struct App { DisplayModeController controller; auto &display() { return controller; } } espdesktop_app;
struct Toggle { bool state; } cover_art_screensaver_enabled{true};
struct Text { std::string state; } cover_art_media_player_entity{"media_player.test"};
bool cover_art_media_playing = true, cover_art_companion_source_active = false, alarm = false;
bool alarm_display_takeover_active() { return alarm; }
#define id(x) x
bool rearm() {
'''
source += landing['condition']['lambda']
source += r'''
}
void reset() {
  espdesktop_app.controller = {};
  cover_art_screensaver_enabled.state = true;
  cover_art_media_playing = true; cover_art_companion_source_active = false;
  cover_art_media_player_entity.state = "media_player.test"; alarm = false;
}
int main() {
  reset(); assert(rearm());
  // Companion owns an image without a Home Assistant media-player entity.
  cover_art_media_player_entity.state.clear(); assert(!rearm());
  cover_art_companion_source_active = true; assert(rearm());
  cover_art_media_playing = false; assert(!rearm());
  reset(); cover_art_screensaver_enabled.state = false; assert(!rearm());
  for (auto kind : {DisplayTakeoverKind::INTERACTIVE, DisplayTakeoverKind::CRITICAL}) {
    reset(); auto &display = espdesktop_app.display();
    display.begin_takeover(kind); assert(!rearm());
    display.end_takeover(kind); assert(rearm());
  }
  reset(); alarm = true; assert(!rearm()); alarm = false; assert(rearm());
  for (auto mode : {DisplayMode::CLOCK, DisplayMode::DIMMED, DisplayMode::DISPLAY_OFF, DisplayMode::CAMERA}) {
    reset(); espdesktop_app.display().request(DisplayRequestSource::IDLE_TIMER, mode);
    assert(!rearm());
  }
  reset(); espdesktop_app.display().request(DisplayRequestSource::MEDIA_PLAYBACK, DisplayMode::COVER_ART);
  assert(!rearm());
}
'''
with tempfile.TemporaryDirectory() as temporary:
    path = Path(temporary)
    (path/'test.cpp').write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++', '-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', str(root/'components/espdesktop'), str(path/'test.cpp'), '-o', str(path/'test')],check=True)
    subprocess.run([str(path/'test')],check=True)
print('ACTIVE landing artwork rearm, Companion and takeover guards passed.')
