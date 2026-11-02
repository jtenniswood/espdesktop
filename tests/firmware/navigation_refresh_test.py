"""Check page transitions avoid duplicate icon/title work with production code."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]

def function(path, signature):
    source = (ROOT / path).read_text()
    start = source.index(signature)
    return source[start:source.index("\n}", start) + 2]

code = r'''
#include <algorithm>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <vector>
struct lv_obj_t { lv_obj_t *screen; };
struct lv_event_t {};
struct CompanionAppIconImageData { bool app_icon_mode = true, image_loaded = false; uint8_t *pixels = nullptr, *display_pixels = nullptr; size_t display_bytes = 0; void release_source_pixels() { pixels = nullptr; } };
namespace esphome::companion { constexpr size_t APP_ICON_PIXEL_BYTES = 172800; }
struct GridRuntimeAllocation { lv_obj_t *owner; void *ptr; void (*deleter)(void *); };
template<class T> void grid_delete_runtime_ptr(void *) {}
std::vector<GridRuntimeAllocation> allocations;
auto &grid_runtime_allocations() { return allocations; }
lv_obj_t home{}, subpage{}, home_image{&home}, subpage_image{&subpage};
std::vector<lv_obj_t *> screens{&home, &subpage};
auto &navigation_grid_screens() { return screens; }
lv_obj_t *active = &home;
lv_obj_t *lv_scr_act() { return active; }
lv_obj_t *lv_obj_get_screen(lv_obj_t *o) { return o->screen; }
lv_obj_t *grid_find_companion_app_icon_image(lv_obj_t *o) { return o; }
unsigned applies = 0, title_refreshes = 0;
void companion_apply_cached_app_icon(CompanionAppIconImageData &source, lv_obj_t *image) {
  ++applies;
  source.image_loaded = image->screen == active;
  source.pixels = source.image_loaded ? reinterpret_cast<uint8_t *>(1) : nullptr;
  if (!source.image_loaded) { source.display_pixels = nullptr; source.display_bytes = 0; }
}
void navigation_refresh_subpage_label() {
  ++title_refreshes;
  companion_refresh_app_icon_visibility();
}
'''
# Forward declaration needed by the title callback double.
code = code.replace("void navigation_refresh_subpage_label()", "void companion_refresh_app_icon_visibility();\nvoid navigation_refresh_subpage_label()")
code += function("components/espdesktop/button_grid_grid.h", "inline void companion_refresh_app_icon_visibility() {")
code += function("components/espdesktop/button_grid_navigation.h", "inline std::function<void()> &navigation_subpage_clock_bar_refresh() {")
code += function("components/espdesktop/button_grid_navigation.h", "inline void navigation_subpage_screen_changed(lv_event_t *) {")
code += r'''
int main() {
  CompanionAppIconImageData main_icon, child_icon;
  allocations = {{&home_image, &main_icon, grid_delete_runtime_ptr<CompanionAppIconImageData>},
                 {&subpage_image, &child_icon, grid_delete_runtime_ptr<CompanionAppIconImageData>}};
  navigation_subpage_clock_bar_refresh() = [] { navigation_refresh_subpage_label(); };
  navigation_subpage_screen_changed(nullptr);
  assert(title_refreshes == 1 && applies == 1 && main_icon.image_loaded);
  active = &subpage;
  navigation_subpage_screen_changed(nullptr);
  assert(title_refreshes == 2 && applies == 2 && child_icon.image_loaded && main_icon.image_loaded);
  // Duplicate events and returning home reuse both decoded and scaled pixels.
  navigation_subpage_screen_changed(nullptr);
  active = &home;
  navigation_subpage_screen_changed(nullptr);
  assert(title_refreshes == 4 && applies == 2);
  navigation_subpage_clock_bar_refresh() = nullptr;
  navigation_subpage_screen_changed(nullptr);
  assert(title_refreshes == 5 && applies == 2);
  // Existing icon update/connection callbacks release stale hidden pixels.
  companion_apply_cached_app_icon(child_icon, &subpage_image);
  active = &subpage;
  navigation_subpage_screen_changed(nullptr);
  assert(child_icon.image_loaded && applies == 4);
  // Failed loads must release their leftover allocation when hidden.
  child_icon.image_loaded = false;
  active = &home;
  navigation_subpage_screen_changed(nullptr);
  assert(child_icon.pixels == nullptr && applies == 5);
  // Scaled pixels count toward the hidden budget as well as source pixels.
  main_icon.display_bytes = 1024 * 1024;
  active = &subpage;
  navigation_subpage_screen_changed(nullptr);
  assert(!main_icon.pixels && child_icon.image_loaded && applies == 7);
  navigation_subpage_screen_changed(nullptr);
  assert(applies == 7);
  // Camera, sleep, and other non-grid screens reclaim the complete cache.
  lv_obj_t camera{};
  active = &camera;
  navigation_subpage_screen_changed(nullptr);
  assert(!main_icon.pixels && !child_icon.pixels && applies == 8);
  navigation_subpage_screen_changed(nullptr);
  assert(applies == 8);
  // Several individually small entries must share the same total budget.
  CompanionAppIconImageData icons[7];
  lv_obj_t images[7];
  allocations.clear();
  active = &subpage;
  for (int i = 0; i < 7; ++i) {
    images[i].screen = &home;
    icons[i].image_loaded = true;
    icons[i].pixels = reinterpret_cast<uint8_t *>(1);
    allocations.push_back({&images[i], &icons[i], grid_delete_runtime_ptr<CompanionAppIconImageData>});
  }
  companion_refresh_app_icon_visibility();
  size_t retained = 0;
  for (const auto &icon : icons) if (icon.pixels) retained += esphome::companion::APP_ICON_PIXEL_BYTES;
  assert(retained == 6 * esphome::companion::APP_ICON_PIXEL_BYTES);
  assert(retained <= 1024 * 1024 && applies == 9);
  companion_refresh_app_icon_visibility();
  assert(applies == 9);
  // All nine home icons fit when only the ready-to-draw images are retained.
  CompanionAppIconImageData ready_icons[9];
  lv_obj_t ready_images[9];
  allocations.clear();
  for (int i = 0; i < 9; ++i) {
    ready_images[i].screen = &home;
    ready_icons[i].image_loaded = true;
    ready_icons[i].pixels = ready_icons[i].display_pixels = reinterpret_cast<uint8_t *>(1);
    ready_icons[i].display_bytes = 160 * 160 * 3;
    allocations.push_back({&ready_images[i], &ready_icons[i], grid_delete_runtime_ptr<CompanionAppIconImageData>});
  }
  companion_refresh_app_icon_visibility();
  for (const auto &icon : ready_icons) assert(!icon.pixels && icon.display_pixels && icon.image_loaded);
  assert(applies == 9);
  active = &home;
  companion_refresh_app_icon_visibility();
  assert(applies == 9); // Back to home needs no flash reads/resizing.
  active = &camera;
  companion_refresh_app_icon_visibility();
  for (const auto &icon : ready_icons) assert(!icon.pixels && !icon.display_pixels && !icon.image_loaded);
  assert(applies == 18);
}
'''
with tempfile.TemporaryDirectory(prefix="navigation-refresh-") as directory:
    temp = Path(directory)
    (temp / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    str(temp / "test.cpp"), "-o", str(temp / "test")], check=True)
    subprocess.run([str(temp / "test")], check=True)
print("Page transitions reuse icons within a bounded cache and reclaim pixels for non-grid screens.")
