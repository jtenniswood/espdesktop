#pragma once

#include <algorithm>
#include "lvgl.h"

#if !LV_DRAW_SW_SUPPORT_A8
#error "App icon label shadows require LVGL alpha-only draw layers"
#endif

namespace espdesktop::app_icon {

inline const lv_style_t *label_shadow_style() {
  static lv_style_t style;
  static const bool initialized = [] {
    lv_style_init(&style);
    lv_style_set_drop_shadow_color(&style, lv_color_black());
    lv_style_set_drop_shadow_opa(&style, LV_OPA_COVER);
    lv_style_set_drop_shadow_radius(&style, 2);
    return true;
  }();
  (void) initialized;
  return &style;
}

inline void spread_label_shadow(lv_event_t *event) {
  auto *task = static_cast<lv_draw_task_t *>(lv_event_get_param(event));
  const auto *label = lv_draw_task_get_label_dsc(task);
  if (!label || label->base.drop_shadow_opa ||
      label->base.layer->color_format != LV_COLOR_FORMAT_A8) return;

  // LVGL draws the glyphs into an alpha mask before it blurs the shadow.
  // Widen that mask by one pixel so the edge stays dark on bright artwork.
  lv_draw_label_dsc_t shadow = *label;
  shadow.base.obj = nullptr;
  constexpr lv_point_t offsets[] = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};
  lv_area_t area;
  lv_draw_task_get_area(task, &area);
  for (const auto &offset : offsets) {
    auto shifted = area;
    lv_area_move(&shifted, offset.x, offset.y);
    lv_draw_label(shadow.base.layer, &shadow, &shifted);
  }
}

inline void apply_label_overlay(lv_obj_t *label) {
  // Artwork contrast takes priority over the button's theme and pressed colours.
  lv_obj_set_flag(label, LV_OBJ_FLAG_USER_2, true);
  lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
  lv_obj_add_style(label, label_shadow_style(), LV_PART_MAIN);
  lv_obj_add_flag(label, LV_OBJ_FLAG_SEND_DRAW_TASK_EVENTS);
  lv_obj_add_event_cb(label, spread_label_shadow, LV_EVENT_DRAW_TASK_ADDED, nullptr);
}

inline void remove_label_overlay(lv_obj_t *label) {
  lv_obj_remove_event_cb(label, spread_label_shadow);
  lv_obj_remove_style(label, label_shadow_style(), LV_PART_MAIN);
  lv_obj_set_flag(label, LV_OBJ_FLAG_USER_2, false);
}

inline void position_label_overlay(lv_obj_t *label, int artwork_width, int artwork_height) {
  constexpr int inset = 3;
  lv_obj_set_width(label, std::max(1, artwork_width - 2 * inset));
  const int label_height = lv_obj_get_height(label);
  lv_obj_align(label, LV_ALIGN_TOP_LEFT, inset,
               std::max(inset, artwork_height - inset - label_height));
}

}  // namespace espdesktop::app_icon
