#pragma once

#include <algorithm>
#include <cstdint>
#include <new>

namespace espdesktop::card_chevron {
struct Binding {
  lv_obj_t *card;
  lv_obj_t *label;
  lv_obj_t *chevron;
  bool enabled;
  bool updating = false;
};

inline void update(Binding &b) {
  if (!b.card || !b.chevron || b.updating) return;
  b.updating = true;
  if (!b.enabled) {
    lv_obj_add_flag(b.chevron, LV_OBJ_FLAG_HIDDEN);
    if (b.label) lv_obj_set_width(b.label, lv_pct(100));
  } else {
    lv_obj_clear_flag(b.chevron, LV_OBJ_FLAG_HIDDEN);
    const auto *font = lv_obj_get_style_text_font(b.chevron, LV_PART_MAIN);
    const int side = (font ? font->line_height : 24) + 6;
    lv_obj_set_size(b.chevron, side, side);
    lv_obj_set_style_bg_color(b.chevron, lv_color_hex(0x666666), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(b.chevron, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_radius(b.chevron, LV_RADIUS_CIRCLE, LV_PART_MAIN);
    lv_obj_set_style_text_color(b.chevron, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
    lv_obj_set_style_text_opa(b.chevron, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_text_align(b.chevron, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_set_style_pad_top(b.chevron, 3, LV_PART_MAIN);
    const int width = lv_obj_get_content_width(b.card);
    const int available = std::max(1, width - side - 4);
    if (b.label) lv_obj_set_width(b.label, available);
    lv_obj_update_layout(b.card);
    int x = 0;
    if (b.label && !lv_obj_has_flag(b.label, LV_OBJ_FLAG_HIDDEN) && *lv_label_get_text(b.label)) {
      lv_point_t text{};
      lv_text_get_size(&text, lv_label_get_text(b.label),
          lv_obj_get_style_text_font(b.label, LV_PART_MAIN),
          lv_obj_get_style_text_letter_space(b.label, LV_PART_MAIN),
          lv_obj_get_style_text_line_space(b.label, LV_PART_MAIN),
          available, LV_TEXT_FLAG_NONE);
      x = std::min(available, static_cast<int>(text.x)) + 4;
    }
    lv_obj_align(b.chevron, LV_ALIGN_BOTTOM_LEFT, x, 0);
    lv_obj_move_foreground(b.chevron);
  }
  b.updating = false;
}

inline void on_event(lv_event_t *event) {
  auto *b = static_cast<Binding *>(lv_event_get_user_data(event));
  auto *target = static_cast<lv_obj_t *>(lv_event_get_target(event));
  if (target != lv_event_get_current_target(event)) return;
  const auto code = lv_event_get_code(event);
  if (code == LV_EVENT_DELETE) {
    if (target == b->chevron) {
      if (b->card) lv_obj_remove_event_cb_with_user_data(b->card, on_event, b);
      if (b->label) lv_obj_remove_event_cb_with_user_data(b->label, on_event, b);
      delete b;
    } else if (target == b->card) b->card = nullptr;
    else if (target == b->label) b->label = nullptr;
  } else if (code == LV_EVENT_LAYOUT_CHANGED || code == LV_EVENT_SIZE_CHANGED || code == LV_EVENT_STYLE_CHANGED) {
    update(*b);
  }
}

inline void attach(lv_obj_t *card, lv_obj_t *label, lv_obj_t *chevron, bool enabled) {
  if (!card || !chevron) return;
  Binding *b = nullptr;
  for (uint32_t i = 0; i < lv_obj_get_event_count(chevron); ++i) {
    auto *event = lv_obj_get_event_dsc(chevron, i);
    if (lv_event_dsc_get_cb(event) == on_event) {
      b = static_cast<Binding *>(lv_event_dsc_get_user_data(event));
      break;
    }
  }
  if (!b) {
    if (!enabled) { lv_obj_add_flag(chevron, LV_OBJ_FLAG_HIDDEN); return; }
    b = new (std::nothrow) Binding{card, label, chevron, enabled};
    if (!b) return;
    if (!lv_obj_add_event_cb(chevron, on_event, LV_EVENT_ALL, b)) { delete b; return; }
    lv_obj_add_event_cb(card, on_event, LV_EVENT_ALL, b);
    if (label) lv_obj_add_event_cb(label, on_event, LV_EVENT_ALL, b);
  }
  b->enabled = enabled;
  update(*b);
}
}  // namespace espdesktop::card_chevron
