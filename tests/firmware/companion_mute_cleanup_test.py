"""Exercise mute binding cleanup when a persistent grid button changes card type."""
from pathlib import Path
import subprocess
import sys
import tempfile
from production_source import definition

root = Path(__file__).resolve().parents[2]
controls = (root / 'components/espdesktop/companion_controls.h').read_text()
driver = (root / 'components/espdesktop/button_grid_numeric_selectable_driver.h').read_text()
production = '\n'.join(definition(controls, name)[1] for name in (
    'companion_apply_mute_state', 'companion_erase_mute_ref', 'companion_mute_deleted',
    'companion_forget_mute', 'companion_track_mute'))
production += definition(driver, 'numeric_selectable_driver_cleanup')[1]
stubs = r'''
#include <algorithm>
#include <cassert>
#include <string>
#include <vector>
struct lv_obj_t { bool checked=false, disabled=false; std::string text; } first, second, input_icon, output_icon;
struct lv_event_t { lv_obj_t *target; };
constexpr int LV_EVENT_DELETE=1;
struct CompanionMuteRef {
  lv_obj_t *button; std::string control_id; lv_obj_t *icon_label=nullptr;
  const char *icon_unmuted=nullptr, *icon_muted=nullptr;
};
struct CompanionValue { std::string id; int value; };
struct CompanionRuntimeSnapshot { bool connected=true; std::vector<CompanionValue> values; };
bool lv_obj_is_valid(lv_obj_t *) { return true; }
void lv_label_set_text(lv_obj_t *obj, const char *text) { obj->text=text; }
struct Registry { std::vector<CompanionMuteRef> mutes; } registry;
Registry &companion_view_registry() { return registry; }
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
struct BtnSlot { lv_obj_t *btn; };
struct ParsedCfg {};
struct Context { bool numeric=false; };
bool numeric_selectable_driver_matches(const Context &context, const ParsedCfg &) { return context.numeric; }
'''
checks = r'''
int main() {
  BtnSlot slot{&first};
  companion_track_mute(&first, "media.input_mute", &input_icon, "mic", "mic-off");
  companion_track_mute(&second, "media.output_mute", &output_icon, "speaker", "speaker-off");
  CompanionRuntimeSnapshot snapshot{true, {{"media.input_mute", 100}, {"media.output_mute", 0}}};
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(first.checked && !first.disabled && input_icon.text=="mic-off");
  assert(!second.checked && !second.disabled && output_icon.text=="speaker");
  snapshot.values[0].value=0; snapshot.values[1].value=100;
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(!first.checked && input_icon.text=="mic");
  assert(second.checked && output_icon.text=="speaker-off");
  snapshot.connected=false;
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(!first.checked && !second.checked && first.disabled && second.disabled);
  assert(input_icon.text=="mic" && output_icon.text=="speaker");
  snapshot.connected=true; snapshot.values.clear();
  for (const auto &ref : registry.mutes) companion_apply_mute_state(ref, snapshot);
  assert(!first.checked && first.disabled && !second.checked && second.disabled);
  first.checked=true; first.disabled=true;
  // Cleanup runs even when the replacement uses a completely different driver.
  assert(!numeric_selectable_driver_cleanup(slot, {}, Context{false}));
  assert(registry.mutes.size()==1 && registry.mutes.front().button==&second);
  assert(!first.checked && !first.disabled);
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
}
'''
with tempfile.TemporaryDirectory() as tmp:
    source = Path(tmp) / 'test.cpp'
    binary = Path(tmp) / 'test'
    source.write_text(stubs + production + checks)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', str(source), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Mute icons, muted-only colour state, availability and persistent binding cleanup checks passed.')
