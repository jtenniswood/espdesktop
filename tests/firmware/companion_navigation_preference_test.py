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
#include <algorithm>
#include <atomic>
#include <cassert>
[[maybe_unused]] constexpr int NAVIGATION_SPECIAL_PAGE_SLOT = -1;

#include <functional>
#include <string>
#include <utility>
#include <vector>
#include "grid_navigation_service.h"
#include "grid_navigation_diagnostics.h"
#include "display_lifecycle_service.h"
namespace espdesktop {
struct TestApp {
  DisplayLifecycleService display;
  const DisplayLifecycleService &display_lifecycle() const { return display; }
};
TestApp app_core;
const TestApp *active_espdesktop_app_core() { return &app_core; }
}
struct lv_obj_t {};
struct ParsedCfg { std::string entity; };
struct NavigationSubpageEntry {
  int slot; std::string kind; lv_obj_t *screen; int parent_slot = 0; uint64_t last_used = 0;
};
namespace esphome { uint32_t millis() { return 15; } }
#define ESP_LOGD(...) ((void) 0)
struct NavigationHomeTargetEntry { int slot; std::string config; };
lv_obj_t home, app, other, folder;
lv_obj_t *screen = &app;
std::vector<NavigationSubpageEntry> pages{
  {1, "app_shortcuts", &app}, {2, "app_shortcuts", &other}, {3, "folder", &folder}};
