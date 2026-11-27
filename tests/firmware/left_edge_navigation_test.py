"""Exercise the production swipe guard against lock, modal and screen state."""
from pathlib import Path
import subprocess
import sys
import tempfile
from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
header = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
press_state = header[header.index('struct NavigationGridGesturePress {'):header.index('inline void navigation_grid_screen_gesture(')]
handler = definition(header, 'navigation_grid_screen_gesture')[1]
label_handler = definition(header, 'navigation_active_subpage_label')[1]
registration = definition(header, 'navigation_register_grid_screen_gesture')[1]
stubs = r'''
#include <algorithm>
#include <cassert>
#include <cstdio>
#define ESP_LOGD(...) ((void)0)
#include <functional>
#include <vector>
#include <string>
using lv_coord_t = int;
constexpr int LV_EVENT_GESTURE=1, LV_DIR_TOP=1, LV_DIR_RIGHT=2, LV_DIR_LEFT=3,
    LV_EVENT_PRESSED=4, LV_EVENT_RELEASED=5, LV_INDEV_TYPE_POINTER=1,
    LV_EVENT_SHORT_CLICKED=6, LV_DIR_BOTTOM=7, LV_OBJ_FLAG_SCROLLABLE=8;
struct lv_obj_t { int height=480, width=480; bool valid=true; } grid, other, subpage, overlay, back_button;
struct lv_point_t { int x=0,y=0; };
struct lv_indev_t { int direction=LV_DIR_TOP; lv_point_t point{0,420}, vector{0,-50}; } device;
struct lv_event_t { int code=LV_EVENT_GESTURE; } event;
struct Modal { lv_obj_t *overlay=nullptr; } modal, nested;
bool allowed=true, locked=false, has_pointer=true, popup_open=false, drag_start=false;
int screen_index=0, screen_count=1;
lv_obj_t *active=&grid;
int waited=0, returned=0, distance=50, velocity=3, callbacks=0;
int swiped_back=0, switched_to=99, action_runs=0;
std::string last_action;
std::vector<lv_obj_t *> screens{&grid};
int lv_event_get_code(lv_event_t *e) { return e->code; }
lv_indev_t *lv_indev_active() { return has_pointer ? &device : nullptr; }
int lv_indev_get_gesture_dir(lv_indev_t *p) { return p->direction; }
bool navigation_display_mode_allows_grid_gesture() { return allowed; }
bool screen_lock_enabled() { return locked; }
bool image_popup_open() { return popup_open; }
bool navigation_gesture_started_on_drag(lv_obj_t *, const lv_point_t &, int) { return drag_start; }
void touch_record_press(lv_indev_t *, const lv_point_t &) {}
void lv_obj_clear_flag(lv_obj_t *, int) {}
int navigation_screen_index(lv_obj_t *) { return screen_index; }
int navigation_screen_count() { return screen_count; }
int navigation_switch_screen(int target, lv_indev_t *) { switched_to=target; return true; }
int navigation_swipe_back(lv_indev_t *, lv_obj_t *) { ++swiped_back; return true; }
std::function<std::string(int)> &navigation_swipe_action_provider() {
  static std::function<std::string(int)> provider;
  return provider;
}
int navigation_run_swipe_action(const std::string &action, lv_indev_t *) {
  last_action=action; ++action_runs; return true;
}
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
  assert(o == &back_button && code == LV_EVENT_SHORT_CLICKED && data == nullptr);
  // The rest of this press must be consumed before the Back action runs.
  assert(waited == returned + 1);
  ++returned;
}
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
  selected_slot=1; entry.kind="subpage"; has_parent=true; parent.label="Rooms";
  assert(navigation_active_subpage_label()=="Rooms");
  entry.kind="app_shortcuts"; assert(navigation_active_subpage_label().empty());

  navigation_grid_screen_gesture(nullptr);
  // A gesture with no press event uses the current point; with one screen it
  // cannot page.
  gesture(30,240,LV_DIR_RIGHT);
  assert(returned==0 && waited==0 && swiped_back==0 && switched_to==99);

  // Home screen with no extra screens cannot page.
  screen_count=1;
  begin(40,240); gesture(70,240,LV_DIR_RIGHT);
  assert(returned==0 && waited==0 && switched_to==99);

  // Subpage: a right swipe anywhere returns to the parent, a left swipe runs
  // the same Back action, and vertical swipes do not navigate.
  screens.push_back(&subpage); active=&subpage; screen_index=-1;
  entry.screen=&subpage; entry.back_button=&back_button; subpages.push_back(entry);
  for (const auto &kind : {"subpage", "app_shortcuts"}) {
    subpages[0].kind=kind;
    begin(200,240); gesture(230,240,LV_DIR_RIGHT);
  }
  assert(returned==2 && waited==2);
  begin(200,240); gesture(170,240,LV_DIR_LEFT);
  assert(swiped_back==1 && returned==2);
  begin(240,100); gesture(240,70,LV_DIR_TOP);
  begin(240,380); gesture(240,410,LV_DIR_BOTTOM);
  assert(returned==2 && swiped_back==1 && action_runs==0);

  // Drag controls keep the touch; ordinary cards do not.
  drag_start=true;
  begin(200,240); gesture(230,240,LV_DIR_RIGHT);
  begin(200,240); gesture(170,240,LV_DIR_LEFT);
  drag_start=false;
  assert(returned==2 && swiped_back==1);

  // Guards: lock, display mode, modals, popup, non-grid screens and pointers.
  for (int direction : {LV_DIR_RIGHT, LV_DIR_LEFT}) {
    begin(200,240); locked=true; gesture(200,240,direction); locked=false;
    begin(200,240); allowed=false; gesture(200,240,direction); allowed=true;
    begin(200,240); modal.overlay=&overlay; gesture(200,240,direction); modal.overlay=nullptr;
    begin(200,240); nested.overlay=&overlay; gesture(200,240,direction); nested.overlay=nullptr;
    begin(200,240); popup_open=true; gesture(200,240,direction); popup_open=false;
    begin(200,240); active=&other; gesture(200,240,direction); active=&subpage;
    begin(200,240); has_pointer=false; gesture(200,240,direction); has_pointer=true;
    // A new press on an excluded screen cannot inherit the previous origin.
    active=&other; begin(200,240); active=&subpage; gesture(200,240,direction);
  }
  assert(returned==2 && swiped_back==1);
  // An invalid Back control cannot run.
  begin(200,240); back_button.valid=false; gesture(230,240,LV_DIR_RIGHT); back_button.valid=true;
  assert(returned==2);

  // Home paging uses both directions; releases are consumed first.
  active=&grid; screen_index=0; screen_count=2; waited=0;
  begin(200,240); gesture(230,240,LV_DIR_LEFT);
  assert(waited==1 && switched_to==1);
  begin(200,240); gesture(170,240,LV_DIR_RIGHT);
  assert(waited==2 && switched_to==-1);
  // A disabled card sends no press event, but its swipe must still page.
  gesture(230,240,LV_DIR_LEFT);
  assert(waited==3 && switched_to==1);
  // Dragging a card never pages.
  drag_start=true; begin(200,240); gesture(230,240,LV_DIR_LEFT); drag_start=false;
  assert(waited==3);

  // Vertical swipes run the configured action only on home screens.
  auto &provider = navigation_swipe_action_provider();
  provider = [](int direction) { return direction == LV_DIR_TOP ? "next_screen" : "home"; };
  begin(240,100); gesture(240,70,LV_DIR_TOP);
  begin(240,380); gesture(240,410,LV_DIR_BOTTOM);
  assert(waited==5 && action_runs==2 && last_action=="home");
  provider = {};
  begin(240,100); gesture(240,70,LV_DIR_TOP);
  assert(waited==5 && action_runs==2);
}
'''
with tempfile.TemporaryDirectory() as tmp:
    source=Path(tmp)/'test.cpp'
    binary=Path(tmp)/'test'
    source.write_text(stubs+press_state+handler+registration+label_handler+checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror',str(source),'-o',str(binary)],check=True)
    subprocess.run([str(binary)],check=True)
print('Swipe paging, subpage Back and gesture guards passed.')
