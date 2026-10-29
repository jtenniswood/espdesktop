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
#include <cassert>
#include <cstdint>
#include <functional>
#include <vector>
struct lv_obj_t { lv_obj_t *screen; };
struct lv_event_t {};
struct CompanionAppIconImageData { bool app_icon_mode = true, image_loaded = false; uint8_t *pixels = nullptr; };
struct GridRuntimeAllocation { lv_obj_t *owner; void *ptr; void (*deleter)(void *); };
template<class T> void grid_delete_runtime_ptr(void *) {}
std::vector<GridRuntimeAllocation> allocations;
auto &grid_runtime_allocations() { return allocations; }
lv_obj_t home{}, subpage{}, home_image{&home}, subpage_image{&subpage};
lv_obj_t *active = &home;
lv_obj_t *lv_scr_act() { return active; }
lv_obj_t *lv_obj_get_screen(lv_obj_t *o) { return o->screen; }
lv_obj_t *grid_find_companion_app_icon_image(lv_obj_t *o) { return o; }
unsigned applies = 0, title_refreshes = 0;
void companion_apply_cached_app_icon(CompanionAppIconImageData &source, lv_obj_t *image) {
  ++applies;
  source.image_loaded = image->screen == active;
  source.pixels = source.image_loaded ? reinterpret_cast<uint8_t *>(1) : nullptr;
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
  assert(title_refreshes == 2 && applies == 3 && child_icon.image_loaded && !main_icon.image_loaded);
  // The second screen event and periodic refresh must not restyle every hidden card.
  navigation_subpage_screen_changed(nullptr);
  assert(title_refreshes == 3 && applies == 3);
  active = &home;
  navigation_subpage_screen_changed(nullptr);
  assert(title_refreshes == 4 && applies == 5 && main_icon.image_loaded && !child_icon.image_loaded);
  navigation_subpage_clock_bar_refresh() = nullptr;
  navigation_subpage_screen_changed(nullptr);
  assert(title_refreshes == 5 && applies == 5); // Startup fallback still refreshes.
  // A failed icon load retains storage even though image_loaded is false.
  // Hiding its page must free that storage once, without touching it again.
  main_icon.image_loaded = false;
  assert(main_icon.pixels);
  active = &subpage;
  navigation_subpage_screen_changed(nullptr);
  assert(main_icon.pixels == nullptr && child_icon.image_loaded && applies == 7);
  navigation_subpage_screen_changed(nullptr);
  assert(applies == 7);
}
'''
with tempfile.TemporaryDirectory(prefix="navigation-refresh-") as directory:
    temp = Path(directory)
    (temp / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    str(temp / "test.cpp"), "-o", str(temp / "test")], check=True)
    subprocess.run([str(temp / "test")], check=True)
print("Page transitions refresh titles once and leave already-released hidden icons alone.")
