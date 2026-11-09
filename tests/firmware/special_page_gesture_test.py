"""Exercise the production swipe guard against lock, modal and screen state."""
from pathlib import Path
import subprocess
import sys
import tempfile
from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
header = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
press_state = header[header.index('struct NavigationGridGesturePress {'):header.index('inline void navigation_grid_screen_gesture(')]
return_handler = definition(header, 'navigation_return_from_special_page')[1]
handler = definition(header, 'navigation_grid_screen_gesture')[1]
label_handler = definition(header, 'navigation_active_subpage_label')[1]
registration = definition(header, 'navigation_register_grid_screen_gesture')[1]
stubs = r'''
#include <algorithm>
#include <cassert>
#define ESP_LOGD(...) ((void)0)
#include <vector>
#include <string>
using lv_coord_t = int;
constexpr int NAVIGATION_SPECIAL_PAGE_SLOT=49, LV_SCR_LOAD_ANIM_NONE=0;
constexpr int LV_EVENT_GESTURE=1, LV_DIR_TOP=1, LV_DIR_RIGHT=2, LV_DIR_LEFT=3, LV_EVENT_PRESSED=4, LV_EVENT_RELEASED=5, LV_INDEV_TYPE_POINTER=1;
struct lv_obj_t { int height=480, width=480; bool valid=true; } grid, other, overlay, back_button, special, subgrid;
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
void lv_obj_send_event(lv_obj_t *o, int code, void *data) {
  assert(o == &back_button && code == LV_EVENT_PRESSED && data == nullptr);
  // The rest of this press must be consumed before the Back/Close action runs.
  assert(waited == returned + 1);
  ++returned;
}
bool navigation_open_special_page() { ++opened; return true; }
void lv_indev_wait_release(lv_indev_t *) { ++waited; }
lv_obj_t *previous=nullptr, *home=&grid;
lv_obj_t *&navigation_special_page_previous_screen() { return previous; }
lv_obj_t *&navigation_special_page_main_screen() { return home; }
int restored=0;
void navigation_hide_modals() {}
void navigation_present_page_before_image_refresh() { ++restored; }
void lv_scr_load_anim(lv_obj_t *screen,int,int,int,bool) { active=screen; }
lv_indev_t *lv_indev_get_next(lv_indev_t *p) { return p ? nullptr : &device; }
int lv_indev_get_type(lv_indev_t *) { return LV_INDEV_TYPE_POINTER; }
void lv_indev_set_gesture_min_distance(lv_indev_t *, int value) { distance=value; }
void lv_indev_set_gesture_min_velocity(lv_indev_t *, int value) { velocity=value; }
void lv_indev_add_event_cb(lv_indev_t *, void (*)(lv_event_t *), int, void *) { ++callbacks; }
struct NavigationSubpageEntry {
  std::string kind, title;
  lv_obj_t *screen=nullptr, *back_button=nullptr;
} entry, special_entry;
std::vector<NavigationSubpageEntry> subpages;
std::vector<NavigationSubpageEntry> &navigation_subpages() { return subpages; }
struct NavigationHomeTargetEntry { std::string label, config; } parent;
int selected_slot = 0;
bool has_parent = false;
int navigation_active_subpage_slot() { return selected_slot; }
NavigationSubpageEntry *navigation_find_slot(int slot) { return slot == NAVIGATION_SPECIAL_PAGE_SLOT ? &special_entry : slot ? &entry : nullptr; }
NavigationHomeTargetEntry *navigation_find_slot_target(int) { return has_parent ? &parent : nullptr; }
struct ParsedCfg { std::string entity; };
ParsedCfg parse_cfg(const std::string &) { return {}; }
bool companion_app_shortcuts_enabled(const ParsedCfg &) { return false; }
namespace companion_shortcut_catalog { std::string app_label(const std::string &) { return "App"; } }
'''
checks = r'''
void send(int code) { event.code=code; navigation_grid_screen_gesture(&event); }
void begin(int x, int y) { device.point={x,y}; send(LV_EVENT_PRESSED); }
void gesture(int x, int y, int direction) {
  device.point={x,y}; device.direction=direction; send(LV_EVENT_GESTURE);
}
int main() {
  navigation_register_grid_screen_gesture(nullptr);
  assert(callbacks==0);
  navigation_register_grid_screen_gesture(&grid);
  assert(distance==24 && velocity==1 && callbacks==3);
  navigation_register_grid_screen_gesture(&grid);
  assert(callbacks==3 && screens.size()==1);
  assert(navigation_active_subpage_label().empty());
  selected_slot=NAVIGATION_SPECIAL_PAGE_SLOT; special_entry.kind="special"; special_entry.title="Office: Tools";
  assert(navigation_active_subpage_label().empty());
  special_entry.title.clear(); assert(navigation_active_subpage_label().empty());
  selected_slot=1; entry.kind="subpage"; has_parent=true; parent.label="Rooms";
  assert(navigation_active_subpage_label()=="Rooms");
  entry.kind="app_shortcuts"; assert(navigation_active_subpage_label().empty());

  navigation_grid_screen_gesture(nullptr);
  // A gesture without a touch-down never uses stale coordinates.
  gesture(30,240,LV_DIR_RIGHT);
  assert(opened==0 && returned==0 && waited==0);
  begin(40,240); gesture(70,240,LV_DIR_RIGHT); // Home has no Back action.
  assert(returned==0 && waited==0);
  entry.screen=&grid; entry.back_button=&back_button; subpages.push_back(entry);
  for (int direction : {LV_DIR_RIGHT, LV_DIR_TOP}) {
    const int x=direction==LV_DIR_RIGHT ? 40 : 240;
    const int y=direction==LV_DIR_TOP ? 440 : 240;
    begin(x,y); locked=true; gesture(x,y,direction); locked=false;
    begin(x,y); allowed=false; gesture(x,y,direction); allowed=true;
    begin(x,y); modal.overlay=&overlay; gesture(x,y,direction); modal.overlay=nullptr;
    begin(x,y); nested.overlay=&overlay; gesture(x,y,direction); nested.overlay=nullptr;
    begin(x,y); active=&other; gesture(x,y,direction); active=&grid;
    begin(x,y); has_pointer=false; gesture(x,y,direction); has_pointer=true;
    // A new press on an excluded screen cannot inherit the previous origin.
    active=&other; begin(x,y); active=&grid; gesture(x,y,direction);
    begin(x,y); send(LV_EVENT_RELEASED); gesture(x,y,direction);
  }
  begin(200,240); gesture(230,240,LV_DIR_RIGHT);
  begin(-1,240); gesture(30,240,LV_DIR_RIGHT);
  begin(40,240); grid.width=0; gesture(70,240,LV_DIR_RIGHT); grid.width=480;
  begin(40,240); gesture(10,240,LV_DIR_LEFT);
  begin(40,240); back_button.valid=false; gesture(70,240,LV_DIR_RIGHT); back_button.valid=true;
  begin(40,240); subpages[0].back_button=nullptr; gesture(70,240,LV_DIR_RIGHT);
  subpages[0].back_button=&back_button;
  begin(240,100); gesture(240,70,LV_DIR_TOP);
  assert(returned==0 && opened==0 && waited==0);
  for (const auto &kind : {"subpage", "app_shortcuts"}) {
    subpages[0].kind=kind;
    begin(40,240); gesture(70,240,LV_DIR_RIGHT);
  }
  assert(returned==2 && waited==2);
  // A slow swipe crosses the edge zone before LVGL recognizes 24 px travel.
  begin(70,240);
  for (int x=72; x<=96; x+=2) { device.vector={2,0}; device.point={x,240}; }
  gesture(96,240,LV_DIR_RIGHT);
  assert(returned==3 && waited==3);
  // A second gesture from the same held touch cannot navigate again.
  gesture(100,240,LV_DIR_RIGHT);
  assert(returned==3 && waited==3);
  // Moving toward the edge from outside never qualifies.
  begin(81,240); gesture(70,240,LV_DIR_RIGHT);
  assert(returned==3);
  grid.width=800; begin(130,240); gesture(156,240,LV_DIR_RIGHT);
  assert(returned==4 && waited==4);
  begin(134,240); gesture(160,240,LV_DIR_RIGHT);
  assert(returned==4);
  begin(240,440); gesture(240,410,LV_DIR_TOP);
  assert(opened==0 && returned==4 && waited==4);
}
'''
with tempfile.TemporaryDirectory() as tmp:
    source=Path(tmp)/'test.cpp'
    binary=Path(tmp)/'test'
    source.write_text(stubs+press_state+return_handler+handler+registration+label_handler+checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror',str(source),'-o',str(binary)],check=True)
    subprocess.run([str(binary)],check=True)
print('Left-edge Back and gesture guards passed. Bottom-edge swipes do not navigate.')
