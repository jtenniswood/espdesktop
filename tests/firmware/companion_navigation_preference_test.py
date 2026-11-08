"""Exercise production app navigation with return-home enabled and disabled."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
def function(signature):
    start = source.index(signature)
    return source[start:source.index('\n}', start) + 2]

code = r'''
#include <atomic>
#include <cassert>
#include <functional>
#include <string>
#include <vector>
struct lv_obj_t {};
struct ParsedCfg { std::string entity; };
struct NavigationSubpageEntry { int slot; std::string kind; lv_obj_t *screen; };
struct NavigationHomeTargetEntry { int slot; std::string config; };
lv_obj_t home, app, other;
lv_obj_t *screen = &app;
std::vector<NavigationSubpageEntry> pages{{1, "app_shortcuts", &app}, {2, "app_shortcuts", &other}};
std::vector<NavigationHomeTargetEntry> parents{{1, "first.app"}, {2, "second.app"}};
std::atomic<bool> pending_return{false};
std::string pending_open;
bool return_home = true, alarm = false;
bool alarm_display_takeover_active() { return alarm; }
bool companion_return_home_on_app_switch() { return return_home; }
auto &companion_subpage_return_requested() { return pending_return; }
void companion_consume_subpage_return_request() { pending_return = false; }
std::string companion_pending_auto_subpage_action() { return pending_open; }
bool companion_consume_auto_subpage_action(const std::string &id) {
  if (pending_open != id) return false;
  pending_open.clear(); return true;
}
int navigation_active_subpage_slot() { return screen == &app ? 1 : screen == &other ? 2 : 0; }
NavigationSubpageEntry *navigation_find_slot(int slot) { return slot ? &pages[slot - 1] : nullptr; }
NavigationHomeTargetEntry *navigation_find_slot_target(int slot) { return slot ? &parents[slot - 1] : nullptr; }
auto &navigation_home_targets() { return parents; }
ParsedCfg parse_cfg(const std::string &s) { return {s}; }
bool companion_app_shortcuts_enabled(const ParsedCfg &) { return true; }
bool navigation_return_home(lv_obj_t *) { screen = &home; return true; }
void navigation_hide_modals() {}
lv_obj_t *lv_scr_act() { return screen; }
constexpr int LV_SCR_LOAD_ANIM_NONE = 0;
void lv_scr_load_anim(lv_obj_t *s, int, int, int, bool) { screen = s; }
void lv_obj_update_layout(lv_obj_t *) {}
inline std::function<void(lv_obj_t *)> &button_grid_screen_load_callback() {
  static std::function<void(lv_obj_t *)> callback = nullptr;
  return callback;
}

inline void button_grid_load_screen(lv_obj_t *screen) {
  if (!screen) return;
  lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
  lv_obj_update_layout(screen);
  auto &callback = button_grid_screen_load_callback();
  if (callback) callback(screen);
}


'''
code += function('inline NavigationSubpageEntry *navigation_companion_subpage_for_action(')
code += function('inline bool navigation_return_from_companion_shortcuts_if_needed(')
code += function('inline bool navigation_open_companion_subpage_if_requested(')
code += r'''
int main() {
  int image_activations = 0;
  button_grid_screen_load_callback() = [&](lv_obj_t *page) {
    assert(page == lv_scr_act());
    ++image_activations;
  };
  // Stay on the current page when the next app has a page or no page.
  return_home = false;
  for (const auto &next : {std::string("second.app"), std::string("")}) {
    screen = &app; pending_return = true; pending_open = next;
    assert(!navigation_return_from_companion_shortcuts_if_needed(&home));
    assert(!navigation_open_companion_subpage_if_requested(&home));
    assert(screen == &app && !pending_return && pending_open.empty());
  }
  // A page opened manually is also kept, even without a return request.
  pending_open = "second.app";
  assert(!navigation_open_companion_subpage_if_requested(&home));
  assert(screen == &app && pending_open.empty());
  // Automatic opening from home still works.
  screen = &home; pending_open = "second.app";
  assert(navigation_open_companion_subpage_if_requested(&home));
  assert(screen == &other);
  // Default behaviour returns home, or follows an app with a matching page.
  return_home = true; screen = &app; pending_return = true;
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &home);
  screen = &app; pending_return = true; pending_open = "second.app";
  assert(!navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &app && !pending_return); // No intermediate Home load.
  assert(navigation_open_companion_subpage_if_requested(&home));
  assert(screen == &other);
  // Missing or unbuilt destinations still return Home.
  screen = &app; pending_return = true; pending_open = "missing.app";
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &home);
  screen = &app; pending_return = true; pending_open = "second.app";
  pages[1].screen = nullptr;
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &home);
  assert(!navigation_open_companion_subpage_if_requested(&home));
  pages[1].screen = &other;
  // Focusing the app already displayed must not close its page.
  screen = &app; pending_return = true; pending_open = "first.app";
  assert(!navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &app);
  // Alarm controls retain priority over both automatic transitions.
  alarm = true; pending_return = true; pending_open = "second.app";
  assert(!navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(!navigation_open_companion_subpage_if_requested(&home));
  assert(screen == &app && pending_return && pending_open == "second.app");
  assert(image_activations == 2);
}
'''
with tempfile.TemporaryDirectory() as temporary:
    path = Path(temporary)
    (path / 'test.cpp').write_text(code)
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter', str(path / 'test.cpp'), '-o', str(path / 'test')], check=True)
    subprocess.run([str(path / 'test')], check=True)
print('App switching, stay-on-page, home navigation, and alarm priority passed.')
