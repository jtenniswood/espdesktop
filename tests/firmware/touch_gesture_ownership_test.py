"""Check drag controls only claim gestures along their own enabled axis."""
from pathlib import Path
import subprocess
import sys
import tempfile

from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
touch_header = (ROOT / 'components/espdesktop/button_grid_touch.h').read_text()
navigation_header = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
ownership = definition(touch_header, 'touch_object_owns_gesture')[1]
guard = definition(navigation_header, 'navigation_gesture_started_on_drag')[1]
press_tracks = definition(touch_header, 'touch_press_tracks')[1]
record_press = definition(touch_header, 'touch_record_press')[1]
pointer_moved = definition(touch_header, 'touch_pointer_moved')[1]
source = r'''
#include <cassert>
#include <initializer_list>
#include <vector>
using lv_dir_t = int;
using lv_coord_t = int;
enum { LV_DIR_LEFT=1, LV_DIR_RIGHT=2, LV_DIR_TOP=3, LV_DIR_BOTTOM=4 };
enum { LV_STATE_DISABLED=1 };
enum { LV_OBJ_FLAG_CLICKABLE=1 };
struct lv_obj_class_t {};
const lv_obj_class_t lv_slider_class{};
struct lv_obj_t {
  const lv_obj_class_t *class_p=nullptr;
  bool disabled=false, clickable=true;
  int width=100,height=100;
  lv_obj_t *parent=nullptr;
};
struct lv_point_t { int x=0,y=0; };
struct lv_indev_t { lv_point_t point{}; };
struct TouchPressTrack { lv_indev_t *device=nullptr; lv_point_t point{}; };
lv_obj_t *hit=nullptr;
bool lv_obj_check_type(const lv_obj_t *o, const lv_obj_class_t *c) { return o&&o->class_p==c; }
bool lv_obj_has_state(const lv_obj_t *o, int state) { return o&&state==LV_STATE_DISABLED&&o->disabled; }
bool lv_obj_has_flag(const lv_obj_t *o, int flag) { return o&&flag==LV_OBJ_FLAG_CLICKABLE&&o->clickable; }
int lv_obj_get_width(const lv_obj_t *o) { return o->width; }
int lv_obj_get_height(const lv_obj_t *o) { return o->height; }
lv_obj_t *lv_obj_get_parent(lv_obj_t *o) { return o->parent; }
lv_obj_t *lv_indev_search_obj(lv_obj_t *screen, const lv_point_t *) { return hit?hit:screen; }
void lv_indev_get_point(lv_indev_t *device, lv_point_t *point) { *point=device->point; }
'''
source += ownership + '\n' + guard + '\n' + press_tracks + '\n' + record_press + '\n' + pointer_moved + r'''
int main() {
  lv_obj_t screen, card, child, vertical, horizontal;
  child.parent=&card; card.parent=&screen;
  vertical.class_p=&lv_slider_class; vertical.width=100; vertical.height=200;
  vertical.parent=&card;
  horizontal.class_p=&lv_slider_class; horizontal.width=200; horizontal.height=100;
  horizontal.parent=&card;

  hit=&vertical;
  assert(touch_object_owns_gesture(&vertical,LV_DIR_TOP));
  assert(touch_object_owns_gesture(&vertical,LV_DIR_BOTTOM));
  assert(!touch_object_owns_gesture(&vertical,LV_DIR_LEFT));
  assert(!touch_object_owns_gesture(&vertical,LV_DIR_RIGHT));
  assert(touch_object_owns_gesture(&horizontal,LV_DIR_LEFT));
  assert(touch_object_owns_gesture(&horizontal,LV_DIR_RIGHT));
  assert(!touch_object_owns_gesture(&horizontal,LV_DIR_TOP));
  assert(!touch_object_owns_gesture(&horizontal,LV_DIR_BOTTOM));
  vertical.disabled=true;
  for (const auto direction : {LV_DIR_TOP,LV_DIR_BOTTOM,LV_DIR_LEFT,LV_DIR_RIGHT})
    assert(!touch_object_owns_gesture(&vertical,direction));
  vertical.disabled=false; vertical.clickable=false;
  assert(!touch_object_owns_gesture(&vertical,LV_DIR_TOP));
  vertical.clickable=true;
  assert(!touch_object_owns_gesture(&card,LV_DIR_TOP));
  assert(!touch_object_owns_gesture(nullptr,LV_DIR_TOP));

  // The guard walks from the touched child to its ancestors.
  hit=&child;
  assert(!navigation_gesture_started_on_drag(&screen,{0,0},LV_DIR_TOP));
  assert(!navigation_gesture_started_on_drag(&screen,{0,0},LV_DIR_LEFT));
  child.class_p=&lv_slider_class; child.width=100; child.height=200;
  assert(navigation_gesture_started_on_drag(&screen,{0,0},LV_DIR_BOTTOM));
  assert(!navigation_gesture_started_on_drag(&screen,{0,0},LV_DIR_RIGHT));
  child.disabled=true;
  assert(!navigation_gesture_started_on_drag(&screen,{0,0},LV_DIR_BOTTOM));
  child.disabled=false;
  // A perpendicular gesture over the slider reaches the screen.
  hit=&screen;
  assert(!navigation_gesture_started_on_drag(&screen,{0,0},LV_DIR_LEFT));

  // A hold must be stationary; a swipe from the same card clears it.
  lv_indev_t device;
  assert(!touch_pointer_moved(nullptr));
  touch_record_press(&device,{100,100});
  device.point={110,110};
  assert(!touch_pointer_moved(&device));
  device.point={130,100};
  assert(touch_pointer_moved(&device));
  assert(!touch_pointer_moved(&device,50));
  touch_record_press(&device,{130,100});
  assert(!touch_pointer_moved(&device));
}
'''
with tempfile.TemporaryDirectory(prefix='touch-gesture-ownership-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall',
                    '-Wextra', '-Werror', '-fsanitize=address,undefined', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Sliders own only enabled gestures along their own axis; perpendicular swipes page.")
