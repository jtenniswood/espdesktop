#include <algorithm>
#include <cassert>
#include <cstdint>
#include <string>
#include <vector>
constexpr int LV_PART_MAIN = 0, LV_EVENT_ALL = 0, LV_EVENT_DELETE = 1;
constexpr int LV_EVENT_SIZE_CHANGED = 2, LV_EVENT_LAYOUT_CHANGED = 3, LV_EVENT_STYLE_CHANGED = 4;
constexpr int LV_OBJ_FLAG_HIDDEN = 1, LV_COORD_MAX = 32767, LV_TEXT_FLAG_NONE = 0;
struct lv_point_t { int x = 0, y = 0; };
struct lv_area_t { int x1 = 0, y1 = 0, x2 = 199, y2 = 199; };
struct lv_font_t {};
struct lv_obj_t;
struct lv_event_t { lv_obj_t *target; int code; void *data; };
using Callback = void (*)(lv_event_t *);
struct Event { Callback cb; void *data; };
struct lv_obj_t {
  lv_area_t bounds;
  lv_font_t font;
  int pad = 10, zoom_x = 256, zoom_y = 256;
  bool hidden = false;
  std::vector<Event> events;
};
void lv_obj_update_layout(lv_obj_t *) {}
const char *lv_label_get_text(lv_obj_t *) { return "icon"; }
lv_font_t *lv_obj_get_style_text_font(lv_obj_t *o, int) { return &o->font; }
int lv_obj_get_style_text_letter_space(lv_obj_t *, int) { return 0; }
void lv_text_get_size(lv_point_t *p, const char *, lv_font_t *, int, int, int, int) { *p = {48,48}; }
void lv_obj_get_coords(lv_obj_t *o, lv_area_t *out) { *out = o->bounds; }
int lv_obj_get_style_pad_right(lv_obj_t *o, int) { return o->pad; }
int lv_obj_get_style_pad_bottom(lv_obj_t *o, int) { return o->pad; }
void lv_obj_add_flag(lv_obj_t *o, int) { o->hidden = true; }
bool lv_obj_has_flag(lv_obj_t *o, int) { return o->hidden; }
void lv_obj_set_style_transform_pivot_x(lv_obj_t *, int, int) {}
void lv_obj_set_style_transform_pivot_y(lv_obj_t *, int, int) {}
void lv_obj_set_style_transform_scale_x(lv_obj_t *o, int v, int) { o->zoom_x = v; }
void lv_obj_set_style_transform_scale_y(lv_obj_t *o, int v, int) { o->zoom_y = v; }
void *lv_event_get_user_data(lv_event_t *e) { return e->data; }
lv_obj_t *lv_event_get_target(lv_event_t *e) { return e->target; }
lv_obj_t *lv_event_get_current_target(lv_event_t *e) { return e->target; }
int lv_event_get_code(lv_event_t *e) { return e->code; }
size_t lv_obj_get_event_count(lv_obj_t *o) { return o->events.size(); }
Event *lv_obj_get_event_dsc(lv_obj_t *o, size_t i) { return &o->events[i]; }
Callback lv_event_dsc_get_cb(Event *e) { return e->cb; }
void *lv_event_dsc_get_user_data(Event *e) { return e->data; }
Event *lv_obj_add_event_cb(lv_obj_t *o, Callback cb, int, void *data) { o->events.push_back({cb,data}); return &o->events.back(); }
void lv_obj_remove_event_cb_with_user_data(lv_obj_t *o, Callback cb, void *data) {
  auto &v = o->events;
  v.erase(std::remove_if(v.begin(),v.end(),[&](const Event &e) { return e.cb == cb && e.data == data; }),v.end());
}
void emit(lv_obj_t &o, int code) {
  const auto events = o.events;
  for (auto e : events) { lv_event_t event{&o,code,e.data}; e.cb(&event); }
  if (code == LV_EVENT_DELETE) o.events.clear();
}
#include "card_icon_layout.h"
int main() {
  lv_obj_t card, icon, label;
  icon.bounds = {10,10,189,57}; // Full-width label still contains a 48px glyph.
  label.bounds = {10,160,189,189};
  espdesktop::card_icons::attach(&card,&icon,&label,"large",100,false);
  assert(label.hidden);
  assert(icon.zoom_x == 960 && icon.zoom_y == 960); // Fill the 180px content box.
  // Wrapped label changes cannot reduce Large, which intentionally hides it.
  label.bounds.y1 = 62;
  emit(label,LV_EVENT_SIZE_CHANGED);
  assert(icon.zoom_y == 960);
  // The card driver restores label visibility before applying another size.
  label.hidden = false;
  label.bounds.y1 = 160;
  espdesktop::card_icons::attach(&card,&icon,&label,"medium",80,true);
  assert(icon.events.size() == 1 && card.events.size() == 1 && label.events.size() == 1);
  assert(icon.zoom_x == 384 && icon.zoom_y == 307);
  espdesktop::card_icons::attach(&card,&icon,&label,"small",100,false);
  assert(icon.zoom_x == 256 && icon.zoom_y == 256);
  espdesktop::set_card_icon_default_size("Large");
  espdesktop::card_icons::attach(&card,&icon,&label,"",100,false);
  assert(label.hidden && icon.zoom_x == 960);
  label.hidden = false; // Card drivers restore normal visibility on refresh.
  emit(label, LV_EVENT_STYLE_CHANGED);
  assert(!label.hidden); // A stale Large binding must not undo the driver reset.
  espdesktop::set_card_icon_default_size("Medium");
  espdesktop::card_icons::attach(&card,&icon,&label,"",100,false);
  assert(!label.hidden && icon.zoom_x == 384);
  espdesktop::set_card_icon_default_size("Large");
  espdesktop::card_icons::attach(&card,&icon,&label,"small",100,false);
  assert(!label.hidden && icon.zoom_x == 256);
  icon.hidden = true;
  espdesktop::card_icons::attach(&card,&icon,&label,"",100,false);
  assert(!label.hidden); // Cards without visible icons retain their labels.
  espdesktop::set_card_icon_default_size("Small");
  icon.hidden = false;
  emit(icon,LV_EVENT_DELETE);
  assert(card.events.empty() && label.events.empty());
  espdesktop::card_icons::attach(&card,&icon,&label,"large",100,false);
  emit(card,LV_EVENT_DELETE); // Parent is deleted before its children.
  emit(label,LV_EVENT_DELETE);
  emit(icon,LV_EVENT_DELETE);
}
