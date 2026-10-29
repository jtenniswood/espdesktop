#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <vector>
constexpr int LV_PART_MAIN = 0, LV_EVENT_ALL = 0, LV_EVENT_DELETE = 1;
constexpr int LV_EVENT_SIZE_CHANGED = 2, LV_EVENT_LAYOUT_CHANGED = 3, LV_EVENT_STYLE_CHANGED = 4;
constexpr int LV_OBJ_FLAG_HIDDEN = 1, LV_TEXT_FLAG_NONE = 0, LV_ALIGN_BOTTOM_LEFT = 0;
constexpr int LV_OPA_COVER = 255, LV_RADIUS_CIRCLE = 32767, LV_TEXT_ALIGN_CENTER = 0;
struct lv_point_t { int x = 0, y = 0; };
struct lv_font_t { int line_height = 24; };
struct lv_obj_t;
struct lv_event_t { lv_obj_t *target; int code; void *data; };
using Callback = void (*)(lv_event_t *);
struct Event { Callback cb; void *data; };
struct lv_obj_t {
  int width = 200, height = 100, x = -1;
  bool hidden = false;
  const char *text = "Finder";
  lv_font_t font;
  std::vector<Event> events;
};
void lv_obj_update_layout(lv_obj_t *) {}
const char *lv_label_get_text(lv_obj_t *o) { return o->text; }
const lv_font_t *lv_obj_get_style_text_font(lv_obj_t *o, int) { return &o->font; }
int lv_obj_get_style_text_letter_space(lv_obj_t *, int) { return 0; }
int lv_obj_get_style_text_line_space(lv_obj_t *, int) { return 0; }
void lv_text_get_size(lv_point_t *p, const char *text, const lv_font_t *, int, int, int width, int) {
  *p = {std::min(width, static_cast<int>(strlen(text)) * 10), 24};
}
void lv_obj_add_flag(lv_obj_t *o, int) { o->hidden = true; }
void lv_obj_clear_flag(lv_obj_t *o, int) { o->hidden = false; }
bool lv_obj_has_flag(lv_obj_t *o, int) { return o->hidden; }
int lv_pct(int v) { return v; }
int lv_obj_get_content_width(lv_obj_t *o) { return o->width; }
void lv_obj_set_width(lv_obj_t *o, int w) { o->width = w; }
void lv_obj_set_size(lv_obj_t *o, int w, int h) { o->width = w; o->height = h; }
int lv_color_hex(int v) { return v; }
#define STYLE(name) void lv_obj_set_style_##name(lv_obj_t *, int, int) {}
STYLE(bg_color) STYLE(bg_opa) STYLE(radius) STYLE(text_color) STYLE(text_opa) STYLE(text_align) STYLE(pad_top)
void lv_obj_align(lv_obj_t *o, int, int x, int) { o->x = x; }
void lv_obj_move_foreground(lv_obj_t *) {}
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
  auto &events = o->events;
  events.erase(std::remove_if(events.begin(), events.end(), [&](const Event &e) { return e.cb == cb && e.data == data; }), events.end());
}
void emit(lv_obj_t &o, int code) {
  for (auto e : std::vector<Event>(o.events)) { lv_event_t event{&o,code,e.data}; e.cb(&event); }
  if (code == LV_EVENT_DELETE) o.events.clear();
}
#include "card_chevron_layout.h"
int main() {
  lv_obj_t card, label, chevron;
  using espdesktop::card_chevron::attach;
  attach(&card, &label, &chevron, true);
  assert(!chevron.hidden && chevron.x == 64); // Immediately after Finder.
  assert(chevron.width == chevron.height);
  label.hidden = true;
  emit(card, LV_EVENT_LAYOUT_CHANGED);
  assert(chevron.x == 0); // Large icon with no label.
  label.hidden = false; label.text = "A much longer folder name";
  emit(label, LV_EVENT_SIZE_CHANGED);
  assert(chevron.x + chevron.width <= card.width);
  label.text = "";
  emit(label, LV_EVENT_SIZE_CHANGED);
  assert(chevron.x == 0);
  attach(&card, &label, &chevron, false);
  assert(chevron.hidden);
  assert(card.events.size() == 1 && label.events.size() == 1);
  emit(chevron, LV_EVENT_DELETE);
  assert(card.events.empty() && label.events.empty());
  attach(&card, &label, &chevron, true);
  emit(card, LV_EVENT_DELETE);
  emit(label, LV_EVENT_DELETE);
  emit(chevron, LV_EVENT_DELETE);
}
