#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

// ── Home Assistant subscriptions ──────────────────────────────────────

// The grid owns device colour correction; callbacks sample the live neutral
// instead of retaining the palette that was active when they subscribed.
inline uint32_t current_grid_sensor_color();
inline uint32_t current_grid_sensor_surface_color();

inline std::string label_text_or_empty(lv_obj_t *label) {
  if (!label) return "";
  const char *text = lv_label_get_text(label);
  return text ? std::string(text) : "";
}

inline void apply_sensor_active_color(lv_obj_t *btn, bool active_color,
                                      esphome::StringRef state,
                                      uint32_t on_color, uint32_t sensor_color,
                                      bool unavailable,
                                      bool numeric_mode = false,
                                      bool custom_background = false) {
  if (!btn || !active_color) return;
  const bool active = !unavailable && sensor_active_color_state_ref(state, numeric_mode);
  theme_set_content_background(btn, active || custom_background);
  uint32_t next_color = active ? on_color : sensor_color;
  lv_obj_set_style_bg_color(btn, lv_color_hex(next_color),
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  lv_obj_set_style_text_color(btn, lv_color_hex(active || custom_background ? display_text_color_for_bg(next_color) : current_theme().text_primary),
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  sync_card_checked_text_color(btn);
}

inline void apply_control_availability(lv_obj_t *visual_obj, lv_obj_t *input_obj,
                                       bool available) {
  if (visual_obj) {
    set_card_disabled_state(visual_obj, !available);
  }
  if (input_obj && input_obj != visual_obj) {
    if (available) lv_obj_clear_state(input_obj, LV_STATE_DISABLED);
    else lv_obj_add_state(input_obj, LV_STATE_DISABLED);
  }
  if (!input_obj) return;
  if (available) lv_obj_add_flag(input_obj, LV_OBJ_FLAG_CLICKABLE);
  else lv_obj_clear_flag(input_obj, LV_OBJ_FLAG_CLICKABLE);
}

inline void register_ha_control_availability(lv_obj_t *visual_obj, lv_obj_t *input_obj) {
  apply_control_availability(visual_obj, input_obj, true);
}

// Subscribe to a HA sensor entity and update an LVGL label with its numeric value.

// Subscribe to an entity's friendly_name attribute and use it as the button label
inline void subscribe_friendly_name(TransientStatusLabel *status_label,
                                    const std::string &entity_id) {
  ha_subscribe_attribute(
    entity_id, std::string("friendly_name"),
    std::function<void(esphome::StringRef)>([status_label](esphome::StringRef name) {
      transient_status_label_set_steady(status_label, string_ref_limited(name, HA_FRIENDLY_NAME_MAX_LEN));
    })
  );
}

inline void subscribe_friendly_name(lv_obj_t *text_lbl, const std::string &entity_id) {
  ha_subscribe_attribute(
    entity_id, std::string("friendly_name"),
    std::function<void(esphome::StringRef)>([text_lbl](esphome::StringRef name) {
      set_wrapped_button_label_text(text_lbl, string_ref_limited(name, HA_FRIENDLY_NAME_MAX_LEN));
    })
  );
}

// Slider cards zero the button padding so their fill can reach the tile edges,
// then position the label with a captured inset. Updating the friendly name
// must not re-anchor that label at (0, 0), or it becomes flush with the tile.

// Subscribe to a toggle entity's state; updates checked visual, icon swap, sensor overlay
