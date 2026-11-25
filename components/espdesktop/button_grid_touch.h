#pragma once

#include <vector>

#include "card_text_contrast.h"
#include "esphome/core/hal.h"

// Drag controls (volume sliders) keep the touch so a screen pager does not
// steal it. Identify them by widget type instead of an object flag: the theme
// already uses every LV_OBJ_FLAG_USER_n bit for background ownership. A
// disabled or non-interactive slider cannot own a drag, and a slider only owns
// gestures along its own axis so the other direction can still page.
inline bool touch_object_owns_gesture(lv_obj_t *object, lv_dir_t direction) {
  if (object == nullptr || !lv_obj_check_type(object, &lv_slider_class) ||
      lv_obj_has_state(object, LV_STATE_DISABLED) ||
      !lv_obj_has_flag(object, LV_OBJ_FLAG_CLICKABLE))
    return false;
  const bool vertical = lv_obj_get_height(object) >= lv_obj_get_width(object);
  const bool vertical_gesture = direction == LV_DIR_TOP || direction == LV_DIR_BOTTOM;
  return vertical == vertical_gesture;
}

// A page change swallows the release that follows its fling so the new screen
// cannot receive a card tap from the same touch.
inline uint32_t &touch_action_guard_until() {
  static uint32_t value = 0;
  return value;
}
inline void touch_consume_actions(uint32_t duration_ms = 300) {
  touch_action_guard_until() = esphome::millis() + duration_ms;
}
inline bool touch_actions_consumed() {
  return esphome::millis() < touch_action_guard_until();
}

// Track each pointer's touch-down point so a hold action can tell a stationary
// hold from a swipe that happens to start on the same card.
struct TouchPressTrack {
  lv_indev_t *device = nullptr;
  lv_point_t point{};
};
inline std::vector<TouchPressTrack> &touch_press_tracks() {
  static std::vector<TouchPressTrack> tracks;
  return tracks;
}
inline void touch_record_press(lv_indev_t *device, const lv_point_t &point) {
  if (device == nullptr) return;
  for (auto &track : touch_press_tracks()) {
    if (track.device == device) {
      track.point = point;
      return;
    }
  }
  touch_press_tracks().push_back({device, point});
}
inline bool touch_pointer_moved(lv_indev_t *device, lv_coord_t threshold = 24) {
  if (device == nullptr) return false;
  for (const auto &track : touch_press_tracks()) {
    if (track.device != device) continue;
    lv_point_t point{};
    lv_indev_get_point(device, &point);
    const lv_coord_t dx = point.x - track.point.x;
    const lv_coord_t dy = point.y - track.point.y;
    return dx * dx + dy * dy > threshold * threshold;
  }
  return false;
}

// Set while a full-screen image popup is open so screen paging ignores touch
// gestures that belong to the popup.
inline bool &image_popup_open() {
  static bool open = false;
  return open;
}

// Discrete buttons act on touch-down. Consume the pointer before an action can
// replace/delete the control, so release cannot repeat it or hit the next UI.
inline void consume_button_touch_press(lv_obj_t *button) {
  if (auto *indev = lv_indev_get_act()) lv_indev_wait_release(indev);
  if (button) {
    lv_obj_clear_state(button, LV_STATE_PRESSED);
    // The consumed release will not run the usual contrast callback.
    sync_bound_card_text_color(button);
  }
}

inline void bind_immediate_button_action(lv_obj_t *button, lv_event_cb_t action,
                                         void *user_data) {
  lv_obj_add_event_cb(button, [](lv_event_t *event) {
    consume_button_touch_press(static_cast<lv_obj_t *>(lv_event_get_target(event)));
  }, LV_EVENT_PRESSED, nullptr);
  lv_obj_add_event_cb(button, action, LV_EVENT_PRESSED, user_data);
}
