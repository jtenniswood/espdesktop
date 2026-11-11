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
refresh = display[refresh_start:].split("clock_bar_set_widget_hidden(id(display_time),", 1)[0].split("{", 1)[1]
refresh = refresh.replace("${main_page_pad_top}", "40").replace("${main_page_compact_pad_top}", "4")
padding_start = source.index("inline void clock_bar_set_grid_page_pad_top(")
padding_end = source.index("inline bool clock_bar_active_on_button_grid_page(", padding_start)
registry_start = source.index("inline std::vector<lv_obj_t *> &clock_bar_button_grid_pages()")
code = r'''#include <algorithm>
#include <cassert>
#include <vector>
#include "display_mode_controller.h"
using lv_coord_t = int;
constexpr int LV_PART_MAIN = 0;
struct lv_obj_t { int top = 4; };
lv_obj_t home, subpage, app_page, screensaver;
lv_obj_t *active = &home;
lv_obj_t *lv_scr_act() { return active; }
struct ClockBarVisibility { bool reserve_space = false, visible = false; };
void clock_bar_clear_responsive_grid_cards(lv_obj_t *) {}
''' + source[registry_start:padding_start] + source[padding_end:start] + source[start:end] + r'''
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
void navigation_refresh_subpage_label() {}
int full_refreshes = 0;
bool settings_visible = false;
struct ApplyClockBar {
  void execute() {
    ++full_refreshes;
    settings_visible = clock_bar_resolve_visibility(
        clock_bar_enabled.state, &home, espdesktop::DisplayMode::ACTIVE, false).visible;
  }
} clock_bar_apply;
''' + source[padding_start:padding_end] + '\nvoid refresh() {\n' + refresh + '\n}\n' + r'''
int main() {
  using espdesktop::DisplayMode;
  clock_bar_register_button_grid_page(&subpage);
  clock_bar_register_button_grid_page(&app_page);
  // Execute the production page-change wiring with the home bar turned off.
  refresh();
  assert(home.top == 4 && subpage.top == 4 && !settings_visible);
  active = &subpage;
  refresh();
  assert(subpage.top == 4 && !settings_visible && full_refreshes == 2); // All subpages keep compact top spacing.
  const int before = updates;
  refresh();
  assert(updates == before && full_refreshes == 2); // Periodic refreshes still avoid unnecessary layout.
  active = &home;
  refresh();
  assert(home.top == 4 && subpage.top == 4 && !settings_visible && full_refreshes == 3);
  active = &app_page;
  refresh();
  assert(app_page.top == 4 && !settings_visible);
  clock_bar_enabled.state = true;
  active = &home;
  refresh();
  assert(home.top == 40 && settings_visible);
  for (bool title_bar : {false, true}) {
    clock_bar_subpage_title_bar_enabled() = title_bar;
  for (bool enabled : {false, true}) {
    for (bool scheduled_off : {false, true}) {
      for (auto *screen : {&home, &subpage, &app_page, &screensaver}) {
        active = screen;
        for (auto mode : {DisplayMode::ACTIVE, DisplayMode::DIMMED, DisplayMode::CLOCK}) {
          auto result = clock_bar_resolve_visibility(enabled, &home, mode, scheduled_off);
          const bool reserve = enabled && (screen == &home || screen == &screensaver) && !scheduled_off;
          assert(result.reserve_space == reserve);
          assert(result.visible == (reserve && screen != &screensaver && mode != DisplayMode::CLOCK));
        }
      }
    }
  }
  }
  clock_bar_unregister_button_grid_page(&subpage);
  assert(clock_bar_button_grid_pages().size() == 1);
  clock_bar_clear_button_grid_pages();
  assert(clock_bar_button_grid_pages().empty());
}
'''
# The shared rendering lambda only shows the time on the home screen.
display = (root / "common/config/display.yaml").read_text()
time_guard = display.split("bool show_time =", 1)[1].split(";", 1)[0]
assert "lv_scr_act() == id(main_page)->obj" in time_guard
assert "navigation_active_subpage_slot() == 0" in time_guard
assert "clock_bar_subpage_title_bar_enabled() = id(subpage_title_bar_enabled).state;" in display
preference = display.split("    id: subpage_title_bar_enabled\n", 1)[1].split("\n  - platform:", 1)[0]
assert "restore_mode: DISABLED" in preference
assert "bind_panel_scalar(Setting::SCREEN_SUBPAGE_TITLE_BAR" in display
for value in ("0", "1"):
    assert f'ScalarSetting::SCREEN_SUBPAGE_TITLE_BAR, "{value}"' in preference
assert "clock_bar_subpage_title_bar_enabled() = x;" in preference
with tempfile.TemporaryDirectory(prefix="subpage-clock-bar-") as directory:
    cpp = Path(directory) / "test.cpp"
    binary = Path(directory) / "test"
    cpp.write_text(code)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", str(root / "components/espdesktop"), str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Subpage clock bar visibility and home-only time guard passed.")
