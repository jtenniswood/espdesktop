"""Check a dimmer only claims gestures while it is drag-adjusting along its track."""
from pathlib import Path
import subprocess
import sys
import tempfile

from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
touch_header = (ROOT / 'components/espdesktop/button_grid_touch.h').read_text()
navigation_header = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
sliders_header = (ROOT / 'components/espdesktop/button_grid_sliders.h').read_text()
dragging_slider = definition(touch_header, 'touch_dragging_slider')[1]
guard = definition(navigation_header, 'navigation_gesture_started_on_drag')[1]
press_tracks = definition(touch_header, 'touch_press_tracks')[1]
record_press = definition(touch_header, 'touch_record_press')[1]
pointer_moved = definition(touch_header, 'touch_pointer_moved')[1]
slider_moved = definition(sliders_header, 'slider_pointer_moved')[1]
slider_pressing = definition(sliders_header, 'slider_update_pointer_press')[1]
source = r'''
#include <cassert>
#include <vector>
using lv_dir_t = int;
using lv_coord_t = int;
enum { LV_INDEV_TYPE_POINTER=1 };
struct lv_obj_t { bool valid=true; };
struct lv_point_t { int x=0,y=0; };
struct lv_indev_t { lv_point_t point{}; };
struct SliderCtx {
  bool press_active=false;
  bool dragging=false;
  bool horizontal=false;
  lv_point_t press_point{};
};
struct TouchPressTrack { lv_indev_t *device=nullptr; lv_point_t point{}; };
lv_indev_t *lv_indev_active() { static lv_indev_t device; return &device; }
lv_indev_t *active_device() { return lv_indev_active(); }
int lv_indev_get_type(lv_indev_t *) { return LV_INDEV_TYPE_POINTER; }
void lv_indev_get_point(lv_indev_t *device, lv_point_t *point) { *point=device->point; }
bool lv_obj_is_valid(lv_obj_t *o) { return o&&o->valid; }
void *lv_obj_get_user_data(lv_obj_t *) { return nullptr; }
int applied=0, restored=0;
void slider_apply_pointer_value(lv_obj_t *) { ++applied; }
void slider_restore_pressed_value(lv_obj_t *) { ++restored; }
'''
# The production slider helpers read the context from the widget. Point the
# lookup at the test's own widget so no LVGL user data is involved.
source += dragging_slider + '\n' + guard + '\n' + press_tracks + '\n' + \
    record_press + '\n' + pointer_moved + '\n'
source = source.replace('void *lv_obj_get_user_data(lv_obj_t *) { return nullptr; }',
                        'lv_obj_t *ctx_widget = nullptr;\n'
                        'extern SliderCtx *test_ctx;\n'
                        'void *lv_obj_get_user_data(lv_obj_t *o) { return o == ctx_widget ? (void *)test_ctx : nullptr; }')
source += 'SliderCtx *test_ctx = nullptr;\n' + slider_moved + '\n' + slider_pressing + r'''
int main() {
  lv_obj_t slider, other;
  SliderCtx vertical, horizontal;
  ctx_widget=&slider;
  vertical.press_active=true;
  vertical.press_point={100,100};
  horizontal.press_active=true;
  horizontal.horizontal=true;
  horizontal.press_point={100,100};

  // Nothing is dragging and no gesture is blocked.
  test_ctx=&vertical;
  assert(touch_dragging_slider()==nullptr);
  assert(!navigation_gesture_started_on_drag());

  // A tap (no movement, or a few pixels of wobble) never becomes a drag.
  active_device()->point={100,100};
  slider_update_pointer_press(&slider);
  assert(!vertical.dragging && touch_dragging_slider()==nullptr);
  active_device()->point={105,105};
  slider_update_pointer_press(&slider);
  assert(!vertical.dragging && touch_dragging_slider()==nullptr);
  assert(applied==0 && restored==2);

  // A clear drag along the dimmer's own track arms it before the page gesture
  // distance, and the page guard then blocks the swipe.
  active_device()->point={100,112};
  slider_update_pointer_press(&slider);
  assert(vertical.dragging);
  assert(touch_dragging_slider()==&slider);
  assert(navigation_gesture_started_on_drag());
  assert(applied==1);

  // Movement across the track stays with the page.
  touch_dragging_slider()=nullptr;
  vertical.dragging=false;
  active_device()->point={120,100};
  slider_update_pointer_press(&slider);
  assert(!vertical.dragging && touch_dragging_slider()==nullptr);
  assert(!navigation_gesture_started_on_drag());
  assert(!slider_pointer_moved(&slider));

  // A horizontal dimmer mirrors the rule.
  test_ctx=&horizontal;
  active_device()->point={100,112};
  assert(!slider_pointer_moved(&slider));
  active_device()->point={112,100};
  assert(slider_pointer_moved(&slider));
  slider_update_pointer_press(&slider);
  assert(horizontal.dragging && touch_dragging_slider()==&slider);
  assert(navigation_gesture_started_on_drag());

  // A drag that ends stops blocking the page.
  touch_dragging_slider()=nullptr;
  assert(!navigation_gesture_started_on_drag());

  // A slider replaced mid-drag cannot leave the page guard stuck.
  other.valid=false;
  touch_dragging_slider()=&other;
  assert(!navigation_gesture_started_on_drag());
  assert(touch_dragging_slider()==nullptr);

  // A hold must be stationary; a swipe from the same card clears it.
  lv_indev_t device;
  device.point={0,0};
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
with tempfile.TemporaryDirectory(prefix='dimmer-gesture-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall',
                    '-Wextra', '-Werror', '-fsanitize=address,undefined', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Dimmers own gestures only while dragging along their track; taps and cross-track swipes page.")
