#pragma once
#include "grid_layout_config.h"
#include "screen_lock_state.h"
#include "companion_screen_lock.h"
#include "button_grid_cough.h"


// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.



// Send a Mac volume percentage or the on-card mute/unmute toggle.
inline bool send_slider_action(const std::string &entity_id, int value,
                               const std::string &computer_id = "") {
  if (!companion_volume_control_valid(entity_id) ||
      companion_computer_locked(computer_id)) return false;
  char request_id[24];
  snprintf(request_id, sizeof(request_id), "volume-%08lx",
           static_cast<unsigned long>(companion_next_request_number()));
  return invoke_companion_value(entity_id, value, request_id, computer_id);
}

inline bool navigation_handle_button_press(const ParsedCfg &config, int slot_num,
                                          lv_obj_t *button);
inline void handle_button_click(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj, bool touch_followup = false);

inline bool obs_action_keeps_touch(const ParsedCfg &config) {
  return config.type == "companion" && companion_obs_momentary_action(config.entity);
}

// LVGL sends a long press at 500 ms and then suppresses the short click, so a
// slow tap would otherwise lose its action. Remember the tap at long-press
// time and run it when the finger lifts instead of firing mid-hold.
inline lv_obj_t *&pending_hold_button() {
  static lv_obj_t *button = nullptr;
  return button;
}
inline std::string &pending_hold_config() {
  static std::string config;
  return config;
}
inline int &pending_hold_slot() {
  static int slot = 0;
  return slot;
}
inline void clear_pending_hold_click(lv_obj_t *button = nullptr) {
  if (button != nullptr && pending_hold_button() != button) return;
  pending_hold_button() = nullptr;
  pending_hold_config().clear();
  pending_hold_slot() = 0;
}
inline void pending_hold_release_event(lv_event_t *event) {
  auto *button = static_cast<lv_obj_t *>(lv_event_get_target(event));
  const auto code = lv_event_get_code(event);
  if (code == LV_EVENT_PRESS_LOST || code == LV_EVENT_DELETE) {
    clear_pending_hold_click(button);
    return;
  }
  if (code != LV_EVENT_RELEASED || pending_hold_button() != button) return;
  const std::string config = pending_hold_config();
  const int slot = pending_hold_slot();
  clear_pending_hold_click(button);
  handle_button_click(config, slot, button, true);
}
inline void arm_pending_hold_click(lv_obj_t *button, const std::string &cfg,
                                   int slot_num) {
  if (button == nullptr) return;
  pending_hold_button() = button;
  pending_hold_config() = cfg;
  pending_hold_slot() = slot_num;
  for (uint32_t i = 0; i < lv_obj_get_event_count(button); ++i) {
    lv_event_dsc_t *event = lv_obj_get_event_dsc(button, i);
    if (event != nullptr && lv_event_dsc_get_cb(event) == pending_hold_release_event)
      return;
  }
  lv_obj_add_event_cb(button, pending_hold_release_event, LV_EVENT_RELEASED, nullptr);
  lv_obj_add_event_cb(button, pending_hold_release_event, LV_EVENT_PRESS_LOST, nullptr);
  lv_obj_add_event_cb(button, pending_hold_release_event, LV_EVENT_DELETE, nullptr);
}

inline void handle_button_press(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj) {
  if (slot_num <= 0 || slot_num > MAX_GRID_SLOTS || touch_actions_consumed()) return;
  clear_pending_hold_click(btn_obj);
  const ParsedCfg p = grid_layout_card_config(slot_num, cfg);
  // A locked computer only blocks its own cards. Cards without a computer
  // option follow the primary computer; non-Companion cards keep the legacy
  // display-wide behaviour.
  if (card_action_locked(p)) return;
  if (p.type == "companion_cough" || p.type == "companion_obs_cough") {
    cough_button_press(btn_obj);
    return;
  }
  // Ordinary cards act on release (see handle_button_click) so a swipe can
  // cancel the press. Keep touch-down only for cards that need it.
  if (!obs_action_keeps_touch(p)) return;
  if (navigation_handle_button_press(p, slot_num, btn_obj)) return;
  // These OBS actions stay on the page and use the native pressed colour until release.
  consume_button_touch_press(btn_obj);
  handle_button_click(cfg, slot_num, btn_obj);
}

namespace espdesktop::cards {
inline bool card_hold_action_end_call(const ParsedCfg &config, lv_obj_t *button);
}

// A configured hold action runs instead of the normal tap. Cards without one
// keep the tap for release, even after LVGL's long-press threshold.
inline void handle_button_hold(const std::string &cfg, int slot_num,
                               lv_obj_t *btn_obj) {
  if (slot_num <= 0 || slot_num > MAX_GRID_SLOTS || touch_actions_consumed()) return;
  const ParsedCfg p = grid_layout_card_config(slot_num, cfg);
  if (card_action_locked(p)) return;
  if (card_hold_action(p) == "end_call") {
    espdesktop::cards::card_hold_action_end_call(p, btn_obj);
    return;
  }
  // These cards already ran their touch-down action or own their own release.
  if (obs_action_keeps_touch(p) || p.type == "companion_cough" ||
      p.type == "companion_obs_cough") return;
  arm_pending_hold_click(btn_obj, cfg, slot_num);
}

// ── Button click dispatch ─────────────────────────────────────────────

namespace espdesktop::cards {
inline bool basic_action_driver_handle_main_click(
    const Context &context, const ParsedCfg &config,
    int slot_number, lv_obj_t *button);
inline bool card_hold_action_end_call(const ParsedCfg &config, lv_obj_t *button);
inline bool numeric_selectable_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *button);
inline bool navigation_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *button);
}

// Dispatch supported local and Mac card actions.
inline void handle_button_click(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj, bool touch_followup) {
  if (touch_actions_consumed()) return;
  (void) btn_obj;
  const ParsedCfg p = grid_layout_card_config(slot_num, cfg);
  if (card_action_locked(p)) return;
  if (touch_followup && obs_action_keeps_touch(p)) return;
  if (card_runtime_type_retired(p.type) || retired_home_assistant_card(p)) return;
  const auto context = card_runtime_context(p);
  ESP_LOGI("button", "Main button %d clicked: type=%s entity=%s mode=%s label=%s",
           slot_num, p.type.c_str(), p.entity.c_str(), p.sensor.c_str(), p.label.c_str());
  if (card_runtime_passive(context)) return;
  if (espdesktop::cards::basic_action_driver_handle_main_click(
        context, p, slot_num, btn_obj)) return;
  if (espdesktop::cards::numeric_selectable_driver_handle_main_click(
        context, p, btn_obj)) return;
  if (espdesktop::cards::navigation_driver_handle_main_click(
        context, p, btn_obj)) return;
  ESP_LOGE("card_runtime", "Card has no main-grid action driver: type=%s",
           p.type.c_str());
}
