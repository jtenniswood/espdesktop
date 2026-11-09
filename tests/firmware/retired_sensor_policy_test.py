"""Run the actual boot migration and schedule predicates for retired HA modes."""
from pathlib import Path
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
migration = next(hook for hook in config["esphome"]["on_boot"]
                 if any("local_display_policy_ready) = true" in str(action) for action in hook["then"]))
assert migration["priority"] > -190, "Migrate before the schedule's restored-enabled fallback"
for switch in config["switch"]:
    if switch["id"] != "schedule_enabled":
        continue
    for handler in ("on_turn_on", "on_turn_off"):
        assert len(switch[handler]) == 1
        assert switch[handler][0]["if"]["condition"]["lambda"] == "return id(local_display_policy_ready);"
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
struct Text {
 std::string state; int writes = 0;
 struct Call { Text *text; std::string value;
   void set_value(const char *next) { value = next; }
   void perform() { text->state = value; ++text->writes; }
 };
 Call make_call() { return {this, ""}; }
} screensaver_mode, screen_schedule_trigger;
struct Switch { bool state; int writes = 0; void turn_off() { state = false; ++writes; } } schedule_enabled;
struct Preferences { int syncs = 0; void sync() { ++syncs; } } preferences;
auto *global_preferences = &preferences;
bool local_display_policy_ready = false;
#define id(x) x
void migrate() {
''' + migration["then"][0]["lambda"] + r'''
}
int main() {
 lv_obj_t label, page; lv_obj_t *labels[] = {&label};
 for (bool visible : {false, true}) {
  grid_refresh_local_header(labels, 1, &page, visible);
  assert(registered_label == &label && registered_count == 1);
  assert(refreshed_page == &page && refreshed_visible == visible);
 }
 for (const auto &idle : {"disabled", "timer", "companion", "sensor"}) {
  for (const auto &trigger : {"disabled", "time", "timer", "sensor", "Sensor"}) {
   for (bool enabled : {false, true}) {
    screensaver_mode = {idle, 0}; screen_schedule_trigger = {trigger, 0};
    schedule_enabled = {enabled, 0}; preferences.syncs = 0; local_display_policy_ready = false;
    const bool retired_idle = std::string(idle) == "sensor";
    const bool retired_schedule = screen_schedule_sensor_trigger(trigger);
    migrate();
    assert(local_display_policy_ready);
    assert(screensaver_mode.state == (retired_idle ? "disabled" : idle));
    assert(screen_schedule_trigger.state == (retired_schedule ? "disabled" : trigger));
    assert(schedule_enabled.state == (retired_schedule ? false : enabled));
    assert(preferences.syncs == (retired_idle || retired_schedule ? 1 : 0));
    const int writes = screensaver_mode.writes + screen_schedule_trigger.writes + schedule_enabled.writes;
    migrate();
    assert(writes == screensaver_mode.writes + screen_schedule_trigger.writes + schedule_enabled.writes);
   }
  }
 }
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
