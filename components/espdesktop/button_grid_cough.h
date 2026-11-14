#pragma once

#include "companion_controls.h"
#include "screen_lock_state.h"

// The Mac ends a hold if it stops receiving touch confirmations.  A
// confirmation (50) can extend a hold, but only touch-down (100) can start one.
inline constexpr uint32_t COUGH_CONFIRM_INTERVAL_MS = 200;

struct CoughTouch {
  lv_obj_t *button = nullptr;
  uint32_t last_confirmation = 0;
};

inline CoughTouch &cough_touch() {
  static CoughTouch touch;
  return touch;
}

inline bool send_cough_button_value(int value) {
  return invoke_companion_value(COMPANION_COUGH_ID, value,
    "cough-" + std::to_string(companion_next_request_number()));
}

inline void cough_button_release(lv_obj_t *button) {
  auto &touch = cough_touch();
  if (!button || touch.button != button) return;
  touch.button = nullptr;
  send_cough_button_value(0);
}

inline void cough_button_press(lv_obj_t *button) {
  auto &touch = cough_touch();
  int value = 0;
  if (!button || touch.button || screen_lock_enabled() ||
      lv_obj_has_state(button, LV_STATE_DISABLED) ||
      !companion_value(COMPANION_COUGH_ID, value)) return;
  if (send_cough_button_value(100)) touch = {button, esphome::millis()};
}

inline bool cough_pointer_within(lv_obj_t *button) {
  auto *input = lv_indev_active();
  if (!input || lv_indev_get_type(input) != LV_INDEV_TYPE_POINTER) return true;
  lv_point_t point;
  lv_area_t bounds;
  lv_indev_get_point(input, &point);
  lv_obj_get_coords(button, &bounds);
  return point.x >= bounds.x1 && point.x <= bounds.x2 &&
         point.y >= bounds.y1 && point.y <= bounds.y2;
}

inline void cough_button_event(lv_event_t *event) {
  auto *button = static_cast<lv_obj_t *>(lv_event_get_target(event));
  switch (lv_event_get_code(event)) {
    case LV_EVENT_PRESSED:
      if (lv_event_get_user_data(event)) cough_button_press(button);
      break;
    case LV_EVENT_PRESSING: {
      auto &touch = cough_touch();
      if (touch.button != button) break;
      if (screen_lock_enabled() || lv_obj_get_screen(button) != lv_scr_act() ||
          lv_obj_has_flag(button, LV_OBJ_FLAG_HIDDEN) ||
          lv_obj_has_state(button, LV_STATE_DISABLED) || !cough_pointer_within(button)) {
        cough_button_release(button);
      } else if (esphome::millis() - touch.last_confirmation >= COUGH_CONFIRM_INTERVAL_MS) {
        touch.last_confirmation = esphome::millis();
        if (!send_cough_button_value(50)) cough_button_release(button);
      }
      break;
    }
    case LV_EVENT_RELEASED:
    case LV_EVENT_PRESS_LOST:
    case LV_EVENT_DELETE:
      cough_button_release(button);
      break;
    default:
      break;
  }
}

inline void unbind_cough_button(lv_obj_t *button) {
  cough_button_release(button);
  if (button) lv_obj_remove_event_cb(button, cough_button_event);
}

inline void bind_cough_button(lv_obj_t *button, lv_obj_t *label, const char *unmuted,
                              const char *muted, bool subpage) {
  unbind_cough_button(button);
  companion_track_mute(button, COMPANION_COUGH_ID, label, unmuted, muted);
  static bool subpage_press = true;
  lv_obj_add_event_cb(button, cough_button_event, LV_EVENT_ALL, subpage ? &subpage_press : nullptr);
}
