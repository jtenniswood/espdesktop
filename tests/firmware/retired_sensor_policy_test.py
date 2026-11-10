"""Check that retired sensor modes cannot drive the current display policy."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import yaml
from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
schedule = (ROOT / "common/addon/backlight_schedule.yaml").read_text()
class Loader(yaml.SafeLoader):
    pass
Loader.add_constructor("!lambda", lambda loader, node: loader.construct_scalar(node))
config = yaml.load(schedule, Loader)
rules = json.loads((ROOT / "product/v2/panel_settings.json").read_text())["scalar_settings"]
assert rules["screensaver_mode"] == {
    "default": "disabled", "choices": ["disabled", "timer", "companion"],
}
display = yaml.load((ROOT / "common/config/display.yaml").read_text(), Loader)
for group, entity_id, setting in (
    ("text", "screensaver_mode", "SCREENSAVER_MODE"),
    ("select", "screensaver_action", "SCREEN_SAVER_ACTION"),
):
    entity = next(item for item in display[group] if item["id"] == entity_id)
    assert not entity["restore_value"] and not entity["optimistic"]
    assert f"ScalarSetting::{setting}," in entity["set_action"][0]["lambda"]
trigger = next(item for item in config["text"] if item["id"] == "screen_schedule_trigger")
assert not trigger["restore_value"] and not trigger["optimistic"]
assert next(text for text in config["text"] if text["id"] == "screen_schedule_trigger")["initial_value"] == "time"
assert next(select for select in config["select"] if select["id"] == "schedule_mode")["initial_option"] == "Screen Dimmed"
defaults = {number["id"]: number.get("initial_value") for number in config["number"]}
assert defaults["schedule_on_hour"] == 7
assert defaults["schedule_off_hour"] == 19
assert defaults["schedule_dimmed_brightness"] == 15
for switch in config["switch"]:
    if switch["id"] != "schedule_enabled":
        continue
    assert switch["restore_mode"] == "ALWAYS_ON"
    assert switch["optimistic"] is False
    for handler in ("turn_on_action", "turn_off_action"):
        assert "edit_screen_schedule_preference" in switch[handler][0]["lambda"]
    assert switch["on_turn_off"][0]["if"]["condition"]["lambda"] == "return id(local_display_policy_ready);"
helpers = (ROOT / "components/espdesktop/backlight.h").read_text()
names = ("screen_schedule_in_window", "screen_schedule_sensor_trigger", "screen_schedule_disabled_trigger",
         "screen_schedule_time_trigger", "screen_schedule_waiting_for_time", "screen_schedule_night_active",
         "screen_schedule_normal_active")
production = "\n".join(definition(helpers, name)[1] for name in names)
header_source = (ROOT / "components/espdesktop/button_grid_grid.h").read_text()
local_header = definition(header_source, "grid_refresh_local_header")[1]
assert "grid_phase3(" not in header_source
for profile in (ROOT / "devices").glob("*/device/sensors.yaml"):
    wiring = profile.read_text()
    assert "grid_refresh_local_header(" in wiring
    assert "ha_reannounce_state_subscriptions" not in wiring
    assert "presence_sensor_entity" not in wiring
    assert "media_player_sleep_prevention_entity" not in wiring
code = r'''
#include <cassert>
#include <string>
#include <cmath>
#include <cstddef>
''' + production + r'''
struct lv_obj_t {};
lv_obj_t *registered_label = nullptr, *refreshed_page = nullptr;
size_t registered_count = 0;
bool refreshed_visible = false;
void set_clock_bar_left_labels(lv_obj_t **labels, size_t count) { registered_label = labels[0]; registered_count = count; }
void refresh_clock_bar_left_label(lv_obj_t *page, bool visible) {
 refreshed_page = page; refreshed_visible = visible;
}
''' + local_header + r'''
int main() {
 lv_obj_t label, page; lv_obj_t *labels[] = {&label};
 for (bool visible : {false, true}) {
  grid_refresh_local_header(labels, 1, &page, visible);
  assert(registered_label == &label && registered_count == 1);
  assert(refreshed_page == &page && refreshed_visible == visible);
 }
 assert(!screen_schedule_night_active("time", true, false, true, 18, 7, 19));
 assert(screen_schedule_night_active("time", true, false, true, 19, 7, 19));
 assert(screen_schedule_night_active("time", true, false, true, 6, 7, 19));
 assert(!screen_schedule_night_active("time", true, false, true, 7, 7, 19));
 // Raw values from an older client must never block the display.
 for (const auto &trigger : {"sensor", "Sensor"}) {
  for (bool presence : {false, true}) {
   for (bool valid_time : {false, true}) {
    for (const auto &activation : {"Sensor On", "Sensor Off"}) {
     assert(screen_schedule_disabled_trigger(trigger));
     assert(!screen_schedule_waiting_for_time(trigger, true, valid_time));
     assert(!screen_schedule_night_active(trigger, true, presence, valid_time, 0, 8, 22, activation));
    }
   }
  }
 }
 // Local time schedules keep their deliberate fail-dark boot and normal hours.
 assert(screen_schedule_waiting_for_time("time", true, false));
 assert(screen_schedule_night_active("time", true, false, true, 23, 8, 22));
 assert(screen_schedule_normal_active("time", true, false, true, 12, 8, 22));
}
'''
with tempfile.TemporaryDirectory() as tmp:
    cpp, exe = Path(tmp)/"policy.cpp", Path(tmp)/"policy"
    cpp.write_text(code)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
