#pragma once

#include "display_text.h"
#include "icons.h"
#include "screen_lock_state.h"
#include <algorithm>

struct MacLockScreenStyle {
  const lv_font_t *icon_font{nullptr};
  const lv_font_t *title_font{nullptr};
  const lv_font_t *body_font{nullptr};
  lv_coord_t content_width{380};
  lv_coord_t gap{20};
};

inline void refresh_screen_lock_overlay(const MacLockScreenStyle &style) {
  static lv_obj_t *overlay = nullptr;
  static lv_coord_t previous_width = 0;
  static lv_coord_t previous_height = 0;

  if (!screen_lock_enabled()) {
    if (overlay) lv_obj_del(overlay);
    overlay = nullptr;
    return;
  }

  auto *display = lv_disp_get_default();
  const lv_coord_t screen_w = display ? lv_disp_get_hor_res(display) : 480;
  const lv_coord_t screen_h = display ? lv_disp_get_ver_res(display) : 480;
  if (overlay && previous_width == screen_w && previous_height == screen_h) return;
  if (overlay) lv_obj_del(overlay);
  previous_width = screen_w;
  previous_height = screen_h;

  // The system layer sits above the clock, artwork, status and control modals.
  overlay = lv_obj_create(lv_layer_sys());
  control_modal_style_overlay(overlay);
  lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);

  // Use the same palette and centered content stack as the setup pages.
  const auto &theme = current_theme();
  lv_obj_set_style_bg_color(overlay, lv_color_hex(theme.background), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(overlay, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_pad_row(overlay, style.gap, LV_PART_MAIN);
  lv_obj_set_flex_flow(overlay, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(overlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  auto *icon = lv_label_create(overlay);
  if (style.icon_font) lv_obj_set_style_text_font(icon, style.icon_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(icon, lv_color_hex(theme.text_primary), LV_PART_MAIN);
  lv_label_set_text(icon, find_icon("Lock"));

  const lv_coord_t content_width = std::min(style.content_width, screen_w);
  auto *title = lv_label_create(overlay);
  if (style.title_font) lv_obj_set_style_text_font(title, style.title_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(title, lv_color_hex(theme.text_primary), LV_PART_MAIN);
  lv_obj_set_width(title, content_width);
  lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_label_set_display_text(title, espdesktop_i18n_key("locked"));

  auto *instruction = lv_label_create(overlay);
  if (style.body_font) lv_obj_set_style_text_font(instruction, style.body_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(instruction, lv_color_hex(theme.text_muted), LV_PART_MAIN);
  lv_obj_set_width(instruction, content_width);
  lv_obj_set_style_text_align(instruction, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_label_set_display_text(instruction, espdesktop_i18n_key("unlock_mac_to_use_screen"));
}
