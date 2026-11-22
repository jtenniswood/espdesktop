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
    lv_style_set_drop_shadow_opa(&style, LV_OPA_90);
    lv_style_set_drop_shadow_radius(&style, 3);
    lv_style_set_drop_shadow_offset_y(&style, 1);
    return true;
  }();
  (void) initialized;
  return &style;
}

inline void apply_label_overlay(lv_obj_t *label) {
  // Artwork contrast takes priority over the button's theme and pressed colours.
  lv_obj_set_flag(label, LV_OBJ_FLAG_USER_2, true);
  lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
  lv_obj_add_style(label, label_shadow_style(), LV_PART_MAIN);
}

inline void remove_label_overlay(lv_obj_t *label) {
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
