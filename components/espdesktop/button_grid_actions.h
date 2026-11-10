#pragma once
#include "grid_layout_config.h"
#include "screen_lock_state.h"


// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.



// Send a Mac volume percentage or the on-card mute/unmute toggle.
inline bool send_slider_action(const std::string &entity_id, int value) {
  if (!companion_volume_control_valid(entity_id)) return false;
  char request_id[24];
  snprintf(request_id, sizeof(request_id), "volume-%08lx",
           static_cast<unsigned long>(companion_next_request_number()));
  return invoke_companion_value(entity_id, value, request_id);
}

inline bool navigation_handle_button_press(const ParsedCfg &config, int slot_num,
                                          lv_obj_t *button);
inline void handle_button_click(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj);

inline void handle_button_press(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj) {
  if (screen_lock_enabled()) return;
  if (slot_num <= 0 || slot_num > MAX_GRID_SLOTS) return;
  const ParsedCfg p = grid_layout_card_config(slot_num, cfg);
  if (navigation_handle_button_press(p, slot_num, btn_obj)) return;
  consume_button_touch_press(btn_obj);
  handle_button_click(cfg, slot_num, btn_obj);
}

// ── Button click dispatch ─────────────────────────────────────────────

namespace espdesktop::cards {
inline bool basic_action_driver_handle_main_click(
    const Context &context, const ParsedCfg &config,
    int slot_number, lv_obj_t *button);
inline bool numeric_selectable_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *button);
inline bool navigation_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *button);
}

// Dispatch supported local and Mac card actions.
inline void handle_button_click(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj) {
  if (screen_lock_enabled()) return;
  (void) btn_obj;
  const ParsedCfg p = grid_layout_card_config(slot_num, cfg);
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
