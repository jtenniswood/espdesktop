"""Exercise touch-down page routing and prevent a held touch reaching the next page."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / "components/espdesktop"


def function(file, signature):
    source = (HEADERS / file).read_text()
    start = source.index(signature)
    return source[start:source.index("\n}", start) + 2]


code = r'''
#include <algorithm>
#include <cassert>
#define ESP_LOGD(...) ((void)0)
#include <cstdio>
#include <string>
#include <vector>
struct lv_obj_t { void *data = nullptr; bool valid = true; int state = 1; };
struct lv_indev_t {};
lv_indev_t touch;
lv_indev_t *input = &touch;
constexpr int LV_STATE_PRESSED = 1, LV_STATE_CHECKED = 2, LV_STATE_DISABLED = 4;
constexpr int LV_SCR_LOAD_ANIM_NONE = 0;
std::vector<int> order;
lv_indev_t *lv_indev_get_act() { return input; }
void lv_indev_wait_release(lv_indev_t *) { order.push_back(1); }
void lv_obj_clear_state(lv_obj_t *b, int s) { b->state &= ~s; order.push_back(2); }
int contrast_syncs = 0;
void sync_bound_card_text_color(lv_obj_t *) { ++contrast_syncs; }
bool lv_obj_has_state(lv_obj_t *b, int state) { return b->state & state; }
lv_obj_t *lv_obj_get_display(lv_obj_t *b) { return b; }
void lv_refr_now(lv_obj_t *) {}
void *lv_obj_get_user_data(lv_obj_t *b) { return b->data; }
bool lv_obj_is_valid(lv_obj_t *b) { return b && b->valid; }
lv_obj_t *active = nullptr;
void lv_scr_load_anim(lv_obj_t *s, int, int, int, bool) { active = s; order.push_back(3); }
void navigation_show_companion_subpage(lv_obj_t *s, bool from_card) {
  assert(from_card);
  lv_scr_load_anim(s, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
}
void refresh_visible_image_cards() {}
void navigation_present_page_before_image_refresh(unsigned) {}
namespace esphome { unsigned millis() { return 0; } }
void navigation_begin_page_open(lv_obj_t *, unsigned) {}
struct Subpage { lv_obj_t *owner_button; };
std::vector<Subpage> entries;
const auto &navigation_subpages() { return entries; }
lv_obj_t *navigation_screen_for_button(lv_obj_t *button) {
  auto *screen = static_cast<lv_obj_t *>(button->data);
  return lv_obj_is_valid(screen) ? screen : nullptr;
}
struct ParsedCfg { std::string type, entity = "app"; bool shortcuts = false; };
struct Context { bool subpage; };
Context card_runtime_context(const ParsedCfg &c) { return {c.type == "subpage"}; }
enum class CompanionAppSubpageMode { FOCUS, CARD, MANUAL };
struct CompanionRuntimeSnapshot { bool connected = true; };
bool app_active = false, connected = true, invoked = true;
struct CompanionRuntime {
  CompanionAppSubpageMode mode = CompanionAppSubpageMode::CARD;
  CompanionAppSubpageMode app_subpage_mode() const { return mode; }
  CompanionRuntimeSnapshot snapshot() const { return {}; }
  bool connected() const { return ::connected; }
} runtime;
const auto &companion_runtime_service() { return runtime; }
CompanionRuntime &companion_runtime_for(const std::string &) { return runtime; }
CompanionRuntime *companion_runtime_for_command(const std::string &) { return &runtime; }
bool companion_connected() { return connected; }
bool companion_action_active(const std::string &) { return app_active; }
bool companion_action_focused(const CompanionRuntimeSnapshot &, const std::string &) { return app_active; }
std::string companion_card_computer(const ParsedCfg &) { return ""; }
void companion_set_active_computer(const std::string &) {}
bool companion_app_shortcuts_enabled(const ParsedCfg &c) { return c.shortcuts; }
bool companion_metric_key_valid(const std::string &) { return false; }
bool companion_obs_status_card(const std::string &) { return false; }
bool companion_apple_shortcut_action(const std::string &) { return false; }
void run_apple_shortcut_card(lv_obj_t *, const std::string &, const char *,
                             const std::string & = "") {}
unsigned companion_next_request_number() { return 1; }
void companion_cancel_action_result(const char *) {}
#define ESP_LOGW(...) ((void)0)
'''
code += function("companion_controls.h", "inline bool companion_app_subpage_manual(")
code += function("companion_controls.h", "inline bool companion_app_subpage_opens_on_press(")
code += r'''
namespace espdesktop::cards {
int invocations = 0;
bool invoke_saved_companion_card(const ParsedCfg &, const char *, const std::string &, lv_obj_t *,
                                 const std::string & = "") {
  ++invocations; order.push_back(4); return invoked;
}
bool navigation_driver_matches(const Context &c) { return c.subpage; }
'''
code += function("button_grid_navigation_driver.h", "inline bool navigation_driver_handle_main_click(")
# Compile the production companion dispatch arm without unrelated action drivers.
basic = (HEADERS / "button_grid_basic_action_driver.h").read_text()
start = basic.index("    case Driver::COMPANION: {", basic.index("inline bool basic_action_driver_handle_main_click("))
# Stop at the next driver arm: later arms use Home Assistant controls that this
# focused dispatch test does not stub.
end = basic.index("    case Driver::", start + len("    case Driver::COMPANION: {"))
code += r'''
bool basic_action_driver_handle_main_click(const Context &, const ParsedCfg &config,
                                         int slot_number, lv_obj_t *button) {
  enum class Driver { COMPANION };
  switch (Driver::COMPANION) {
''' + basic[start:end] + r'''
  }
  return true;
}
}
'''
code += function("button_grid_touch.h", "inline void consume_button_touch_press(")
code += function("button_grid_navigation.h", "inline void navigation_consume_touch_press(")
code += function("button_grid_navigation_driver.h", "inline bool navigation_handle_button_press(")
grid = (HEADERS / "button_grid_grid.h").read_text()
back = grid[grid.index("lv_obj_add_event_cb(back_btn,"):grid.index("navigation_register_subpage_back_button(navigation_slot")]
code += r'''
constexpr int LV_EVENT_PRESSED = 7;
constexpr int LV_EVENT_SHORT_CLICKED = 8;
struct lv_event_t { void *target; void *data; };
void *lv_event_get_target(lv_event_t *e) { return e->target; }
void *lv_event_get_user_data(lv_event_t *e) { return e->data; }
void (*back_callback)(lv_event_t *) = nullptr;
void *back_data = nullptr;
void lv_obj_add_event_cb(lv_obj_t *, void (*cb)(lv_event_t *), int filter, void *data) {
  assert(filter == LV_EVENT_SHORT_CLICKED); back_callback = cb; back_data = data;
}
void bind_back(lv_obj_t *back_btn, lv_obj_t *parent_screen) {
''' + back + "\n}\n"
code += r'''
int main() {
  using Mode = CompanionAppSubpageMode;
  using espdesktop::cards::invocations;
  lv_obj_t home, page, button{&page};
  entries.push_back({&button});
  ParsedCfg config; config.type = "subpage";
  active = &home;
  assert(navigation_handle_button_press(config, 1, &button));
  assert(active == &page && button.state == 0);
  assert((order == std::vector<int>{1, 2, 3}));
  // Execute the real Back callback with LVGL's void* target signature.
  order.clear();
  bind_back(&button, &home);
  lv_event_t event{&button, back_data}; back_callback(&event);
  assert(active == &home && (order == std::vector<int>{1, 2, 3}));
  // Nested folders go to their parent instead of skipping back to Home.
  order.clear(); active=&home;
  bind_back(&button, &page);
  lv_event_t nested_event{&button, back_data}; back_callback(&nested_event);
  assert(active==&page && (order==std::vector<int>{1,2,3}));
  // Invalid/missing targets must not swallow unrelated interactions.
  order.clear(); entries.clear();
  assert(!navigation_handle_button_press(config, 1, &button) && order.empty());
  entries.push_back({&button});
  config.type = "companion"; config.shortcuts = true;
  for (bool available : {true, false}) {
    invoked = available; active = &home; order.clear(); invocations = 0;
    assert(navigation_handle_button_press(config, 1, &button));
    // The default mode opens the page locally before sending the app action.
    assert(active == &page && invocations == 1);
    assert((order == std::vector<int>{1, 2, 3, 4}));
  }
  // Focus and manual modes let a press activate the app when it has no focus.
  for (auto mode : {Mode::FOCUS, Mode::MANUAL}) {
    runtime.mode = mode; app_active = false; order.clear();
    assert(!navigation_handle_button_press(config, 1, &button) && order.empty());
  }
  // An already-focused app opens its page on the manual press.
  app_active = true; invocations = 0;
  assert(navigation_handle_button_press(config, 1, &button));
  assert(invocations == 0 && (order == std::vector<int>{1, 2, 3}));
  // Non-navigation cards retain their normal release actions.
  config.shortcuts = false; order.clear();
  assert(!navigation_handle_button_press(config, 1, &button) && order.empty());
  // No active pointer (e.g. keyboard activation) is safe.
  input = nullptr; navigation_consume_touch_press(&button);
  assert(contrast_syncs > 0);
  assert((order == std::vector<int>{2}));
}
'''

# Guard the actual event hookups, not just the routing helpers.
assert "navigation_consume_touch_press(static_cast<lv_obj_t *>(lv_event_get_target(e)))" in back
assert "LV_EVENT_SHORT_CLICKED" in back and "LV_EVENT_CLICKED" not in back
press = function("button_grid_actions.h", "inline void handle_button_press(")
assert press.index("navigation_handle_button_press(p, slot_num, btn_obj)") < press.index("handle_button_click(cfg, slot_num, btn_obj)")
assert press.index("card_action_locked(p)") < press.index("navigation_handle_button_press(p, slot_num, btn_obj)")

with tempfile.TemporaryDirectory(prefix="espdesktop-navigation-press-") as temp:
    source = Path(temp) / "test.cpp"
    binary = Path(temp) / "test"
    source.write_text(code)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Navigation changes page on touch-down, consumes the held touch and does not await the Mac.")
