"""Run real app-icon event handlers against label and card size changes."""
from pathlib import Path
import subprocess
import sys
import tempfile

from generate_media_lifecycle_integration import definition

ROOT = Path(__file__).resolve().parents[2]
source = r'''
#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <vector>
#include "app_icon_layout.h"
#define VERSION_CODE(a,b,c) ((a)*10000+(b)*100+(c))
#define ESPHOME_VERSION_CODE VERSION_CODE(2026,9,1)
constexpr int LV_PART_MAIN = 0, LV_OBJ_FLAG_HIDDEN = 1;
constexpr int LV_ALIGN_TOP_LEFT = 0, LV_IMAGE_ALIGN_CONTAIN = 0;
constexpr int LV_EVENT_LAYOUT_CHANGED = 1, LV_EVENT_SIZE_CHANGED = 2;
namespace esphome::companion { constexpr int APP_ICON_SIDE = 8; }
struct lv_font_t { int line_height = 40; };
struct lv_obj_t;
struct lv_event_t { void *data; };
using Callback = void (*)(lv_event_t *);
struct Event { int code; Callback callback; void *data; };
struct lv_obj_t {
  int width = 100, height = 100;
  bool hidden = false;
  void *data = nullptr;
  lv_obj_t *parent = nullptr;
  lv_font_t font;
  std::vector<Event> events;
  std::vector<lv_obj_t *> children;
};
struct CompanionAppIconImageData {
  bool app_icon_mode = true, image_loaded = true, layout_updating = false;
  uint8_t *pixels = nullptr;
  lv_obj_t *fallback_icon = nullptr, *card_label = nullptr;
};
lv_obj_t *lv_obj_get_parent(lv_obj_t *o) { return o->parent; }
int lv_obj_get_content_width(lv_obj_t *o) { return o->width; }
int lv_obj_get_content_height(lv_obj_t *o) { return o->height; }
const lv_font_t *lv_obj_get_style_text_font(lv_obj_t *o, int) { return &o->font; }
bool lv_obj_has_flag(lv_obj_t *o, int) { return o->hidden; }
int lv_obj_get_height(lv_obj_t *o) { return o->height; }
void lv_obj_set_size(lv_obj_t *o, int w, int h) { o->width = w; o->height = h; }
void lv_obj_align(lv_obj_t *, int, int, int) {}
void lv_obj_move_foreground(lv_obj_t *o) {
  auto &children = o->parent->children;
  children.erase(std::remove(children.begin(), children.end(), o), children.end());
  children.push_back(o);
}
void lv_image_set_inner_align(lv_obj_t *, int) {}
void *lv_event_get_user_data(lv_event_t *e) { return e->data; }
void *lv_obj_get_user_data(lv_obj_t *o) { return o->data; }
void lv_obj_add_event_cb(lv_obj_t *o, Callback callback, int code, void *data) {
  o->events.push_back({code, callback, data});
}
void emit(lv_obj_t &o, int code) {
  for (const auto &event : o.events) if (event.code == code) {
    lv_event_t e{event.data}; event.callback(&e);
  }
}
'''
header = (ROOT / 'components/espdesktop/button_grid_cards.h').read_text()
for name in ('companion_layout_card_app_icon', 'companion_app_icon_layout_changed',
             'companion_track_app_icon_layout'):
    line, code = definition(header, name)
    source += f'\n#line {line} "button_grid_cards.h"\n{code}\n'
source += r'''
int main() {
  std::array<uint8_t, 8 * 8 * 3> pixels;
  pixels.fill(255);
  lv_obj_t button, label, icon, fallback;
  icon.parent = label.parent = &button;
  button.children = {&label, &icon};
  label.height = 20;
  CompanionAppIconImageData data;
  data.pixels = pixels.data(); data.fallback_icon = &fallback; data.card_label = &label;
  icon.data = &data;
  companion_track_app_icon_layout(&button, &label, &icon);
  emit(button, LV_EVENT_LAYOUT_CHANGED);
  assert(icon.height == 70);
  assert(button.children.back() == &label);
  // A catalogue refresh wraps the app name. Only the label emits an event.
  lv_obj_move_foreground(&icon); // Simulate artwork being raised after initial load.
  label.height = 40;
  emit(label, LV_EVENT_SIZE_CHANGED);
  assert(icon.height == 50);
  assert(button.children.back() == &label);
  label.height = 20;
  emit(label, LV_EVENT_SIZE_CHANGED);
  assert(icon.height == 70);
  label.hidden = true;
  emit(label, LV_EVENT_SIZE_CHANGED);
  assert(icon.height == 100);
  button.width = button.height = 140;
  emit(button, LV_EVENT_SIZE_CHANGED);
  assert(icon.height == 140);
  label.hidden = false; label.height = 40;
  emit(label, LV_EVENT_SIZE_CHANGED);
  assert(icon.height == 90);
  button.width = 80;
  emit(button, LV_EVENT_LAYOUT_CHANGED);
  assert(icon.width == 80);
  data.app_icon_mode = false; label.height = 0;
  emit(label, LV_EVENT_SIZE_CHANGED);
  assert(icon.width == 80); // Reused non-app cards do not retain layout effects.
  assert(!data.layout_updating);
}
'''
with tempfile.TemporaryDirectory(prefix='app-icon-events-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', '-I', str(ROOT / 'components/espdesktop'),
                    str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('App icons refit on dynamic label and card resize events.')
