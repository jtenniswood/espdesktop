#pragma once

#include <cstdint>
#include "lvgl.h"

// Shared by grid rendering and Companion focus; inline definitions must be
// visible to every component that updates a card state.
inline void apply_card_descendant_text_color(lv_obj_t *obj, lv_color_t color) {
  if (!obj) return;
  int32_t count = static_cast<int32_t>(lv_obj_get_child_cnt(obj));
  for (int32_t i = 0; i < count; i++) {
    lv_obj_t *child = lv_obj_get_child(obj, i);
    if (!child) continue;
    if (!lv_obj_has_flag(child, LV_OBJ_FLAG_USER_2))
      lv_obj_set_style_text_color(child, color, LV_PART_MAIN);
    apply_card_descendant_text_color(child, color);
  }
}

inline void sync_card_checked_text_color(lv_obj_t *btn) {
  if (!btn) return;
  const lv_color_t text_color = lv_obj_get_style_text_color(btn, LV_PART_MAIN);
  apply_card_descendant_text_color(btn, text_color);
}

inline void card_text_contrast_event_cb(lv_event_t *event) {
  const auto code = lv_event_get_code(event);
  if (code == LV_EVENT_PRESSED || code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
    sync_card_checked_text_color(static_cast<lv_obj_t *>(lv_event_get_target(event)));
  }
}

inline void bind_card_text_contrast_events(lv_obj_t *btn) {
  lv_obj_remove_event_cb_with_user_data(btn, card_text_contrast_event_cb, nullptr);
  lv_obj_add_event_cb(btn, card_text_contrast_event_cb, LV_EVENT_ALL, nullptr);
}

inline void set_card_checked_state(lv_obj_t *btn, bool checked) {
  if (!btn) return;
  if (checked) lv_obj_add_state(btn, LV_STATE_CHECKED);
  else lv_obj_clear_state(btn, LV_STATE_CHECKED);
  sync_card_checked_text_color(btn);
}

