#pragma once

#include "lvgl.h"
#include "src/core/lv_obj_private.h"
#include "src/core/lv_obj_style_private.h"

// The native theme attaches separate transition-only styles. An override with
// zero duration still creates animations and exposes their old colour until the
// animation timer runs. Remove those styles instead of animating a zero fade.
inline void remove_button_state_transitions(lv_obj_t *button) {
  if (!button) return;
  for (uint32_t i = 0; i < button->style_cnt;) {
    const auto entry = button->styles[i];
    lv_style_value_t value{};
    if (entry.is_trans ||
        lv_style_get_prop(entry.style, LV_STYLE_TRANSITION, &value) != LV_STYLE_RES_FOUND) {
      ++i;
      continue;
    }
    if (entry.is_local) {
      lv_obj_remove_local_style_prop(button, LV_STYLE_TRANSITION, entry.selector);
      ++i;
    } else if (entry.style->prop_cnt == 1) {
      // Preserve the native theme's colours, layout, radius and text styles.
      const auto count = button->style_cnt;
      lv_obj_remove_style(button, entry.style, entry.selector);
      if (button->style_cnt == count) ++i;
    } else {
      ++i;
    }
  }
}

inline void apply_instant_button_feedback(lv_obj_t *btn) {
  if (!btn) return;
  remove_button_state_transitions(btn);
  static const lv_state_t states[] = {
      LV_STATE_DEFAULT, LV_STATE_CHECKED, LV_STATE_PRESSED,
      static_cast<lv_state_t>(LV_STATE_CHECKED | LV_STATE_PRESSED)};
  for (const auto state : states) {
    const auto selector = static_cast<lv_style_selector_t>(LV_PART_MAIN) |
        static_cast<lv_style_selector_t>(state);
    lv_obj_set_style_outline_width(btn, 0, selector);
  }
}
