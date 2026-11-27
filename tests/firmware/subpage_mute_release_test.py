"""Check subpage microphone cards toggle on release instead of touch-down."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
header = (ROOT / 'components/espdesktop/button_grid_numeric_selectable_driver.h').read_text()
binding = definition(header, 'numeric_selectable_driver_bind_subpage')[1]
source = r'''
#include <cassert>
#include <string>
#include <vector>
enum lv_event_code_t { LV_EVENT_PRESSED=1, LV_EVENT_LONG_PRESSED=2, LV_EVENT_SHORT_CLICKED=3 };
struct lv_obj_t { int unused=0; };
void lv_label_set_display_text(lv_obj_t *, const std::string &) {}
namespace ha_controls { inline std::string domain_of(const std::string &) { return ""; } }
struct lv_event_t { void *user_data=nullptr; };
struct BtnSlot { lv_obj_t *btn=nullptr; lv_obj_t *text_lbl=nullptr; };
struct ParsedCfg { std::string entity; std::string label; };
struct Context {};
struct DisplayProfile {};
struct NumericSelectableSubpageEnvironment { DisplayProfile display; };
struct Callback { lv_event_code_t code; void (*cb)(lv_event_t*); void *data; };
std::vector<Callback> callbacks;
int toggles=0;
bool lv_obj_add_event_cb(lv_obj_t *, void (*cb)(lv_event_t*), lv_event_code_t code, void *data) {
  callbacks.push_back({code,cb,data}); return true;
}
void *lv_event_get_user_data(lv_event_t *event) { return event->user_data; }
template<typename T> T *grid_delete_with_owner(lv_obj_t *, T *ptr) { return ptr; }
bool numeric_selectable_driver_matches(const Context &, const ParsedCfg &) { return true; }
bool numeric_selectable_cough_card(const ParsedCfg &) { return false; }
bool numeric_selectable_ha_slider(const ParsedCfg &) { return false; }
void numeric_selectable_bind_cough(BtnSlot &, const ParsedCfg &, bool) {}
std::string companion_card_computer(const ParsedCfg &) { return ""; }
void numeric_selectable_driver_bind_slider(BtnSlot &, const ParsedCfg &, const DisplayProfile &) {}
bool companion_mute_control_valid(const std::string &) { return true; }
std::string card_hold_action(const ParsedCfg &) { return ""; }
bool card_hold_end_call(lv_obj_t *, const std::string &) { return false; }
bool companion_computer_locked(const std::string &) { return false; }
void companion_toggle_mute(const std::string &, const std::string &) { ++toggles; }
'''
source += binding + r'''
void send(lv_event_code_t code) {
  for (auto &callback : callbacks) if (callback.code==code) {
    lv_event_t event{callback.data};
    callback.cb(&event);
  }
}
int main() {
  lv_obj_t button;
  BtnSlot slot{&button};
  ParsedCfg config{"media.input_mute", ""};
  Context context;
  NumericSelectableSubpageEnvironment environment;
  assert(numeric_selectable_driver_bind_subpage(slot,config,context,environment));
  assert(callbacks.size()==1);
  assert(callbacks[0].code==LV_EVENT_SHORT_CLICKED);
  send(LV_EVENT_PRESSED);
  assert(toggles==0);
  send(LV_EVENT_LONG_PRESSED);
  assert(toggles==0);
  send(LV_EVENT_SHORT_CLICKED);
  assert(toggles==1);
}
'''
with tempfile.TemporaryDirectory(prefix='subpage-mute-release-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall',
                    '-Wextra', '-Werror', '-fsanitize=address,undefined', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True,
                   env={**os.environ, 'ASAN_OPTIONS': 'detect_leaks=0'})
print("Subpage mic cards ignore touch-down and toggle once on release.")
