#!/usr/bin/env python3
"""Lock badges follow the computer lock, never ordinary card availability."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / 'components/espdesktop'
badge = (HEADERS / 'card_lock_badge.h').read_text()
badge = '\n'.join(line for line in badge.splitlines()
                  if not line.startswith('#include') and
                  not line.startswith('#pragma'))

stubs = r'''
#include <algorithm>
#include <cassert>
#include <cstring>
#include <string>
#include <vector>

struct lv_font_t {};
struct lv_obj_t {
  lv_obj_t *parent{};
  std::vector<lv_obj_t *> children;
  bool valid{true};
  unsigned flags{};
  int align{};
  std::string text;
  const lv_font_t *font{};
};
constexpr unsigned LV_OBJ_FLAG_CLICKABLE = 1;
constexpr unsigned LV_OBJ_FLAG_IGNORE_LAYOUT = 2;
constexpr unsigned LV_OBJ_FLAG_HIDDEN = 4;
constexpr int LV_PART_MAIN = 0;
constexpr int LV_ALIGN_TOP_RIGHT = 0;
constexpr int LV_OPA_80 = 204;
constexpr int LV_RADIUS_CIRCLE = 999;
struct Theme { int background{0xFFFFFF}, text_primary{0x000000}; };
const Theme &current_theme() { static Theme theme; return theme; }
int lv_color_hex(int color) { return color; }
const char *find_icon(const char *name) {
  return std::strcmp(name, "Lock") == 0 ? "lock glyph" : "";
}
lv_obj_t *lv_label_create(lv_obj_t *parent) {
  auto *obj = new lv_obj_t;
  obj->parent = parent;
  if (parent) parent->children.push_back(obj);
  return obj;
}
void lv_label_set_text(lv_obj_t *obj, const char *text) { obj->text = text; }
void lv_obj_set_style_text_font(lv_obj_t *obj, const lv_font_t *font, int) { obj->font = font; }
void lv_obj_set_style_text_color(lv_obj_t *, int, int) {}
void lv_obj_set_style_bg_color(lv_obj_t *, int, int) {}
void lv_obj_set_style_bg_opa(lv_obj_t *, int, int) {}
void lv_obj_set_style_radius(lv_obj_t *, int, int) {}
void lv_obj_set_style_pad_hor(lv_obj_t *, int, int) {}
void lv_obj_set_style_pad_ver(lv_obj_t *, int, int) {}
void lv_obj_add_flag(lv_obj_t *obj, unsigned flag) { obj->flags |= flag; }
void lv_obj_clear_flag(lv_obj_t *obj, unsigned flag) { obj->flags &= ~flag; }
void lv_obj_align(lv_obj_t *obj, int align, int, int) { obj->align = align; }
void lv_obj_move_foreground(lv_obj_t *) {}
bool lv_obj_is_valid(lv_obj_t *obj) { return obj && obj->valid; }
void lv_obj_del(lv_obj_t *obj) {
  if (!obj) return;
  if (obj->parent) {
    auto &children = obj->parent->children;
    children.erase(std::remove(children.begin(), children.end(), obj), children.end());
  }
  obj->valid = false;
}
std::vector<std::string> locked_computers;
bool companion_computer_locked(const std::string &computer_id) {
  return std::find(locked_computers.begin(), locked_computers.end(), computer_id)
      != locked_computers.end();
}
'''

checks = r'''
int main() {
  const lv_font_t font;
  lv_obj_t a, b;
  companion_card_lock_badge_attach(&a, "a", &font);
  companion_card_lock_badge_attach(&b, "b", &font);
  assert(a.children.empty() && b.children.empty());

  // Locking a computer badges only its cards.
  locked_computers = {"a"};
  companion_refresh_card_lock_badges();
  assert(a.children.size() == 1 && b.children.empty());
  auto *badge = a.children.front();
  assert(badge->text == "lock glyph" && badge->font == &font);
  assert((badge->flags & LV_OBJ_FLAG_CLICKABLE) == 0);
  assert((badge->flags & LV_OBJ_FLAG_IGNORE_LAYOUT) != 0);
  assert(badge->align == LV_ALIGN_TOP_RIGHT);

  // Refreshing again does not add a second badge.
  companion_refresh_card_lock_badges();
  assert(a.children.size() == 1);

  // Unavailable cards stay unbadged while the computer is unlocked.
  locked_computers.clear();
  companion_refresh_card_lock_badges();
  assert(a.children.empty() && b.children.empty());

  // Rebinding a slot clears the old badge before the next card takes over.
  locked_computers = {"a", "b"};
  companion_refresh_card_lock_badges();
  assert(a.children.size() == 1 && b.children.size() == 1);
  companion_card_lock_badge_forget(&a);
  assert(a.children.empty() && b.children.size() == 1);
  assert(companion_card_lock_badges().size() == 1);

  // Deleting a whole card prunes its entry on the next refresh.
  b.valid = false;
  companion_refresh_card_lock_badges();
  assert(companion_card_lock_badges().empty());
}
'''

with tempfile.TemporaryDirectory() as directory:
    source = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    source.write_text(stubs + badge + checks)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', str(source), '-o', str(binary)],
                   check=True)
    subprocess.run([str(binary)], check=True)
print('Lock badges follow the computer lock and ignore card availability')
