"""Exercise subpage clock-bar visibility using the production policy."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "components/espdesktop/clock_bar.h").read_text()
start = source.index("inline bool &clock_bar_subpage_title_bar_enabled()")
end = source.index("inline bool clock_bar_should_reserve_space(", start)
display = (root / "common/config/display.yaml").read_text()
refresh_start = display.index("navigation_subpage_clock_bar_refresh() = []() {")
refresh = display[refresh_start:].split("navigation_refresh_subpage_label();", 1)[0].split("{", 1)[1]
refresh = refresh.replace("${main_page_pad_top}", "40").replace("${main_page_compact_pad_top}", "4")
padding_start = source.index("inline void clock_bar_set_grid_page_pad_top(")
padding_end = source.index("inline bool clock_bar_active_on_button_grid_page(", padding_start)
code = r'''#include <cassert>
#include <vector>
#include "display_mode_controller.h"
using lv_coord_t = int;
constexpr int LV_PART_MAIN = 0;
struct lv_obj_t { int top = 4; };
lv_obj_t home, subpage, screensaver;
lv_obj_t *active = &home;
lv_obj_t *lv_scr_act() { return active; }
bool clock_bar_active_on_button_grid_page(lv_obj_t *) { return active == &home || active == &subpage; }
struct ClockBarVisibility { bool reserve_space = false, visible = false; };
''' + source[start:end] + r'''
std::vector<lv_obj_t *> &clock_bar_button_grid_pages() {
  static std::vector<lv_obj_t *> pages{&subpage};
  return pages;
}
int updates = 0;
int lv_obj_get_style_pad_top(lv_obj_t *page, int) { return page->top; }
void lv_obj_set_style_pad_top(lv_obj_t *page, int top, int) { page->top = top; }
void lv_obj_update_layout(lv_obj_t *) { ++updates; }
void clock_bar_refresh_responsive_grid_cards(lv_obj_t *) {}
struct Page { lv_obj_t *obj; } home_page{&home};
auto *main_page = &home_page;
struct Switch { bool state = false; } clock_bar_enabled;
struct App {
  App &display() { return *this; }
  auto current_mode() { return espdesktop::DisplayMode::ACTIVE; }
  bool target_schedule_inactive() { return false; }
} espdesktop_app;
#define id(x) x
''' + source[padding_start:padding_end] + '\nvoid refresh() {\n' + refresh + '\n}\n' + r'''
int main() {
  using espdesktop::DisplayMode;
  // Execute the production page-change wiring with the home bar turned off.
  refresh();
  assert(home.top == 4 && subpage.top == 4);
  active = &subpage;
  refresh();
  assert(subpage.top == 40); // Full clock-bar height is reserved before the title.
  const int before = updates;
  refresh();
  assert(updates == before); // Periodic refreshes still avoid unnecessary layout.
  active = &home;
  refresh();
  assert(home.top == 4 && subpage.top == 4);
  for (bool title_bar : {false, true}) {
    clock_bar_subpage_title_bar_enabled() = title_bar;
  for (bool enabled : {false, true}) {
    for (bool scheduled_off : {false, true}) {
      for (auto *screen : {&home, &subpage, &screensaver}) {
        active = screen;
        for (auto mode : {DisplayMode::ACTIVE, DisplayMode::DIMMED, DisplayMode::CLOCK}) {
          auto result = clock_bar_resolve_visibility(enabled, &home, mode, scheduled_off);
          const bool reserve = (enabled || (screen == &subpage && title_bar)) && !scheduled_off;
          assert(result.reserve_space == reserve);
          assert(result.visible == (reserve && screen != &screensaver && mode != DisplayMode::CLOCK));
        }
      }
    }
  }
  }
}
'''
# The shared rendering lambda only shows the time on the home screen.
display = (root / "common/config/display.yaml").read_text()
time_guard = display.split("bool show_time =", 1)[1].split(";", 1)[0]
assert "lv_scr_act() == id(main_page)->obj" in time_guard
assert "navigation_active_subpage_slot() == 0" in time_guard
assert "clock_bar_subpage_title_bar_enabled() = id(subpage_title_bar_enabled).state;" in display
preference = display.split("    id: subpage_title_bar_enabled\n", 1)[1].split("\n  - platform:", 1)[0]
assert "restore_mode: RESTORE_DEFAULT_ON" in preference
assert "clock_bar_subpage_title_bar_enabled() = x;" in preference
with tempfile.TemporaryDirectory(prefix="subpage-clock-bar-") as directory:
    cpp = Path(directory) / "test.cpp"
    binary = Path(directory) / "test"
    cpp.write_text(code)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", str(root / "components/espdesktop"), str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Subpage clock bar visibility and home-only time guard passed.")
