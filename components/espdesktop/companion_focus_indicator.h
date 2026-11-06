#pragma once

#include <algorithm>
#include "lvgl.h"

// Draw over the existing bottom margin after the icon and label. No child or
// layout space is added, so app artwork, card sizes and padding stay unchanged.
inline void companion_app_focus_indicator_draw(lv_event_t *event) {
  if (lv_event_get_code(event) != LV_EVENT_DRAW_POST) return;
  auto *button = static_cast<lv_obj_t *>(lv_event_get_target(event));
  if (!lv_obj_has_state(button, LV_STATE_USER_1) ||
      lv_obj_has_state(button, LV_STATE_DISABLED)) return;
  lv_area_t area;
  lv_obj_get_coords(button, &area);
  const int width = area.x2 - area.x1 + 1;
  const int height = area.y2 - area.y1 + 1;
  if (width < 12 || height < 12) return;
  const int bar_width = width / 4;
  const int bar_height = std::max(2, std::min(4, height / 50));
  const int inset = std::max(3, std::min(6, height / 30));
  area.x1 += (width - bar_width) / 2;
  area.x2 = area.x1 + bar_width - 1;
  area.y2 -= inset;
  area.y1 = area.y2 - bar_height + 1;
  lv_draw_rect_dsc_t descriptor;
  lv_draw_rect_dsc_init(&descriptor);
  descriptor.bg_color = lv_obj_get_style_text_color(button, LV_PART_MAIN);
  descriptor.bg_opa = LV_OPA_COVER;
  descriptor.radius = LV_RADIUS_CIRCLE;
#if LVGL_VERSION_MAJOR >= 9
  lv_draw_rect(lv_event_get_layer(event), &descriptor, &area);
#else
  lv_draw_rect(lv_event_get_draw_ctx(event), &descriptor, &area);
#endif
}

inline void companion_reset_app_focus_indicator(lv_obj_t *button) {
  if (!button) return;
  lv_obj_remove_event_cb_with_user_data(button, companion_app_focus_indicator_draw, nullptr);
  lv_obj_clear_state(button, LV_STATE_USER_1);
}

inline void companion_bind_app_focus_indicator(lv_obj_t *button) {
  if (!button) return;
  companion_reset_app_focus_indicator(button);
  lv_obj_add_event_cb(button, companion_app_focus_indicator_draw, LV_EVENT_DRAW_POST, nullptr);
}
