"""Exercise the production swipe guard against lock, modal and screen state."""
from pathlib import Path
import subprocess
import sys
import tempfile
from generate_media_lifecycle_integration import definition

ROOT = Path(__file__).resolve().parents[2]
header = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
handler = definition(header, 'navigation_grid_screen_gesture')[1]
label_handler = definition(header, 'navigation_active_subpage_label')[1]
registration = definition(header, 'navigation_register_grid_screen_gesture')[1]
stubs = r'''
#include <algorithm>
#include <cassert>
#include <vector>
#include <string>
using lv_coord_t = int;
constexpr int LV_EVENT_GESTURE=1, LV_DIR_TOP=1, LV_DIR_RIGHT=2, LV_DIR_LEFT=3, LV_EVENT_PRESSED=4, LV_INDEV_TYPE_POINTER=1;
struct lv_obj_t { int height=480, width=480; bool valid=true; } grid, other, overlay, back_button;
struct lv_point_t { int x=0,y=0; };
struct lv_indev_t { int direction=LV_DIR_TOP; lv_point_t point{0,420}, vector{0,-50}; } device;
struct lv_event_t { int code=LV_EVENT_GESTURE; } event;
struct Modal { lv_obj_t *overlay=nullptr; } modal, nested;
bool allowed=true, locked=false, has_pointer=true;
lv_obj_t *active=&grid;
int opened=0, waited=0, returned=0, distance=50, velocity=3, callbacks=0;
std::vector<lv_obj_t *> screens{&grid};
int lv_event_get_code(lv_event_t *e) { return e->code; }
lv_indev_t *lv_indev_active() { return has_pointer ? &device : nullptr; }
int lv_indev_get_gesture_dir(lv_indev_t *p) { return p->direction; }
bool navigation_display_mode_allows_grid_gesture() { return allowed; }
bool screen_lock_enabled() { return locked; }
Modal &control_modal_active() { return modal; }
Modal &control_modal_nested_active() { return nested; }
lv_obj_t *lv_scr_act() { return active; }
std::vector<lv_obj_t *> &navigation_grid_screens() { return screens; }
void lv_indev_get_point(lv_indev_t *p,lv_point_t *out) { *out=p->point; }
void lv_indev_get_vect(lv_indev_t *p,lv_point_t *out) { *out=p->vector; }
int lv_obj_get_height(lv_obj_t *o) { return o->height; }
int lv_obj_get_width(lv_obj_t *o) { return o->width; }
bool lv_obj_is_valid(lv_obj_t *o) { return o->valid; }
void lv_event_send(lv_obj_t *o, int code, void *data) {
  assert(o == &back_button && code == LV_EVENT_PRESSED && data == nullptr);
  // The rest of this press must be consumed before the Back/Close action runs.
  assert(waited == returned + 1);
  ++returned;
}
bool navigation_open_special_page() { ++opened; return true; }
void lv_indev_wait_release(lv_indev_t *) { ++waited; }
lv_indev_t *lv_indev_get_next(lv_indev_t *p) { return p ? nullptr : &device; }
int lv_indev_get_type(lv_indev_t *) { return LV_INDEV_TYPE_POINTER; }
void lv_indev_set_gesture_min_distance(lv_indev_t *, int value) { distance=value; }
void lv_indev_set_gesture_min_velocity(lv_indev_t *, int value) { velocity=value; }
void lv_indev_add_event_cb(lv_indev_t *, void (*)(lv_event_t *), int, void *) { ++callbacks; }
struct NavigationSubpageEntry {
  std::string kind, title;
  lv_obj_t *screen=nullptr, *back_button=nullptr;
} entry;
std::vector<NavigationSubpageEntry> subpages;
std::vector<NavigationSubpageEntry> &navigation_subpages() { return subpages; }
struct NavigationHomeTargetEntry { std::string label, config; } parent;
int selected_slot = 0;
bool has_parent = false;
int navigation_active_subpage_slot() { return selected_slot; }
NavigationSubpageEntry *navigation_find_slot(int slot) { return slot ? &entry : nullptr; }
NavigationHomeTargetEntry *navigation_find_slot_target(int) { return has_parent ? &parent : nullptr; }
struct ParsedCfg { std::string entity; };
ParsedCfg parse_cfg(const std::string &) { return {}; }
bool companion_app_shortcuts_enabled(const ParsedCfg &) { return false; }
namespace companion_shortcut_catalog { std::string app_label(const std::string &) { return "App"; } }
'''
checks = r'''
int main() {
  navigation_register_grid_screen_gesture(nullptr);
  assert(callbacks==0);
  navigation_register_grid_screen_gesture(&grid);
  // A short swipe and slower movement are accepted by the configured recognizer.
  assert(distance==24 && velocity==1 && callbacks==1);
  navigation_register_grid_screen_gesture(&grid);
  assert(callbacks==1 && screens.size()==1);
  assert(navigation_active_subpage_label().empty());
  selected_slot = -1; entry.kind = "special"; entry.title = "Office: Tools";
  assert(navigation_active_subpage_label() == "Office: Tools");
  entry.title.clear();
  assert(navigation_active_subpage_label().empty());
  selected_slot = 1; entry.kind = "subpage"; has_parent = true; parent.label = "Rooms";
  assert(navigation_active_subpage_label() == "Rooms");
  entry.kind = "app_shortcuts";
  assert(navigation_active_subpage_label().empty());
  entry.kind = "subpage";
  navigation_grid_screen_gesture(nullptr);
  locked=true; navigation_grid_screen_gesture(&event); locked=false;
  allowed=false; navigation_grid_screen_gesture(&event); allowed=true;
  modal.overlay=&overlay; navigation_grid_screen_gesture(&event); modal.overlay=nullptr;
  nested.overlay=&overlay; navigation_grid_screen_gesture(&event); nested.overlay=nullptr;
  active=&other; navigation_grid_screen_gesture(&event); active=&grid;
  device.direction=LV_DIR_LEFT; navigation_grid_screen_gesture(&event); device.direction=LV_DIR_TOP;
  has_pointer=false; navigation_grid_screen_gesture(&event); has_pointer=true;
  device.point.y=100; navigation_grid_screen_gesture(&event); device.point.y=420;
  assert(opened==0 && waited==0);
  navigation_grid_screen_gesture(&event);
  assert(opened==1 && waited==1);
  // A gesture delivered with a small per-sample vector still opens at the bottom.
  device.point.y=445; device.vector.y=-2;
  navigation_grid_screen_gesture(&event);
  assert(opened==2 && waited==2);

  waited=0;
  device.direction=LV_DIR_RIGHT;
  device.point={70,240}; device.vector={30,0};
  // Home has no back action; short edge swipes leave it alone.
  navigation_grid_screen_gesture(&event);
  assert(returned==0 && waited==0);
  entry.screen=&grid; entry.back_button=&back_button;
  subpages.push_back(entry);
  locked=true; navigation_grid_screen_gesture(&event); locked=false;
  allowed=false; navigation_grid_screen_gesture(&event); allowed=true;
  modal.overlay=&overlay; navigation_grid_screen_gesture(&event); modal.overlay=nullptr;
  nested.overlay=&overlay; navigation_grid_screen_gesture(&event); nested.overlay=nullptr;
  active=&other; navigation_grid_screen_gesture(&event); active=&grid;
  has_pointer=false; navigation_grid_screen_gesture(&event); has_pointer=true;
  event.code=LV_EVENT_PRESSED; navigation_grid_screen_gesture(&event); event.code=LV_EVENT_GESTURE;
  device.direction=LV_DIR_LEFT; navigation_grid_screen_gesture(&event); device.direction=LV_DIR_RIGHT;
  device.point.x=200; navigation_grid_screen_gesture(&event); device.point.x=70;
  grid.width=0; navigation_grid_screen_gesture(&event); grid.width=480;
  device.vector.x=100; navigation_grid_screen_gesture(&event); device.vector.x=30;
  back_button.valid=false; navigation_grid_screen_gesture(&event); back_button.valid=true;
  subpages[0].back_button=nullptr; navigation_grid_screen_gesture(&event);
  subpages[0].back_button=&back_button;
  assert(returned==0 && waited==0 && opened==2);

  // Regular, app and special pages invoke their existing Back/Close action.
  for (const auto &kind : {"subpage", "app_shortcuts", "special"}) {
    subpages[0].kind=kind;
    navigation_grid_screen_gesture(&event);
  }
  assert(returned==3 && waited==3 && opened==2);
  // Match bottom-edge handling of slower per-sample movement and scaled edges.
  device.point.x=30; device.vector.x=2;
  navigation_grid_screen_gesture(&event);
  assert(returned==4 && waited==4);
  grid.width=800; device.point.x=150; device.vector.x=24;
  navigation_grid_screen_gesture(&event);
  assert(returned==5 && waited==5);
  device.point.x=160;
  navigation_grid_screen_gesture(&event);
  assert(returned==5 && waited==5);
}
'''
with tempfile.TemporaryDirectory() as tmp:
    source=Path(tmp)/'test.cpp'
    binary=Path(tmp)/'test'
    source.write_text(stubs+handler+registration+label_handler+checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror',str(source),'-o',str(binary)],check=True)
    subprocess.run([str(binary)],check=True)
print('Special-page gesture guards passed for Screen Lock, modals, setup/screensaver modes and bottom/left-edge swipes.')