std::vector<NavigationHomeTargetEntry> parents{{1, "stale.first"}, {2, "stale.second"}};
GridNavigationService<NavigationHomeTargetEntry, NavigationSubpageEntry> navigation;
auto &grid_navigation_service() { return navigation; }
auto &navigation_subpages() { return pages; }
std::atomic<bool> pending_return{false};
std::string pending_open;
std::string closed_app;
std::string focused_at_wake;
bool open_on_focus = true;
std::string companion_take_wake_subpage_action() {
  pending_open.clear();
  pending_return = false;
  closed_app.clear();
  return open_on_focus ? focused_at_wake : "";
}
bool return_home = true;
bool companion_return_home_on_app_switch() { return return_home; }
bool companion_consume_subpage_return_request() { return pending_return.exchange(false); }
std::string companion_consume_closed_app_subpage_action() { return std::exchange(closed_app, {}); }
std::string companion_pending_auto_subpage_action() { return pending_open; }
bool companion_consume_auto_subpage_action(const std::string &id) {
  if (pending_open != id) return false;
  pending_open.clear(); return true;
}
NavigationHomeTargetEntry *navigation_find_slot_target(int slot) {
  return slot > 0 && slot <= 2 ? &parents[slot - 1] : nullptr;
}
auto &navigation_home_targets() { return parents; }
ParsedCfg grid_layout_card_config(int slot, const std::string &) { return {slot == 1 ? "first.app" : "second.app"}; }
bool companion_app_shortcuts_enabled(const ParsedCfg &) { return true; }
bool navigation_restore_subpage_slot(int slot);
std::function<lv_obj_t *(int)> &navigation_subpage_builder() {
  static std::function<lv_obj_t *(int)> build;
  return build;
}
void navigation_begin_page_open(lv_obj_t *, uint32_t) {}
void navigation_release_subpage_screen(NavigationSubpageEntry &page) {
  assert(page.screen != screen);
  page.screen = nullptr;
}
bool navigation_return_home(lv_obj_t *) { screen = &home; return true; }
void navigation_hide_modals() {}
lv_obj_t *lv_scr_act() { return screen; }
constexpr int LV_SCR_LOAD_ANIM_NONE = 0;
void lv_scr_load_anim(lv_obj_t *s, int, int, int, bool) { screen = s; }
void refresh_visible_image_cards() {}
'''
code += function('inline NavigationSubpageEntry *navigation_find_slot(int slot) {')
code += function('inline void navigation_trim_subpage_cache(')
code += function('inline lv_obj_t *navigation_ensure_subpage(int slot) {')
code += function('inline int navigation_subpage_slot_for_screen(')
code += function('inline int navigation_active_subpage_slot(')
code += function('inline void navigation_show_companion_subpage(')
code += function('inline bool navigation_restore_subpage_slot(int slot) {')
code += function('inline NavigationSubpageEntry *navigation_companion_subpage_for_action(')
code += function('inline bool navigation_allows_companion_focus()')
code += function('inline bool navigation_present_companion_subpage(')
code += function('inline bool navigation_present_focused_app_after_sleep()')
code += function('inline bool navigation_return_from_companion_shortcuts_if_needed(')
code += function('inline bool navigation_open_companion_subpage_if_requested(')
code += r'''
int main() {
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
  // The focused app can change while the panel is asleep. Keep automatic
  // navigation dormant until the wake path deliberately picks the latest app.
  lv_obj_t blank;
  auto &display = espdesktop::app_core.display;
  display.set_blank_page_active(true);
  display.begin_wake(false);
  screen = &blank; pending_open = "second.app"; pending_return = true;
  focused_at_wake = "second.app";
  assert(!navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(!navigation_open_companion_subpage_if_requested(&home));
  assert(screen == &blank);
  assert(navigation_present_focused_app_after_sleep());
  assert(screen == &other && pending_open.empty() && !pending_return);
  display.set_blank_page_active(false);
  assert(!navigation_open_companion_subpage_if_requested(&home));
  display.clear_wake_touch_guard();

  // Wake also follows already-focused apps with no pending focus event.
  display.set_blank_page_active(true); screen = &blank;
  assert(navigation_present_focused_app_after_sleep() && screen == &other);
  screen = &blank; open_on_focus = false;
  assert(!navigation_present_focused_app_after_sleep() && screen == &blank);
  open_on_focus = true; focused_at_wake = "missing.app";
  assert(!navigation_present_focused_app_after_sleep() && screen == &blank);
  display.set_blank_page_active(false); focused_at_wake = "second.app";
  assert(!navigation_present_focused_app_after_sleep());
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
  // Leaving a nested app returns to its containing folder.
  screen = &app; pending_return = true; pending_open.clear(); pages[0].parent_slot = 2;
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &other);

  // Closing an app opened from Home returns there, even for a nested card.
  screen = &home;
  pages[0].parent_slot = 3;
  pending_open = "first.app";
  assert(navigation_open_companion_subpage_if_requested(&home));
  pending_return = true;
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &home);

  // A card press remembers the page we left, even when the app lives elsewhere.
  screen = &folder;
  navigation_show_companion_subpage(&other, true);
  pending_open = "second.app";
  // Confirming focus for the page already shown must preserve the return page.
  assert(navigation_open_companion_subpage_if_requested(&home));
  pending_return = true;
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &folder);

  // A window close returns even when the page was opened manually and app
  // switching is set to keep the current page on screen.
  return_home = false;
  navigation_show_companion_subpage(&other, true);
  closed_app = "first.app";
  assert(!navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &other);
  closed_app = "second.app";
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &folder);
  return_home = true;

  // A nested app opened by a card returns to its containing app page. That
  // page still remembers where it came from.
  navigation_show_companion_subpage(&app, true);
  navigation_show_companion_subpage(&other, true);
  closed_app = "second.app";
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &app);
  closed_app = "first.app";
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &folder);

  // If the Mac focuses the parent app directly, drop the child from history.
  navigation_show_companion_subpage(&app, true);
  navigation_show_companion_subpage(&other, true);
  pending_open = "first.app";
  assert(navigation_open_companion_subpage_if_requested(&home));
  closed_app = "first.app";
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &folder);

  // Following Mac focus through multiple app subpages keeps the original page.
  pending_open = "second.app";
  assert(navigation_open_companion_subpage_if_requested(&home));
  pending_return = true; pending_open = "first.app";
  assert(!navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(navigation_open_companion_subpage_if_requested(&home));
  pending_return = true;
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &folder);

  // A page removed while the app subpage is showing falls back to Home.
  navigation_show_companion_subpage(&other, true);
  pages[2].screen = nullptr;
  pending_return = true;
  assert(navigation_return_from_companion_shortcuts_if_needed(&home));
  assert(screen == &home);

  // Focus can open a nested app before either widget tree has been built.
  // Its parent remains resident while it is active, even under pressure.
  lv_obj_t screens[8];
  pages = {{1, "folder", nullptr}, {2, "app_shortcuts", nullptr, 1},
           {3, "folder", nullptr}, {4, "folder", nullptr},
           {5, "folder", nullptr}, {6, "folder", nullptr}};
  navigation_subpage_builder() = [&](int slot) {
    auto *page = navigation_find_slot(slot);
    if (page->parent_slot) assert(navigation_find_slot(page->parent_slot)->screen);
    return page->screen = &screens[slot];
  };
  pending_open = "second.app";
  assert(navigation_open_companion_subpage_if_requested(&home));
  assert(screen == &screens[2] && pages[0].screen == &screens[1]);
  assert(grid_navigation_diagnostics().pages_built.load() == 2);
  assert(navigation_ensure_subpage(2) == &screens[2]);
  assert(grid_navigation_diagnostics().pages_built.load() == 2);
  for (int slot = 3; slot <= 6; ++slot) assert(navigation_ensure_subpage(slot) == &screens[slot]);
  assert(!pages[2].screen && !pages[3].screen);
  assert(pages[4].screen && pages[5].screen);
  navigation_trim_subpage_cache(0, 0);
  assert(pages[0].screen && pages[1].screen && !pages[4].screen && !pages[5].screen);
  screen = &home;
  navigation_trim_subpage_cache(0, 0);
  assert(!pages[0].screen && !pages[1].screen);
  assert(grid_navigation_diagnostics().pages_evicted.load() == 6);
}
'''
with tempfile.TemporaryDirectory() as temporary:
    path = Path(temporary)
    (path / 'test.cpp').write_text(code)
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
                    '-I', str(ROOT / 'components/espdesktop'), str(path / 'test.cpp'), '-o', str(path / 'test')], check=True)
    subprocess.run([str(path / 'test')], check=True)
print('App switching, window closure, and previous-page navigation passed.')
