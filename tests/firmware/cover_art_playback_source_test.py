"""Exercise the real playback lambda across Companion and HA ownership."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
source_path = Path(os.environ.get("PLAYBACK_YAML_SOURCE", root / "common/device/screen_cover_art.yaml"))
block = source_path.read_text().split("  - id: cover_art_toggle_playback\n", 1)[1].split("\n  - id:", 1)[0]
body = block.split("      - lambda: |-\n", 1)[1]
body = "\n".join(line[10:] for line in body.splitlines()).replace("${cover_art_square_overlay}", "true")
harness = r'''
#include <cassert>
#include <string>
#include <vector>
#include "cover_art.h"
namespace espdesktop { enum class DisplayMode { COVER_ART }; }
struct Display { bool visible = true; bool target_mode_is(espdesktop::DisplayMode) { return visible; } };
struct App { Display value; Display &display() { return value; } } espdesktop_app;
struct Toggle { bool state = true; } cover_art_playback_control_enabled;
struct Widget { bool hidden = false; } widget;
Widget *cover_art_screensaver = &widget;
constexpr int LV_OBJ_FLAG_HIDDEN = 1;
bool lv_obj_has_flag(Widget *w, int) { return w->hidden; }
bool cover_art_companion_source_active = true;
bool screensaver_wake_touch_guard_active = false, connected = true;
bool ha_api_state_connected() { return connected; }
unsigned millis() { return 100; }
std::string cover_art_active_media_player_entity = "media_player.saved_ha_player";
std::string cover_art_last_playback_state = "playing";
espdesktop::cover_art::PlaybackControl cover_art_playback_control;
std::vector<std::string> actions;
bool ha_send_entity_action(const std::string &entity, const char *service) {
  actions.push_back(std::string(service) + ":" + entity); return true;
}
struct Script { void execute() {} } cover_art_update_playback_control;
#define id(value) value
void toggle_playback() {
'''
harness += body + r'''
}
int main() {
  // A connected HA server and saved player must not receive Companion commands.
  toggle_playback();
  assert(actions.empty() && !cover_art_playback_control.pending());
  cover_art_companion_source_active = false;
  toggle_playback();
  assert(actions == std::vector<std::string>{"media_player.media_pause:media_player.saved_ha_player"});
  toggle_playback();
  assert(actions.size() == 1); // Duplicate press while the command is pending.
  cover_art_playback_control.observe(cover_art_active_media_player_entity, "paused", 100);
  cover_art_last_playback_state = "paused";
  assert(cover_art_playback_control.retains_pause(cover_art_active_media_player_entity));
  cover_art_companion_source_active = true;
  toggle_playback();
  assert(actions.size() == 1);
  assert(!cover_art_playback_control.retains_pause(cover_art_active_media_player_entity));
  cover_art_companion_source_active = false;
  cover_art_last_playback_state = "playing";
  for (int guard = 0; guard < 4; ++guard) {
    espdesktop_app.value.visible = guard != 0;
    widget.hidden = guard == 1;
    screensaver_wake_touch_guard_active = guard == 2;
    connected = guard != 3;
    toggle_playback();
    assert(actions.size() == 1);
  }
}
'''
with tempfile.TemporaryDirectory(prefix="cover-art-source-") as temp:
    cpp = Path(temp) / "test.cpp"
    binary = Path(temp) / "test"
    cpp.write_text(harness)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else "c++", "-std=c++17",
                    "-Wall", "-Wextra", "-Werror", "-I", str(root / "components/espdesktop"),
                    str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Playback ownership, duplicate press and visibility/wake/connection guards passed.")
