"""Exercise subpage clock-bar visibility using the production policy."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "components/espdesktop/clock_bar.h").read_text()
start = source.index("inline ClockBarVisibility clock_bar_resolve_visibility(")
end = source.index("inline bool clock_bar_should_reserve_space(", start)
code = r'''#include <cassert>
#include "display_mode_controller.h"
struct lv_obj_t {};
lv_obj_t home, subpage, screensaver;
lv_obj_t *active = &home;
lv_obj_t *lv_scr_act() { return active; }
bool clock_bar_active_on_button_grid_page(lv_obj_t *) { return active == &home || active == &subpage; }
struct ClockBarVisibility { bool reserve_space = false, visible = false; };
''' + source[start:end] + r'''
int main() {
  using espdesktop::DisplayMode;
  for (bool enabled : {false, true}) {
    for (bool scheduled_off : {false, true}) {
      for (auto *screen : {&home, &subpage, &screensaver}) {
        active = screen;
        for (auto mode : {DisplayMode::ACTIVE, DisplayMode::DIMMED, DisplayMode::CLOCK}) {
          auto result = clock_bar_resolve_visibility(enabled, &home, mode, scheduled_off);
          const bool reserve = (enabled || screen == &subpage) && !scheduled_off;
          assert(result.reserve_space == reserve);
          assert(result.visible == (reserve && screen != &screensaver && mode != DisplayMode::CLOCK));
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
with tempfile.TemporaryDirectory(prefix="subpage-clock-bar-") as directory:
    cpp = Path(directory) / "test.cpp"
    binary = Path(directory) / "test"
    cpp.write_text(code)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", str(root / "components/espdesktop"), str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Subpage clock bar visibility and home-only time guard passed.")
