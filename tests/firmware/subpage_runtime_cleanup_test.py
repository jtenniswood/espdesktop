"""Exercise production subpage teardown order and active-screen protection."""
import os
from pathlib import Path
import subprocess
import tempfile
from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
header = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
_, cleanup = definition(header, 'navigation_clear_subpages')
source = r'''
#include <cassert>
#include <vector>
struct lv_obj_t { bool runtime_released = false; };
struct NavigationSubpageEntry { lv_obj_t *screen; };
std::vector<NavigationSubpageEntry> entries;
auto &navigation_subpages() { return entries; }
std::vector<lv_obj_t *> grid_screens;
auto &navigation_grid_screens() { return grid_screens; }
void navigation_register_grid_screen_gesture(lv_obj_t *screen) {
  if (screen) grid_screens.push_back(screen);
}
lv_obj_t home;
lv_obj_t *active_screen = &home;
lv_obj_t *lv_scr_act() { return active_screen; }
bool navigation_return_home(lv_obj_t *screen) {
  if (!screen) return false;
  active_screen = screen;
  return true;
}
int deleted = 0, released = 0, cleared_grid_pages = 0;
void clock_bar_clear_responsive_grid_cards(lv_obj_t *) { ++cleared_grid_pages; }
void navigation_release_subpage_runtime(NavigationSubpageEntry &entry) {
  // A card owner may hold timers or images that reference its widgets.
  assert(entry.screen && entry.screen != active_screen);
  entry.screen->runtime_released = true;
  ++released;
}
void lv_obj_del(lv_obj_t *screen) {
  assert(screen->runtime_released && screen != active_screen);
  assert(cleared_grid_pages == deleted + 1);
  ++deleted;
  delete screen;
}
struct NavigationService { void clear_subpages() { entries.clear(); } } service;
auto &grid_navigation_service() { return service; }
void clock_bar_clear_button_grid_pages() {}
void navigation_refresh_subpage_label() {}
''' + cleanup + r'''
int main() {
  for (int rebuild = 0; rebuild < 5; ++rebuild) {
    auto *screen = new lv_obj_t;
    entries.push_back({screen});
    grid_screens.push_back(screen);
    if (rebuild % 2 == 0) {
      active_screen = screen;
      navigation_clear_subpages(nullptr);
      assert(entries.size() == 1 && !screen->runtime_released);
      assert(deleted == rebuild && released == rebuild);
    }
    navigation_clear_subpages(&home);
    assert(entries.empty() && deleted == rebuild + 1 && released == rebuild + 1);
    assert(grid_screens.size() == 1 && grid_screens[0] == &home);
  }
}
'''
with tempfile.TemporaryDirectory(prefix='subpage-runtime-test-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-Wall', '-Wextra', '-Werror',
                    str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Subpage owner release, widget teardown, active-screen protection and gesture reset passed.')
