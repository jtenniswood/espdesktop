#!/usr/bin/env python3
"""Exercise the real sleep predicates against retained/disconnected media state."""
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
text = (root / 'common/addon/backlight.yaml').read_text()
# ESPHome merges packages before normalizing on_boot to a list. A mapping
# here is silently replaced by the later loading-screen package's list.
boot = text.split('  on_boot:\n', 1)[1].split('\nscript:', 1)[0]
assert re.search(r'^    - priority: -240$', boot, re.M), 'Screensaver boot handler must survive package merging'
assert 'register_companion_connection_changed_handler' in boot
assert 'register_screen_lock_changed_handler' in boot

script = text.split('  - id: screensaver_sleep_timer\n', 1)[1].split('\n  - id:', 1)[0]
predicates = re.findall(r'condition:\n\s+lambda: \|-\n(.*?)(?=\n\s*then:)', script, re.S)
assert len(predicates) == 2
source = r'''
#include <cassert>
#include <string>
#include "display_mode_controller.h"
struct Text { std::string state; } screensaver_mode, cover_art_media_player_entity;
struct Switch { bool state = false; } cover_art_screensaver_enabled, cover_art_hide_external_input_enabled;
struct App { espdesktop::DisplayModeController controller;
  auto &display() { return controller; }
} espdesktop_app;
std::string cover_art_last_playback_state;
bool cover_art_media_playing = false, cover_art_attribute_conditions_match = true;
bool cover_art_external_input_active = false, cover_art_companion_source_active = true;
#define id(x) x
bool defers_sleep() {
''' + predicates[0] + '\n}\nbool chooses_cover_art() {\n' + predicates[1].replace('${voice_interaction_active_condition}', 'false') + r'''
}
int main() {
  using namespace espdesktop;
  for (const auto *mode : {"companion", "timer", "sensor"}) {
    screensaver_mode.state = mode;
    const bool companion = screensaver_mode.state == "companion";
    for (bool visible : {false, true}) {
      if (visible) espdesktop_app.display().request(DisplayRequestSource::MEDIA_PLAYBACK, DisplayMode::COVER_ART);
      else espdesktop_app.display().clear(DisplayRequestSource::MEDIA_PLAYBACK);
      for (bool playing : {false, true}) {
        cover_art_media_playing = playing;
        for (const auto *state : {"", "unavailable", "idle", "playing", "buffering", "paused"}) {
          cover_art_last_playback_state = state;
          const bool stale = cover_art_last_playback_state != "playing" &&
              cover_art_last_playback_state != "buffering" && cover_art_last_playback_state != "paused";
          assert(defers_sleep() == (!companion && (visible || (playing && stale))));
          for (bool enabled : {false, true}) {
            cover_art_screensaver_enabled.state = enabled;
            assert(chooses_cover_art() == (!companion && enabled && playing));
          }
        }
      }
    }
  }
}
'''
with tempfile.TemporaryDirectory() as temp:
    cpp = Path(temp) / 'test.cpp'
    exe = Path(temp) / 'test'
    cpp.write_text(source)
    subprocess.run(['c++', '-std=c++17', '-Wall', '-Wextra', '-Werror',
                    '-I', str(root / 'components/espdesktop'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('Companion screensaver regression checks passed')
