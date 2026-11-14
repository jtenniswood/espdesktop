"""Exercise production touch-down dispatch, pointer consumption and main-card guards."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / "components/espdesktop"
code = r'''
#include <cassert>
#include <string>
#include <vector>
struct lv_event_t;
using lv_event_cb_t = void (*)(lv_event_t *);
constexpr int LV_EVENT_PRESSED = 1, LV_EVENT_CLICKED = 2, LV_EVENT_LONG_PRESSED = 3;
constexpr int LV_STATE_PRESSED = 1;
struct Binding { lv_event_cb_t action; int event; void *data; };
struct lv_obj_t { int state = LV_STATE_PRESSED; std::vector<Binding> bindings; };
struct lv_event_t { void *target; void *data; };
struct lv_indev_t { bool waiting = false; };
lv_indev_t pointer;
lv_indev_t *input = &pointer;
lv_indev_t *lv_indev_get_act() { return input; }
void lv_indev_wait_release(lv_indev_t *i) { i->waiting = true; }
void lv_obj_clear_state(lv_obj_t *o, int s) { o->state &= ~s; }
void *lv_event_get_target(lv_event_t *e) { return e->target; }
void *lv_event_get_user_data(lv_event_t *e) { return e->data; }
void lv_obj_add_event_cb(lv_obj_t *o, lv_event_cb_t cb, int event, void *data) {
  o->bindings.push_back({cb, event, data});
}
void dispatch(lv_obj_t *o, int event) {
  for (auto b : o->bindings) if (b.event == event) {
    lv_event_t e{o,b.data}; b.action(&e);
  }
}
int contrast_syncs = 0;
void sync_bound_card_text_color(lv_obj_t *o) { assert(!(o->state & LV_STATE_PRESSED)); ++contrast_syncs; }
// Exercise the production touch helper; colour propagation is tested separately.
TOUCH_HELPER
bool locked = false;
bool screen_lock_enabled() { return locked; }
constexpr int MAX_GRID_SLOTS = 36;
struct ParsedCfg {};
ParsedCfg grid_layout_card_config(int, const std::string &) { return {}; }
bool navigation = false;
bool navigation_handle_button_press(const ParsedCfg &, int, lv_obj_t *) { return navigation; }
int calls = 0;
void handle_button_click(const std::string &, int, lv_obj_t *) {
  assert(pointer.waiting); ++calls;
}
'''
code = code.replace('TOUCH_HELPER', (HEADERS / 'button_grid_touch.h').read_text().replace('#pragma once', '').replace('#include "card_text_contrast.h"', ''))
actions = (HEADERS / "button_grid_actions.h").read_text()
start = actions.index("inline void handle_button_press(")
code += actions[start:actions.index("\n}", start) + 2]
code += r'''
int main() {
  lv_obj_t button;
  int context = 42;
  bind_immediate_button_action(&button, [](lv_event_t *event) {
    assert(pointer.waiting);  // consumed before opening/deleting/replacing UI
    assert(*static_cast<int *>(lv_event_get_user_data(event)) == 42);
    ++calls;
  }, &context);
  for (int i = 0; i < 100; ++i) {
    pointer.waiting = false; button.state = LV_STATE_PRESSED;
    const auto before = calls;
    dispatch(&button, LV_EVENT_PRESSED);
    assert(calls == before + 1 && button.state == 0);
    assert(contrast_syncs == i + 1);
    // Neither a hold nor release has an action callback: one command per touch.
    dispatch(&button, LV_EVENT_LONG_PRESSED);
    dispatch(&button, LV_EVENT_CLICKED);
    assert(calls == before + 1);
  }
  const auto before = calls;
  pointer.waiting = false; locked = true;
  handle_button_press("app", 1, &button);
  assert(calls == before && !pointer.waiting);
  locked = false;
  for (int slot : {-1, 0, MAX_GRID_SLOTS + 1}) handle_button_press("app", slot, &button);
  assert(calls == before && !pointer.waiting);
  navigation = true;
  handle_button_press("page", 1, &button);
  assert(calls == before); // existing navigation owns its action
  navigation = false;
  handle_button_press("app", 1, &button);
  assert(calls == before + 1 && pointer.waiting);
  // Keyboard/programmatic events without a pointer remain supported.
  input = nullptr; consume_button_touch_press(&button);
}
'''

# Main cards retain wake guards; local sliders retain release handling.
widget = (ROOT / "common/device/button_widget.yaml").read_text()
assert 'event: "PRESS"' in widget and 'event: "TAP"' in widget and 'event: "HOLD"' in widget
touch_binding = (ROOT / "common/device/button_widget_touch.yaml").read_text()
assert touch_binding.index("decide_grid_touch(") < touch_binding.index("handle_button_press(")
assert "LV_EVENT_RELEASED" in (HEADERS / "button_grid_sliders.h").read_text()
with tempfile.TemporaryDirectory(prefix="espdesktop-immediate-actions-") as temp:
    source, binary = Path(temp) / "test.cpp", Path(temp) / "test"
    source.write_text(code)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", str(HEADERS), str(source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Discrete actions fire once on touch-down; Mac lock, wake, navigation and drag guards are preserved.")
