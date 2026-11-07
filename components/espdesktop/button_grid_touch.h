#pragma once

#include "card_text_contrast.h"

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
