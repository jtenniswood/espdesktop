#pragma once

#include <initializer_list>
#include "lvgl.h"
#include "card_text_contrast.h"
#include "display_color.h"

// Keep the background-app fill closer to the neutral surface than the focus
// accent. The same rule works with both themes and custom card colours.
constexpr uint32_t app_card_running_colour(uint32_t neutral, uint32_t active) {
  uint32_t result = 0;
  for (unsigned shift : {0u, 8u, 16u}) {
    const auto channel = (((neutral >> shift) & 255) * 3 + ((active >> shift) & 255)) / 4;
    result |= channel << shift;
  }
  return result;
}

inline void apply_app_card_running_style(lv_obj_t *button, bool running,
                                         uint32_t neutral, uint32_t active) {
  if (!button) return;
  const bool was_running = lv_obj_has_state(button, LV_STATE_USER_1);
  if (!running) {
    if (was_running) {
      lv_obj_remove_state(button, LV_STATE_USER_1);
      sync_card_checked_text_color(button);
    }
    return;
  }
  bool style_changed = false;
  lv_style_value_t value{};
  if (lv_obj_get_local_style_prop(button, LV_STYLE_BG_COLOR, &value, LV_PART_MAIN) == LV_STYLE_RES_FOUND)
    neutral = lv_color_to_u32(value.color) & 0xFFFFFF;
  if (lv_obj_get_local_style_prop(button, LV_STYLE_BG_COLOR, &value,
          static_cast<lv_style_selector_t>(LV_PART_MAIN) | LV_STATE_CHECKED) == LV_STYLE_RES_FOUND)
    active = lv_color_to_u32(value.color) & 0xFFFFFF;
  const auto shade = app_card_running_colour(neutral, active);
  for (const auto state : {LV_STATE_DEFAULT, LV_STATE_CHECKED, LV_STATE_PRESSED,
        static_cast<lv_state_t>(LV_STATE_CHECKED | LV_STATE_PRESSED)}) {
    const auto selector = static_cast<lv_style_selector_t>(LV_PART_MAIN) |
        LV_STATE_USER_1 | static_cast<lv_style_selector_t>(state);
    const auto background = (state == LV_STATE_DEFAULT) ? shade : active;
    const auto foreground = display_text_color_for_bg(background);
    for (const auto property : {LV_STYLE_BG_COLOR, LV_STYLE_TEXT_COLOR}) {
      const auto colour = lv_color_hex(property == LV_STYLE_BG_COLOR ? background : foreground);
      if (lv_obj_get_local_style_prop(button, property, &value, selector) != LV_STYLE_RES_FOUND ||
          !lv_color_eq(value.color, colour)) {
        lv_style_value_t proposed{};
        proposed.color = colour;
        lv_obj_set_local_style_prop(button, property, proposed, selector);
        style_changed = true;
      }
    }
  }
  if (!was_running) lv_obj_add_state(button, LV_STATE_USER_1);
  if (!was_running || style_changed) sync_card_checked_text_color(button);
}
