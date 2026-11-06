#pragma once

#include <initializer_list>
#include <utility>
#include "lvgl.h"
#include "card_text_contrast.h"
#include "display_color.h"

// Running background apps retain the normal card surface. Only closed apps
// show the page through a grey outline; focus/press keep the active fill.
constexpr uint32_t app_card_closed_colour(uint32_t neutral) {
  uint32_t result = 0;
  for (unsigned shift : {0u, 8u, 16u})
    result |= (((neutral >> shift) & 255) * 2 / 3) << shift;
  return result;
}

inline void apply_app_card_closed_style(lv_obj_t *button, bool closed,
                                         uint32_t neutral, uint32_t active) {
  if (!button) return;
  const bool was_closed = lv_obj_has_state(button, LV_STATE_USER_1);
  if (!closed) {
    if (was_closed) {
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
  const auto outline = app_card_closed_colour(neutral);
  auto *parent = lv_obj_get_parent(button);
  const auto page_background = parent
      ? (lv_color_to_u32(lv_obj_get_style_bg_color(parent, LV_PART_MAIN)) & 0xFFFFFF)
      : neutral;
  for (const auto state : {LV_STATE_DEFAULT, LV_STATE_CHECKED, LV_STATE_PRESSED,
        static_cast<lv_state_t>(LV_STATE_CHECKED | LV_STATE_PRESSED)}) {
    const auto selector = static_cast<lv_style_selector_t>(LV_PART_MAIN) |
        LV_STATE_USER_1 | static_cast<lv_style_selector_t>(state);
    const bool idle_closed = state == LV_STATE_DEFAULT;
    const auto background = idle_closed ? page_background : active;
    const auto foreground = display_text_color_for_bg(background);
    for (const auto property : {LV_STYLE_BG_COLOR, LV_STYLE_TEXT_COLOR, LV_STYLE_OUTLINE_COLOR}) {
      const auto rgb = property == LV_STYLE_BG_COLOR ? background :
          (property == LV_STYLE_TEXT_COLOR ? foreground : outline);
      const auto colour = lv_color_hex(rgb);
      if (lv_obj_get_local_style_prop(button, property, &value, selector) != LV_STYLE_RES_FOUND ||
          !lv_color_eq(value.color, colour)) {
        lv_style_value_t proposed{};
        proposed.color = colour;
        lv_obj_set_local_style_prop(button, property, proposed, selector);
        style_changed = true;
      }
    }
    // Draw the outline inside the existing footprint so card content and the
    // rounded alpha mask do not move or clip an outside outline.
    const std::pair<lv_style_prop_t, int32_t> numbers[] = {
        {LV_STYLE_BG_OPA, idle_closed ? LV_OPA_TRANSP : LV_OPA_COVER},
        {LV_STYLE_OUTLINE_WIDTH, idle_closed ? 4 : 0},
        {LV_STYLE_OUTLINE_PAD, -4},
        {LV_STYLE_OUTLINE_OPA, LV_OPA_COVER}};
    for (const auto &entry : numbers) {
      if (lv_obj_get_local_style_prop(button, entry.first, &value, selector) != LV_STYLE_RES_FOUND ||
          value.num != entry.second) {
        lv_style_value_t proposed{};
        proposed.num = entry.second;
        lv_obj_set_local_style_prop(button, entry.first, proposed, selector);
        style_changed = true;
      }
    }
  }
  if (!was_closed) lv_obj_add_state(button, LV_STATE_USER_1);
  if (!was_closed || style_changed) sync_card_checked_text_color(button);
}
