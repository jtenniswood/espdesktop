#pragma once

#include "companion_controls.h"
#include "screen_lock_state.h"

// The Mac ends a hold if it stops receiving touch confirmations.  A
// confirmation (50) can extend a hold, but only touch-down (100) can start one.
inline constexpr uint32_t COUGH_CONFIRM_INTERVAL_MS = 200;

struct CoughTouch {
  lv_obj_t *button = nullptr;
  uint32_t last_confirmation = 0;
  int previous_mute = 0;
  std::string control;
  std::string computer;
  lv_obj_t *text_label = nullptr;
  std::string resting_label;
};

inline CoughTouch &cough_touch() {
  static CoughTouch touch;
  return touch;
}

inline bool send_cough_button_value(const std::string &control, int value, int preview = 100,
                                    const std::string &computer_id = "") {
  const auto request = "cough-" + std::to_string(companion_next_request_number());
  if (!invoke_companion_value(control, value, request, computer_id)) return false;
  if (value != 50 && control == COMPANION_COUGH_ID) {
    companion_runtime_for(computer_id).preview_mute(COMPANION_COUGH_ID, preview, request);
    companion_paint_mute_preview(COMPANION_COUGH_ID, preview, computer_id);
  }
  return true;
}

inline void cough_button_release(lv_obj_t *button, bool restore_label = true) {
  auto &touch = cough_touch();
  if (!button || touch.button != button) return;
  auto released = std::move(touch);
  touch = {};
  if (restore_label && released.text_label && lv_obj_is_valid(released.text_label))
    lv_label_set_text(released.text_label, released.resting_label.c_str());
  send_cough_button_value(released.control, 0, released.previous_mute, released.computer);
}

inline void cough_button_press(lv_obj_t *button) {
  auto &touch = cough_touch();
  int value = 0;
  if (!button || touch.button || lv_obj_has_state(button, LV_STATE_DISABLED)) return;
  lv_obj_t *text_label = nullptr;
  std::string computer_id;
  auto control = companion_tracked_mute_control(button, &text_label, &computer_id);
  if (companion_computer_locked(computer_id)) return;
  if ((control != COMPANION_COUGH_ID && !companion_obs_cough_control(control)) ||
      !companion_value_for(computer_id, control, value)) return;
  const int previous_mute =
      companion_runtime_for(computer_id).displayed_mute_value(control, value);
  if (!send_cough_button_value(control, 100, 100, computer_id)) return;
  if (companion_obs_cough_control(control)) text_label = nullptr;  // OBS confirms the actual mute state.
  touch = {button, esphome::millis(), previous_mute, std::move(control), std::move(computer_id),
           text_label, {}};
  if (text_label) {
    touch.resting_label = lv_label_get_text(text_label);
    lv_label_set_display_text(text_label, espdesktop_i18n("Muted"));
  }
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
      const bool locked = companion_computer_locked(touch.computer);
      if (locked || lv_obj_get_screen(button) != lv_scr_act() ||
          lv_obj_has_flag(button, LV_OBJ_FLAG_HIDDEN) ||
          lv_obj_has_state(button, LV_STATE_DISABLED) || !cough_pointer_within(button)) {
        cough_button_release(button);
      } else if (esphome::millis() - touch.last_confirmation >= COUGH_CONFIRM_INTERVAL_MS) {
        touch.last_confirmation = esphome::millis();
        if (!send_cough_button_value(touch.control, 50, 100, touch.computer))
          cough_button_release(button);
      }
      break;
    }
    case LV_EVENT_RELEASED:
    case LV_EVENT_PRESS_LOST:
      cough_button_release(button);
      break;
    case LV_EVENT_DELETE:
      cough_button_release(button, false);
      break;
    default:
      break;
  }
}

inline void unbind_cough_button(lv_obj_t *button) {
  cough_button_release(button);
  if (button) lv_obj_remove_event_cb(button, cough_button_event);
}

inline void bind_cough_button(lv_obj_t *button, lv_obj_t *icon_label, lv_obj_t *text_label, const char *unmuted,
                              const char *muted, const std::string &control, bool subpage,
                              const std::string &computer_id = "") {
  unbind_cough_button(button);
  companion_track_mute(button, control, icon_label, unmuted, muted, text_label, computer_id);
  static bool subpage_press = true;
  lv_obj_add_event_cb(button, cough_button_event, LV_EVENT_ALL, subpage ? &subpage_press : nullptr);
}
