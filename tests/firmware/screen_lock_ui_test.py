#!/usr/bin/env python3
"""Exercise the Mac lock overlay with modeled LVGL I/O."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / 'components/espdesktop'
ui = (HEADERS / 'screen_lock_ui.h').read_text()
ui = ui[ui.index('struct MacLockScreenStyle'):]
stubs = r'''
#include <algorithm>
#include <cassert>
#include <cstring>
#include <string>
#include <vector>
#include "screen_lock_state.h"

using lv_coord_t = int;
struct lv_font_t {};
struct lv_disp_t { int width{720}, height{1280}; } display;
lv_disp_t *lv_disp_get_default() { return &display; }
int lv_disp_get_hor_res(lv_disp_t *value) { return value->width; }
int lv_disp_get_ver_res(lv_disp_t *value) { return value->height; }
struct lv_obj_t {
  lv_obj_t *parent{};
  bool full_screen{};
  unsigned flags{};
  std::string text;
  const lv_font_t *font{};
  int width{}, text_align{}, text_color{};
};
constexpr unsigned LV_OBJ_FLAG_CLICKABLE = 1;
constexpr int LV_PART_MAIN = 0, LV_OPA_COVER = 255, LV_FLEX_FLOW_COLUMN = 1;
constexpr int LV_FLEX_ALIGN_CENTER = 2, LV_TEXT_ALIGN_CENTER = 1;
struct Theme { int background{0}, text_primary{0xFFFFFF}, text_muted{0xBBBBBB}; };
Theme current_theme() { return {}; }
int lv_color_hex(int color) { return color; }
lv_obj_t system_layer;
int deleted = 0;
std::vector<lv_obj_t *> objects;
lv_obj_t *lv_layer_sys() { return &system_layer; }
lv_obj_t *lv_obj_create(lv_obj_t *parent) {
  auto *obj = new lv_obj_t;
  obj->parent = parent;
  objects.push_back(obj);
  return obj;
}
lv_obj_t *lv_label_create(lv_obj_t *parent) { return lv_obj_create(parent); }
void lv_label_set_text(lv_obj_t *label, const char *text) { label->text = text; }
void lv_obj_set_style_bg_color(lv_obj_t *, int, int) {}
void lv_obj_set_style_bg_opa(lv_obj_t *, int, int) {}
void lv_obj_set_style_pad_row(lv_obj_t *, int, int) {}
void lv_obj_set_flex_flow(lv_obj_t *, int) {}
void lv_obj_set_flex_align(lv_obj_t *, int, int, int) {}
void lv_obj_set_style_text_font(lv_obj_t *label, const lv_font_t *font, int) { label->font = font; }
void lv_obj_set_style_text_color(lv_obj_t *label, int color, int) { label->text_color = color; }
void lv_obj_set_width(lv_obj_t *label, int width) { label->width = width; }
const char *find_icon(const char *name) { return std::strcmp(name, "Lock") == 0 ? "lock icon" : ""; }
void lv_obj_del(lv_obj_t *root) {
  assert(!objects.empty() && objects.front() == root);
  for (auto *obj : objects) delete obj;
  objects.clear();
  ++deleted;
}
void lv_obj_add_flag(lv_obj_t *obj, unsigned flag) { obj->flags |= flag; }
void control_modal_style_overlay(lv_obj_t *obj) { obj->full_screen = true; }
void lv_obj_set_style_text_align(lv_obj_t *obj, int align, int) { obj->text_align = align; }
const char *espdesktop_i18n_key(const char *key) {
  if (std::strcmp(key, "locked") == 0) return "Locked";
  if (std::strcmp(key, "unlock_mac_to_use_screen") == 0) return "Unlock your Mac to use this screen";
  return key;
}
void lv_label_set_display_text(lv_obj_t *obj, const char *text) { obj->text = text; }
'''
checks = r'''
int main() {
  lv_font_t icon_font, title_font, body_font;
  const MacLockScreenStyle style{&icon_font, &title_font, &body_font, 380, 20};
  std::vector<bool> changes;
  register_screen_lock_changed_handler([&](bool locked) {
    changes.push_back(locked);
    assert(screen_lock_enabled() == locked);
    refresh_screen_lock_overlay(style);
  });

  refresh_screen_lock_overlay(style);
  assert(!screen_lock_enabled() && objects.empty());

  screen_lock_set_mac_locked(true);
  assert(screen_lock_enabled() && objects.size() == 4);
  auto *overlay = objects.front();
  assert(overlay->parent == &system_layer && overlay->full_screen && (overlay->flags & LV_OBJ_FLAG_CLICKABLE));
  assert(objects[1]->parent == overlay && objects[1]->text == "lock icon" && objects[1]->font == &icon_font);
  assert(objects[2]->text == "Locked" && objects[2]->font == &title_font);
  assert(objects[3]->text == "Unlock your Mac to use this screen" && objects[3]->font == &body_font);
  assert(objects[3]->text_align == LV_TEXT_ALIGN_CENTER && objects[3]->text_color == current_theme().text_muted);

  screen_lock_set_mac_locked(true);
  refresh_screen_lock_overlay(style);
  assert(changes.size() == 1 && deleted == 0);

  display.width = 320;
  refresh_screen_lock_overlay(style);
  assert(screen_lock_enabled() && deleted == 1 && objects[2]->width == 320 && objects[3]->width == 320);

  screen_lock_set_mac_locked(false);
  assert(!screen_lock_enabled() && objects.empty() && deleted == 2);
  screen_lock_set_mac_locked(false);
  assert((changes == std::vector<bool>{true, false}));
}
'''
with tempfile.TemporaryDirectory() as directory:
    source = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    source.write_text(stubs + ui + checks)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', '-I', str(HEADERS),
                    str(source), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Mac lock overlay blocks touch, handles rotation, and clears on Mac unlock')
