"""Exercise the production swipe guard against lock, modal and screen state."""
from pathlib import Path
import subprocess
import sys
import tempfile
from generate_media_lifecycle_integration import definition

ROOT = Path(__file__).resolve().parents[2]
header = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
handler = definition(header, 'navigation_grid_screen_gesture')[1]
stubs = r'''
#include <algorithm>
#include <cassert>
#include <vector>
using lv_coord_t = int;
constexpr int LV_EVENT_GESTURE=1, LV_DIR_TOP=1;
struct lv_obj_t { int height=480; } grid, other, overlay;
struct lv_point_t { int x=0,y=0; };
struct lv_indev_t { int direction=LV_DIR_TOP; lv_point_t point{0,420}, vector{0,-50}; } device;
struct lv_event_t { int code=LV_EVENT_GESTURE; } event;
struct Modal { lv_obj_t *overlay=nullptr; } modal, nested;
bool allowed=true, locked=false, has_pointer=true;
lv_obj_t *active=&grid;
int opened=0, waited=0;
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
bool navigation_open_special_page() { ++opened; return true; }
void lv_indev_wait_release(lv_indev_t *) { ++waited; }
'''
checks = r'''
int main() {
  navigation_grid_screen_gesture(nullptr);
  locked=true; navigation_grid_screen_gesture(&event); locked=false;
  allowed=false; navigation_grid_screen_gesture(&event); allowed=true;
  modal.overlay=&overlay; navigation_grid_screen_gesture(&event); modal.overlay=nullptr;
  nested.overlay=&overlay; navigation_grid_screen_gesture(&event); nested.overlay=nullptr;
  active=&other; navigation_grid_screen_gesture(&event); active=&grid;
  device.direction=2; navigation_grid_screen_gesture(&event); device.direction=LV_DIR_TOP;
  has_pointer=false; navigation_grid_screen_gesture(&event); has_pointer=true;
  device.point.y=100; navigation_grid_screen_gesture(&event); device.point.y=420;
  assert(opened==0 && waited==0);
  navigation_grid_screen_gesture(&event);
  assert(opened==1 && waited==1);
}
'''
with tempfile.TemporaryDirectory() as tmp:
    source=Path(tmp)/'test.cpp'
    binary=Path(tmp)/'test'
    source.write_text(stubs+handler+checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror',str(source),'-o',str(binary)],check=True)
    subprocess.run([str(binary)],check=True)
print('Special-page gesture guards passed for Screen Lock, modals, setup/screensaver modes and bottom-origin swipes.')
