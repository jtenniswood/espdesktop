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

inline void handle_button_press(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj) {
  if (slot_num <= 0 || slot_num > MAX_GRID_SLOTS || touch_actions_consumed()) return;
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
  const bool app_subpage_press = companion_app_shortcuts_enabled(p) &&
      companion_app_subpage_opens_on_press(p.entity, companion_card_computer(p));
  if (!obs_action_keeps_touch(p) && !app_subpage_press) return;
  if (navigation_handle_button_press(p, slot_num, btn_obj)) return;
  // These OBS actions stay on the page and use the native pressed colour until release.
  if (!obs_action_keeps_touch(p)) consume_button_touch_press(btn_obj);
  handle_button_click(cfg, slot_num, btn_obj);
}

namespace espdesktop::cards {
inline bool card_hold_action_end_call(const ParsedCfg &config, lv_obj_t *button);
}

// A configured hold action runs instead of the normal tap. Cards without one
// keep the established behaviour of treating a hold as an ordinary click.
inline void handle_button_hold(const std::string &cfg, int slot_num,
                               lv_obj_t *btn_obj) {
  if (slot_num <= 0 || slot_num > MAX_GRID_SLOTS || touch_actions_consumed()) return;
  const ParsedCfg p = grid_layout_card_config(slot_num, cfg);
  if (card_action_locked(p)) return;
  if (card_hold_action(p) == "end_call") {
    espdesktop::cards::card_hold_action_end_call(p, btn_obj);
    return;
  }
  handle_button_click(cfg, slot_num, btn_obj, true);
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
