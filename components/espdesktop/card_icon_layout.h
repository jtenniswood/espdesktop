#pragma once

#include <new>
#include "card_icon_size.h"

namespace espdesktop::card_icons {
struct Binding {
  lv_obj_t *card;
  lv_obj_t *icon;
  lv_obj_t *label;
  std::string size;
  int percent;
  bool vertical;
  bool updating = false;
};

inline void update(Binding &b) {
  if (!b.card || !b.icon || b.updating || lv_obj_has_flag(b.icon, LV_OBJ_FLAG_HIDDEN)) return;
  b.updating = true;
  lv_obj_update_layout(b.card);
  int zoom = 256;
  if (b.size == "medium" || b.size == "large") {
    // Some slider icons use a full-width label. Size the glyph, not its box.
    lv_point_t glyph{};
    lv_text_get_size(&glyph, lv_label_get_text(b.icon),
        lv_obj_get_style_text_font(b.icon, LV_PART_MAIN),
        lv_obj_get_style_text_letter_space(b.icon, LV_PART_MAIN), 0,
        LV_COORD_MAX, LV_TEXT_FLAG_NONE);
    lv_area_t card{}, icon{}, label{};
    lv_obj_get_coords(b.card, &card);
    lv_obj_get_coords(b.icon, &icon);
    const int inset = std::max<int>(lv_obj_get_style_pad_right(b.card, LV_PART_MAIN), icon.x1 - card.x1);
    int bottom = card.y2 - lv_obj_get_style_pad_bottom(b.card, LV_PART_MAIN) + 1;
    if (b.label && !lv_obj_has_flag(b.label, LV_OBJ_FLAG_HIDDEN)) {
      lv_obj_get_coords(b.label, &label);
      bottom = std::min(bottom, static_cast<int>(label.y1) - 4);
    }
    zoom = card_icon_zoom(b.size,
        glyph.x * (b.vertical ? 100 : b.percent) / 100,
        glyph.y * (b.vertical ? b.percent : 100) / 100,
        card.x2 - inset - icon.x1 + 1, bottom - icon.y1);
  }
  lv_obj_set_style_transform_pivot_x(b.icon, 0, LV_PART_MAIN);
  lv_obj_set_style_transform_pivot_y(b.icon, 0, LV_PART_MAIN);
  lv_obj_set_style_transform_scale_x(b.icon, b.vertical ? zoom : zoom * b.percent / 100, LV_PART_MAIN);
  lv_obj_set_style_transform_scale_y(b.icon, b.vertical ? zoom * b.percent / 100 : zoom, LV_PART_MAIN);
  b.updating = false;
}

inline void on_event(lv_event_t *event) {
  auto *b = static_cast<Binding *>(lv_event_get_user_data(event));
  auto *target = static_cast<lv_obj_t *>(lv_event_get_target(event));
  if (target != lv_event_get_current_target(event)) return;
  const auto code = lv_event_get_code(event);
  if (code == LV_EVENT_DELETE) {
    if (target == b->icon) {
      if (b->card) lv_obj_remove_event_cb_with_user_data(b->card, on_event, b);
      if (b->label) lv_obj_remove_event_cb_with_user_data(b->label, on_event, b);
      delete b;
    } else if (target == b->card) b->card = nullptr;
    else if (target == b->label) b->label = nullptr;
  } else if (code == LV_EVENT_SIZE_CHANGED || code == LV_EVENT_LAYOUT_CHANGED || code == LV_EVENT_STYLE_CHANGED) {
    update(*b);
  }
}

inline void attach(lv_obj_t *card, lv_obj_t *icon, lv_obj_t *label,
                   const std::string &size, int percent, bool vertical) {
  if (!card || !icon) return;
  const std::string effective = resolved_card_icon_size(size);
  Binding *b = nullptr;
  for (uint32_t i = 0; i < lv_obj_get_event_count(icon); ++i) {
    auto *event = lv_obj_get_event_dsc(icon, i);
    if (lv_event_dsc_get_cb(event) == on_event) {
      b = static_cast<Binding *>(lv_event_dsc_get_user_data(event));
      break;
    }
  }
  if (!b) {
    if (effective != "medium" && effective != "large") return;
    b = new (std::nothrow) Binding{card, icon, label, effective, percent, vertical};
    if (!b) return;
    if (!lv_obj_add_event_cb(icon, on_event, LV_EVENT_ALL, b)) { delete b; return; }
    lv_obj_add_event_cb(card, on_event, LV_EVENT_ALL, b);
    if (label) lv_obj_add_event_cb(label, on_event, LV_EVENT_ALL, b);
  }
  b->size = effective;
  b->percent = percent;
  b->vertical = vertical;
  if (label && effective == "large" && !lv_obj_has_flag(icon, LV_OBJ_FLAG_HIDDEN))
    lv_obj_add_flag(label, LV_OBJ_FLAG_HIDDEN);
  update(*b);
}
}  // namespace espdesktop::card_icons
