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
#define ESP_PLATFORM
#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <vector>
struct lv_obj_t { lv_obj_t *screen = nullptr; std::vector<lv_obj_t *> children{}; void *data = nullptr; bool checked = false; };
constexpr unsigned MALLOC_CAP_SPIRAM = 1, MALLOC_CAP_8BIT = 2;
size_t test_free_psram = 8 * 1024 * 1024;
size_t heap_caps_get_free_size(unsigned) { return test_free_psram; }
struct lv_event_t {};
struct CompanionAppIconImageData {
  bool app_icon_mode = true, image_loaded = false, loaded_hash_valid = false;
  bool companion_online = true, rendered_online = true, refresh_pending = false;
  std::string application_id;
  std::array<uint8_t, 32> loaded_hash{};
  struct {} accent_palette;
  uint8_t *pixels = nullptr, *display_pixels = nullptr;
  size_t display_bytes = 0;
  void release_source_pixels() { pixels = nullptr; }
};
namespace espdesktop::cover_art { using AccentPalette = decltype(CompanionAppIconImageData::accent_palette); }
namespace esphome::companion {
constexpr size_t APP_ICON_PIXEL_BYTES = 172800;
constexpr size_t APP_ICON_MEMORY_HEADROOM_BYTES = 1024 * 1024;
struct Store {
  std::map<std::string, std::array<uint8_t, 32>> hashes;
  void begin() {}
  bool hash_for(const std::string &id, std::array<uint8_t, 32> *out) {
    auto it=hashes.find(id); if(it==hashes.end()) return false; *out=it->second; return true;
  }
};
Store &app_icon_store() { static Store store; return store; }
}
struct GridRuntimeAllocation { lv_obj_t *owner; void *ptr; void (*deleter)(void *); };
template<class T> void grid_delete_runtime_ptr(void *) {}
std::vector<GridRuntimeAllocation> allocations;
unsigned registry_reads = 0;
auto &grid_runtime_allocations() { ++registry_reads; return allocations; }
lv_obj_t home{}, subpage{}, home_image{&home}, subpage_image{&subpage};
std::vector<lv_obj_t *> screens{&home, &subpage};
auto &navigation_grid_screens() { return screens; }
lv_obj_t *active = &home;
lv_obj_t *lv_scr_act() { return active; }
lv_obj_t *lv_obj_get_screen(lv_obj_t *o) { return o->screen; }
size_t lv_obj_get_child_cnt(lv_obj_t *o) { return o->children.size(); }
lv_obj_t *lv_obj_get_child(lv_obj_t *o, int32_t i) { return o->children[i]; }
void *lv_obj_get_user_data(lv_obj_t *o) { return o->data; }
// Model a costly image refresh: it must see the destination frame presented.
lv_obj_t *last_presented = nullptr;
unsigned frames_presented = 0, image_refreshes = 0;
struct lv_display_t {} display;
lv_display_t *lv_obj_get_display(lv_obj_t *) { return &display; }
void lv_refr_now(lv_display_t *d) {
  assert(d == &display); last_presented = active; ++frames_presented;
}
void refresh_visible_image_cards() {
  assert(last_presented == active && frames_presented == image_refreshes + 1);
  ++image_refreshes;
}
unsigned applies = 0, title_refreshes = 0;
constexpr int LV_STATE_CHECKED = 1;
bool lv_obj_has_state(lv_obj_t *obj, int) { return obj->checked; }
void companion_apply_app_icon_card_palette(CompanionAppIconImageData &, lv_obj_t *) {}
void companion_apply_cached_app_icon(CompanionAppIconImageData &source, lv_obj_t *image) {
  ++applies;
  const bool cached = source.application_id.empty() ||
    esphome::companion::app_icon_store().hash_for(source.application_id, &source.loaded_hash);
  source.image_loaded = image->screen == active && cached;
  source.loaded_hash_valid = cached;
  source.rendered_online = source.companion_online;
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
code += function("components/espdesktop/button_grid_grid.h", "inline lv_obj_t *grid_find_companion_app_icon_image_for_data(")
code += function("components/espdesktop/button_grid_grid.h", "inline lv_obj_t *grid_find_companion_app_icon_image(lv_obj_t *owner) {")
code += function("components/espdesktop/button_grid_grid.h", "inline void companion_refresh_app_icon_visibility() {")
code += function("components/espdesktop/button_grid_navigation.h", "inline std::function<void()> &navigation_subpage_clock_bar_refresh() {")
code += function("components/espdesktop/button_grid_navigation.h", "inline void navigation_subpage_screen_changed(lv_event_t *) {")
code += function("components/espdesktop/button_grid_navigation.h", "inline void navigation_present_page_before_image_refresh() {")
for signature in ("inline bool &companion_app_icon_work_pending() {",
                  "inline bool companion_app_icon_pixels_current(",
                  "inline void companion_refresh_cached_app_icon(",
                  "inline void companion_refresh_app_icon_connection_state(",
                  "inline void companion_process_pending_app_icon_refresh() {"):
    code += function("components/espdesktop/button_grid_grid.h", signature)
code += r'''
int main() {
  // Both return destinations are drawn before camera/artwork recovery runs.
  for (auto *destination : {&home, &subpage}) {
    active = destination;
    navigation_present_page_before_image_refresh();
    assert(last_presented == destination);
  }
  active = nullptr;
  navigation_present_page_before_image_refresh();
  assert(frames_presented == 2 && image_refreshes == 2);
  active = &home;
  CompanionAppIconImageData main_icon, child_icon;
  lv_obj_t home_owner{&home, {&home_image}}, subpage_owner{&subpage, {&subpage_image}};
  home_image.data = &main_icon;
  subpage_image.data = &child_icon;
  allocations = {{&home_owner, &main_icon, grid_delete_runtime_ptr<CompanionAppIconImageData>},
                 {&subpage_owner, &child_icon, grid_delete_runtime_ptr<CompanionAppIconImageData>}};
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
  main_icon.display_bytes = 2 * 1024 * 1024;
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
  CompanionAppIconImageData icons[13];
  lv_obj_t images[13], owners[13];
  allocations.clear();
  active = &subpage;
  for (int i = 0; i < 13; ++i) {
    images[i].screen = &home;
    icons[i].image_loaded = true;
    icons[i].pixels = reinterpret_cast<uint8_t *>(1);
    images[i].data = &icons[i];
    owners[i].children = {&images[i]};
    allocations.push_back({&owners[i], &icons[i], grid_delete_runtime_ptr<CompanionAppIconImageData>});
  }
  companion_refresh_app_icon_visibility();
  size_t retained = 0;
  for (const auto &icon : icons) if (icon.pixels) retained += esphome::companion::APP_ICON_PIXEL_BYTES;
  assert(retained == 12 * esphome::companion::APP_ICON_PIXEL_BYTES);
  assert(retained <= 2 * 1024 * 1024 && applies == 9);
  companion_refresh_app_icon_visibility();
  assert(applies == 9);
  // All nine home icons fit when only the ready-to-draw images are retained.
  CompanionAppIconImageData ready_icons[9];
  lv_obj_t ready_images[9], ready_owners[9];
  allocations.clear();
  for (int i = 0; i < 9; ++i) {
    ready_images[i].screen = &home;
    ready_icons[i].image_loaded = true;
    ready_icons[i].pixels = ready_icons[i].display_pixels = reinterpret_cast<uint8_t *>(1);
    ready_icons[i].display_bytes = 160 * 160 * 3;
    ready_images[i].data = &ready_icons[i];
    ready_owners[i].children = {&ready_images[i]};
    allocations.push_back({&ready_owners[i], &ready_icons[i], grid_delete_runtime_ptr<CompanionAppIconImageData>});
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
  // Mixed registries must not be rescanned once per icon on a screen change.
  for (int i = 0; i < 200; ++i) allocations.push_back({nullptr, nullptr, nullptr});
  registry_reads = 0;
  companion_refresh_app_icon_visibility();
  assert(registry_reads == 2); // Exactly the two visibility passes.
  // Owner-only callers still find the correct child, ignoring other widgets.
  lv_obj_t unrelated;
  ready_owners[0].children.insert(ready_owners[0].children.begin(), &unrelated);
  assert(grid_find_companion_app_icon_image(&ready_owners[0]) == &ready_images[0]);
  assert(!grid_find_companion_app_icon_image(nullptr));
  assert(!grid_find_companion_app_icon_image(&unrelated));
  assert(!grid_find_companion_app_icon_image_for_data(nullptr, &ready_icons[0]));
  assert(!grid_find_companion_app_icon_image_for_data(&ready_owners[0], nullptr));
  assert(!grid_find_companion_app_icon_image_for_data(&ready_owners[0], &main_icon));
  // Catalogue refreshes reuse pixels whose stored hash and online mode match.
  allocations.clear(); active = &home;
  CompanionAppIconImageData cached[3];
  lv_obj_t cached_images[3], cached_owners[3];
  for (int i = 0; i < 3; ++i) {
    cached[i].application_id = "app" + std::to_string(i);
    cached[i].image_loaded = cached[i].loaded_hash_valid = true;
    cached[i].loaded_hash.fill(i + 1);
    esphome::companion::app_icon_store().hashes[cached[i].application_id] = cached[i].loaded_hash;
    cached_images[i].screen = i == 2 ? &subpage : &home;
    cached_images[i].data = &cached[i];
    cached_owners[i].children = {&cached_images[i]};
    allocations.push_back({&cached_owners[i], &cached[i], grid_delete_runtime_ptr<CompanionAppIconImageData>});
  }
  unsigned before = applies;
  for (int update = 0; update < 50; ++update) companion_refresh_cached_app_icon("");
  assert(applies == before && !companion_app_icon_work_pending());
  // A changed icon is rebuilt once; an active card takes priority. No pass
  // performs the old unbounded batch of all visible icons.
  esphome::companion::app_icon_store().hashes["app0"].fill(4);
  esphome::companion::app_icon_store().hashes["app1"].fill(5);
  cached_owners[1].checked = true;
  companion_refresh_cached_app_icon("");
  assert(applies == before && cached[0].refresh_pending && cached[1].refresh_pending);
  companion_process_pending_app_icon_refresh();
  assert(applies == before + 1 && cached[0].refresh_pending && !cached[1].refresh_pending);
  assert(cached[1].loaded_hash[0] == 5);
  companion_process_pending_app_icon_refresh();
  assert(applies == before + 2 && !companion_app_icon_work_pending());
  companion_refresh_cached_app_icon("");
  assert(!companion_app_icon_work_pending());
  // Cache deletion still releases the stale image instead of preserving it.
  esphome::companion::app_icon_store().hashes.erase("app0");
  companion_refresh_cached_app_icon("app0");
  companion_process_pending_app_icon_refresh();
  assert(!cached[0].image_loaded);
  // A quick offline/online bounce can cancel unnecessary recolouring work.
  before = applies;
  companion_refresh_app_icon_connection_state(false);
  assert(applies == before && cached[1].refresh_pending);
  companion_refresh_app_icon_connection_state(true);
  companion_process_pending_app_icon_refresh();
  assert(applies == before && !companion_app_icon_work_pending());
  // Rebuilding a page while work is pending must not retain freed owners.
  esphome::companion::app_icon_store().hashes["app1"].fill(9);
  companion_refresh_cached_app_icon("app1");
  cached[1].app_icon_mode = false;
  companion_process_pending_app_icon_refresh();
  assert(applies == before && !companion_app_icon_work_pending());
  cached[1].app_icon_mode = true;
  companion_refresh_cached_app_icon("app1");
  allocations.clear();
  companion_process_pending_app_icon_refresh();
  assert(applies == before && !companion_app_icon_work_pending());
  // A larger hidden-page budget must yield to drawing/transfer memory pressure.
  ready_icons[0].image_loaded = true;
  ready_icons[0].pixels = ready_icons[0].display_pixels = reinterpret_cast<uint8_t *>(1);
  ready_icons[0].display_bytes = 160 * 160 * 3;
  allocations = {{&ready_owners[0], &ready_icons[0], grid_delete_runtime_ptr<CompanionAppIconImageData>}};
  active = &subpage;
  test_free_psram = 512 * 1024;
  companion_refresh_app_icon_visibility();
  assert(!ready_icons[0].pixels && !ready_icons[0].display_pixels && !ready_icons[0].image_loaded);
}
'''
with tempfile.TemporaryDirectory(prefix="navigation-refresh-") as directory:
    temp = Path(directory)
    (temp / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    str(temp / "test.cpp"), "-o", str(temp / "test")], check=True)
    subprocess.run([str(temp / "test")], check=True)
print("Page transitions and catalogue refreshes reuse icons; changed pixels rebuild one per turn with live-owner safety.")
