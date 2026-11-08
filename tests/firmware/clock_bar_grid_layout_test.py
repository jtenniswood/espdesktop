#!/usr/bin/env python3
"""Check the production clock-bar spacing path without an ESP32 or LVGL."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "components/espdesktop/clock_bar.h").read_text()
start = source.index("inline void clock_bar_set_grid_page_pad_top(")
end = source.index("inline bool clock_bar_active_on_button_grid_page(", start)
production = source[start:end]
harness = r"""
#include <cassert>
#include <vector>
using lv_coord_t = int;
constexpr int LV_PART_MAIN = 0;
struct lv_obj_t {
  int padding = 10;
  int writes = 0;
  int layouts = 0;
  int responsive_refreshes = 0;
};
int lv_obj_get_style_pad_top(lv_obj_t *page, int) { return page->padding; }
void lv_obj_set_style_pad_top(lv_obj_t *page, int padding, int) {
  page->padding = padding;
  ++page->writes;
}
void lv_obj_update_layout(lv_obj_t *page) { ++page->layouts; }
void clock_bar_refresh_responsive_grid_cards(lv_obj_t *page) {
  ++page->responsive_refreshes;
}
std::vector<lv_obj_t *> &clock_bar_button_grid_pages() {
  static std::vector<lv_obj_t *> pages;
  return pages;
}
// @production
int main() {
  lv_obj_t home;
  std::vector<lv_obj_t> subpages(24);
  auto &pages = clock_bar_button_grid_pages();
  pages = {nullptr, &home};
  for (auto &page : subpages) pages.push_back(&page);
  // Initial setting reaches hidden pages and resizes their spanning cards.
  clock_bar_set_button_grid_pages_pad_top(&home, 60);
  for (auto *page : pages) {
    if (!page) continue;
    assert(page->padding == 60 && page->writes == 1);
    assert(page->layouts == 1 && page->responsive_refreshes == 1);
  }
  // Repeated navigation refreshes must do no layout or responsive-card work.
  for (int tap = 0; tap < 100; ++tap)
    clock_bar_set_button_grid_pages_pad_top(&home, 60);
  for (auto *page : pages) {
    if (!page) continue;
    assert(page->writes == 1 && page->layouts == 1);
    assert(page->responsive_refreshes == 1);
  }
  // A new/rebuilt page gets its spacing without relaying out other pages.
  lv_obj_t added;
  pages.push_back(&added);
  clock_bar_set_button_grid_pages_pad_top(nullptr, 60);
  assert(added.padding == 60 && added.layouts == 1);
  assert(home.layouts == 1 && subpages.front().layouts == 1);
  // Toggling the clock bar still updates all pages, including spanning cards.
  clock_bar_set_button_grid_pages_pad_top(&home, 10);
  for (auto *page : pages) {
    if (!page) continue;
    assert(page->padding == 10 && page->writes == 2);
    assert(page->layouts == 2 && page->responsive_refreshes == 2);
  }
}
"""
with tempfile.TemporaryDirectory(prefix="clock-bar-grid-layout-") as directory:
    cpp = Path(directory) / "test.cpp"
    binary = Path(directory) / "test"
    cpp.write_text(harness.replace("// @production", production))
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra",
                    "-Werror", str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Clock-bar grid layout checks passed")
