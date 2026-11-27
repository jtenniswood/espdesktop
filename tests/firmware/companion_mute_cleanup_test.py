"""Exercise mute binding cleanup when a persistent grid button changes card type."""
from pathlib import Path
import subprocess
import sys
import tempfile
from production_source import definition

root = Path(__file__).resolve().parents[2]
controls = (root / 'components/espdesktop/companion_controls.h').read_text()
driver = (root / 'components/espdesktop/button_grid_numeric_selectable_driver.h').read_text()
cough_card = (root / 'components/espdesktop/button_grid_cough.h').read_text()
production = '\n'.join(definition(controls, name)[1] for name in (
    'companion_render_mic_detail', 'companion_render_mute', 'companion_render_value_mute', 'companion_apply_mute_state', 'companion_paint_mute_preview', 'companion_erase_mute_ref', 'companion_mute_deleted',
    'companion_forget_mute', 'companion_tracked_mute_control', 'companion_track_mute'))
production += definition(driver, 'numeric_selectable_driver_cleanup')[1]
production += '\n' + cough_card[cough_card.index('struct CoughTouch'):cough_card.index('inline bool send_cough_button_value')]
production += '\n'.join(definition(cough_card, name)[1] for name in ('cough_button_release', 'cough_button_press'))
stubs = r'''
#include "companion_audio_control.h"
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
struct lv_obj_t { bool checked=false, disabled=false; std::string text; } first, second, input_icon, output_icon, mic_detail;
struct lv_event_t { lv_obj_t *target; };
constexpr int LV_EVENT_DELETE=1;
struct CompanionMuteRef {
  lv_obj_t *button; std::string control_id; std::string computer_id; lv_obj_t *icon_label=nullptr;
  const char *icon_unmuted=nullptr, *icon_muted=nullptr;
  lv_obj_t *text_label=nullptr;
  std::string resting_label{};
  lv_obj_t *detail_label=nullptr;
};
struct CompanionValue { std::string id; int value; };
struct CompanionRuntimeSnapshot {
  bool connected=true; std::vector<CompanionValue> values; bool no_input_device=false;
};
constexpr int LV_STATE_CHECKED = 2, LV_STATE_DISABLED = 4;
bool lv_obj_has_state(lv_obj_t *obj, int state) {
  return state == LV_STATE_CHECKED ? obj->checked : obj->disabled;
}
bool lv_obj_is_valid(lv_obj_t *) { return true; }
const char *lv_label_get_text(lv_obj_t *obj) { return obj->text.c_str(); }
void lv_label_set_text(lv_obj_t *obj, const char *text) { obj->text=text; }
std::string normalize_display_text(const char *text) { return text; }
const char *espdesktop_i18n(const char *value) { return value; }
const char *espdesktop_i18n_key(std::string_view key) {
  if (key == "no_audio_input") return "No audio input";
  return key == "live" ? "Live" : key == "muted" ? "Muted" : "Unavailable";
}
bool detail_deleted = false;
void lv_obj_del(lv_obj_t *obj) { assert(obj == &mic_detail); detail_deleted = true; }
struct Registry { std::vector<CompanionMuteRef> mutes; } registry;
Registry &companion_view_registry() { return registry; }
struct Runtime {
  int displayed_mute_value(const std::string &, int confirmed) { return confirmed; }
  CompanionRuntimeSnapshot snapshot() const { return {}; }
  bool connected() const { return true; }
  void preview_mute(const std::string &, int, const std::string &) {}
} runtime;
Runtime &companion_runtime_service() { return runtime; }
Runtime &companion_runtime_for(const std::string &) { return runtime; }
constexpr auto COMPANION_COUGH_ID = "media.cough";
void unbind_cough_button(lv_obj_t *) {}
bool companion_mute_control_valid(const std::string &id) {
  return id == "media.input_mute" || id == "media.output_mute";
}
using Callback = void (*)(lv_event_t *);
std::vector<std::pair<lv_obj_t *, Callback>> callbacks;
void lv_obj_add_event_cb(lv_obj_t *obj, Callback callback, int, void *) { callbacks.emplace_back(obj, callback); }
void lv_obj_remove_event_cb(lv_obj_t *obj, Callback callback) {
  callbacks.erase(std::remove(callbacks.begin(), callbacks.end(), std::make_pair(obj, callback)), callbacks.end());
}
void *lv_event_get_target(lv_event_t *event) { return event->target; }
void companion_request_card_refresh() {}
void set_card_checked_state(lv_obj_t *obj, bool state) { obj->checked=state; }
void set_card_disabled_state(lv_obj_t *obj, bool state) { obj->disabled=state; }
struct BtnSlot { lv_obj_t *btn; lv_obj_t *sensor_container = nullptr; };
void *lv_obj_get_user_data(lv_obj_t *obj) { return obj; }
namespace ha_controls { inline void unregister_widget(lv_obj_t *) {} }
struct ParsedCfg {};
struct Context { bool numeric=false; };
bool numeric_selectable_driver_matches(const Context &context, const ParsedCfg &) { return context.numeric; }
namespace esphome { unsigned millis() { return 0; } }
bool screen_lock_enabled() { return false; }
bool screen_lock_computer_locked(const std::string &) { return false; }
bool companion_computer_locked(const std::string &) { return false; }
bool companion_value(const std::string &, int &value) { value = 0; return true; }
bool companion_value_for(const std::string &, const std::string &, int &value) { value = 0; return true; }
bool send_cough_button_value(const std::string &, int, int = 100,
                             const std::string & = "") { return true; }
void lv_label_set_display_text(lv_obj_t *obj, const char *text) { lv_label_set_text(obj, text); }
'''
checks = r'''
int main() {
  BtnSlot slot{&first};
  companion_track_mute(&first, "media.input_mute", &input_icon, "mic", "mic-off");
  companion_track_mute(&second, "media.output_mute", &output_icon, "speaker", "speaker-off");
  registry.mutes.front().detail_label = &mic_detail;
  CompanionRuntimeSnapshot snapshot{true, {{"media.input_mute", 100}, {"media.output_mute", 0}}};
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(!first.checked && !first.disabled && input_icon.text=="mic-off" && mic_detail.text=="Muted");
  assert(!second.checked && !second.disabled && output_icon.text=="speaker");
  companion_paint_mute_preview("media.input_mute", 0);
  assert(first.checked && input_icon.text=="mic" && mic_detail.text=="Live");
  assert(!second.checked && output_icon.text=="speaker");
  companion_paint_mute_preview("media.input_mute", 100);
  assert(!first.checked && input_icon.text=="mic-off" && mic_detail.text=="Muted");
  snapshot.values[0].value=0; snapshot.values[1].value=100;
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(first.checked && input_icon.text=="mic");
  assert(second.checked && output_icon.text=="speaker-off");
  snapshot.connected=false;
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(!first.checked && !second.checked && first.disabled && second.disabled);
  assert(input_icon.text=="mic" && output_icon.text=="speaker" && mic_detail.text=="Unavailable");
  snapshot.connected=true; snapshot.values.clear();
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(!first.checked && first.disabled && !second.checked && second.disabled);
  snapshot.no_input_device=true;
  companion_apply_mute_state(registry.mutes.front(), snapshot);
  assert(!first.checked && first.disabled && mic_detail.text=="No audio input");
  snapshot.connected=false;
  companion_apply_mute_state(registry.mutes.front(), snapshot);
  assert(first.disabled && mic_detail.text=="Unavailable");
  snapshot.connected=true;
  snapshot.no_input_device=false;
  snapshot.values.push_back({"media.input_mute", 0});
  companion_apply_mute_state(registry.mutes.front(), snapshot);
  assert(first.checked && !first.disabled && mic_detail.text=="Live");
  first.checked=true; first.disabled=true;
  // Cleanup runs even when the replacement uses a completely different driver.
  assert(!numeric_selectable_driver_cleanup(slot, {}, Context{false}));
  assert(registry.mutes.size()==1 && registry.mutes.front().button==&second);
  assert(!first.checked && !first.disabled && detail_deleted);
  assert(callbacks.size() == 1 && callbacks.front().first == &second);
  // Subsequent mute refreshes cannot alter the replacement card.
  for (const auto &ref : registry.mutes) ref.button->disabled=true;
  assert(!first.disabled && second.disabled);
  companion_track_mute(&first, "media.output_mute");
  assert(numeric_selectable_driver_cleanup(slot, {}, Context{true}));
  assert(registry.mutes.size()==1);
  companion_track_mute(&first, "media.input_mute");
  companion_track_mute(&first, "media.output_mute");
  assert(registry.mutes.size()==2);
  assert(registry.mutes.back().control_id=="media.output_mute");
  lv_event_t event{&first};
  assert(callbacks.size() == 2 && callbacks.back().first == &first);
  callbacks.back().second(&event);
  assert(registry.mutes.size()==1 && registry.mutes.front().button==&second);
  assert(!companion_forget_mute(&first));
  const std::string cough = "obs.cough.69da3f8f-7f62-4abe-a594-4e40dd579858";
  lv_obj_t cough_title{false, false, "Cough"};
  companion_track_mute(&first, cough, &input_icon, "mic", "mic-off", &cough_title);
  assert(companion_tracked_mute_control(&first) == cough);
  first.disabled = false;
  cough_button_press(&first);
  assert(cough_title.text == "Cough");
  companion_apply_mute_state(registry.mutes.back(), {true, {{cough, 100}}});
  assert(cough_title.text == "Muted");
  cough_button_release(&first);
  assert(cough_title.text == "Muted");
  companion_apply_mute_state(registry.mutes.back(), {true, {{cough, 0}}});
  assert(cough_title.text == "Cough");
  companion_apply_mute_state(registry.mutes.back(), {true, {{cough, 100}}});
  assert(cough_title.text == "Muted" && first.checked && !first.disabled && input_icon.text == "mic-off");
  assert(companion_forget_mute(&first));
  assert(companion_tracked_mute_control(&first).empty());
}
'''
with tempfile.TemporaryDirectory() as tmp:
    source = Path(tmp) / 'test.cpp'
    binary = Path(tmp) / 'test'
    source.write_text(stubs + production + checks)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', '-I', str(root / 'components/espdesktop'), str(source), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Mute icons, live microphone colour, availability and persistent binding cleanup checks passed.')
