"""Exercise mute binding cleanup when a persistent grid button changes card type."""
from pathlib import Path
import subprocess
import sys
import tempfile
from generate_media_lifecycle_integration import definition

root = Path(__file__).resolve().parents[2]
controls = (root / 'components/espdesktop/companion_controls.h').read_text()
driver = (root / 'components/espdesktop/button_grid_numeric_selectable_driver.h').read_text()
production = '\n'.join(definition(controls, name)[1] for name in (
    'companion_forget_mute', 'companion_track_mute'))
production += definition(driver, 'numeric_selectable_driver_cleanup')[1]
stubs = r'''
#include <algorithm>
#include <cassert>
#include <string>
#include <vector>
struct lv_obj_t { bool checked=false, disabled=false; } first, second;
struct lv_event_t { lv_obj_t *target; };
constexpr int LV_EVENT_DELETE=1;
struct CompanionMuteRef { lv_obj_t *button; std::string control_id; };
struct Registry { std::vector<CompanionMuteRef> mutes; } registry;
Registry &companion_view_registry() { return registry; }
bool companion_mute_control_valid(const std::string &id) {
  return id == "media.input_mute" || id == "media.output_mute";
}
using Callback = void (*)(lv_event_t *);
std::vector<Callback> callbacks;
void lv_obj_add_event_cb(lv_obj_t *, Callback callback, int, void *) { callbacks.push_back(callback); }
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
  companion_track_mute(&first, "media.input_mute");
  companion_track_mute(&second, "media.output_mute");
  first.checked=true; first.disabled=true;
  // Cleanup runs even when the replacement uses a completely different driver.
  assert(!numeric_selectable_driver_cleanup(slot, {}, Context{false}));
  assert(registry.mutes.size()==1 && registry.mutes.front().button==&second);
  assert(!first.checked && !first.disabled);
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
  for (auto callback : callbacks) callback(&event);
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
print('Persistent mute binding cleanup checks passed.')
