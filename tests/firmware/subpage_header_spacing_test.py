"""Clock bar toggles must preserve each subpage's heading space."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "components/espdesktop/clock_bar.h").read_text()
start = source.index("inline std::vector<lv_obj_t *> &clock_bar_button_grid_pages()")
end = source.index("inline bool clock_bar_active_on_button_grid_page", start)
code = r'''#include <algorithm>
#include <cassert>
#include <vector>
using lv_coord_t = int;
struct lv_obj_t { int top = 0; };
constexpr int LV_PART_MAIN = 0;
void lv_obj_set_style_pad_top(lv_obj_t *page, int top, int) { page->top = top; }
int layout_updates = 0;
int lv_obj_get_style_pad_top(lv_obj_t *page, int) { return page->top; }
void lv_obj_update_layout(lv_obj_t *) { ++layout_updates; }
void clock_bar_clear_responsive_grid_cards(lv_obj_t *) {}
void clock_bar_refresh_responsive_grid_cards(lv_obj_t *) {}
''' + source[start:end] + r'''
int main() {
  lv_obj_t home, app, folder;
  clock_bar_register_button_grid_page(&home);
  clock_bar_register_button_grid_page(&app);
  clock_bar_register_button_grid_page(&folder);
  clock_bar_grid_page_insets().push_back({&app, 48});
  clock_bar_grid_page_insets().push_back({&folder, 64});
  // Repeated clock bar visibility changes must neither lose nor compound space.
  for (int top : {30, 4, 30, 4}) {
    clock_bar_set_button_grid_pages_pad_top(&home, top);
    assert(home.top == top && app.top == top + 48 && folder.top == top + 64);
  }
  const int updates = layout_updates;
  clock_bar_set_button_grid_pages_pad_top(&home, 4);
  assert(layout_updates == updates);
  // Retiring/rebuilding screens must never carry their old heading inset.
  clock_bar_unregister_button_grid_page(&app);
  assert(clock_bar_grid_page_inset(&app) == 0);
  assert(clock_bar_grid_page_inset(&folder) == 64);
  clock_bar_register_button_grid_page(&app);
  clock_bar_set_button_grid_pages_pad_top(&home, 30);
  assert(app.top == 30);
  clock_bar_clear_button_grid_pages();
  assert(clock_bar_grid_page_insets().empty());
  assert(clock_bar_button_grid_pages().empty());
}
'''
with tempfile.TemporaryDirectory(prefix="subpage-header-") as directory:
    cpp = Path(directory) / "test.cpp"
    binary = Path(directory) / "test"
    cpp.write_text(code)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Subpage heading spacing survives clock bar toggles and page rebuilds.")
