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

inline void subscribe_control_availability(lv_obj_t *visual_obj, lv_obj_t *input_obj,
                                           const std::string &entity_id) {
  register_ha_control_availability(visual_obj, input_obj);
  if (entity_id.empty()) return;
  ha_subscribe_state(
    entity_id,
    std::function<void(esphome::StringRef)>(
      [visual_obj, input_obj](esphome::StringRef state) {
        apply_control_availability(visual_obj, input_obj, !ha_state_unavailable_ref(state));
      })
  );
}

// Subscribe to a HA sensor entity and update an LVGL label with its numeric value.

inline void subscribe_weather_state(lv_obj_t *icon_lbl, lv_obj_t *text_lbl, const std::string &entity_id) {
  ESP_LOGI("weather", "Subscribing to current weather state for %s", entity_id.c_str());
  uint32_t generation = ha_subscription_generation();
  ha_subscribe_state(
    entity_id,
    std::function<void(esphome::StringRef)>([icon_lbl, text_lbl, entity_id, generation](esphome::StringRef state) {
      if (generation != ha_subscription_generation()) return;
      std::string state_text = string_ref_limited(state, HA_SHORT_STATE_MAX_LEN);
      ESP_LOGI("weather", "Current weather state for %s: %s", entity_id.c_str(), state_text.c_str());
      lv_label_set_display_text(icon_lbl, weather_icon_for_state(state_text));
      lv_label_set_display_text(text_lbl, weather_label_for_state(state_text).c_str());
      notify_dashboard_content_changed();
    })
  );
}

inline void subscribe_garage_state(lv_obj_t *btn_ptr, lv_obj_t *icon_lbl,
                                   TransientStatusLabel *status_label,
                                   const char *closed_icon, const char *open_icon,
                                   const std::string &entity_id,
                                   bool persistent_status = false) {
  ha_subscribe_state(
    entity_id,
    std::function<void(esphome::StringRef)>(
      [btn_ptr, icon_lbl, status_label, closed_icon, open_icon, persistent_status](esphome::StringRef state) {
        std::string state_text = string_ref_limited(state, HA_SHORT_STATE_MAX_LEN);
        bool active = garage_state_is_active(state_text);
        set_card_checked_state(btn_ptr, active);
        lv_label_set_display_text(icon_lbl, garage_state_uses_open_icon(state_text) ? open_icon : closed_icon);
        transient_status_label_show_if_changed(
          status_label, garage_state_label(state_text),
          persistent_status ? false : garage_state_releases_label(state_text));
      })
  );
}

inline void subscribe_gate_state(lv_obj_t *btn_ptr, lv_obj_t *icon_lbl,
                                 TransientStatusLabel *status_label,
                                 const char *closed_icon, const char *open_icon,
                                 const std::string &entity_id,
                                 bool persistent_status = false) {
  register_ha_control_availability(btn_ptr, btn_ptr);
  ha_subscribe_state(
    entity_id,
    std::function<void(esphome::StringRef)>(
      [btn_ptr, icon_lbl, status_label, closed_icon, open_icon, persistent_status](esphome::StringRef state) {
        std::string state_text = string_ref_limited(state, HA_SHORT_STATE_MAX_LEN);
        bool unavailable = ha_state_unavailable_ref(state);
        apply_control_availability(btn_ptr, btn_ptr, !unavailable);
        bool active = garage_state_is_active(state_text);
        set_card_checked_state(btn_ptr, active);
        lv_label_set_display_text(icon_lbl, garage_state_uses_open_icon(state_text) ? open_icon : closed_icon);
        transient_status_label_show_if_changed(
          status_label, garage_state_label(state_text),
          persistent_status ? false : garage_state_releases_label(state_text));
      })
  );
}

inline void subscribe_cover_toggle_state(lv_obj_t *btn_ptr, lv_obj_t *icon_lbl,
                                         TransientStatusLabel *status_label,
                                         const char *closed_icon, const char *open_icon,
                                         const std::string &entity_id) {
  ha_subscribe_state(
    entity_id,
    std::function<void(esphome::StringRef)>(
      [btn_ptr, icon_lbl, status_label, closed_icon, open_icon](esphome::StringRef state) {
        std::string state_text = string_ref_limited(state, HA_SHORT_STATE_MAX_LEN);
        bool active = cover_toggle_state_is_active(state_text);
        set_card_checked_state(btn_ptr, active);
        lv_label_set_display_text(icon_lbl, garage_state_uses_open_icon(state_text) ? open_icon : closed_icon);
        transient_status_label_show_if_changed(
          status_label, garage_state_label(state_text), garage_state_releases_label(state_text));
      })
  );
}

inline void subscribe_lock_state(lv_obj_t *btn_ptr, lv_obj_t *icon_lbl,
                                 TransientStatusLabel *status_label,
                                 const char *locked_icon, const char *unlocked_icon,
                                 LockCardCtx *ctx) {
  if (!ctx) return;
  ha_subscribe_state(
    ctx->entity_id,
    std::function<void(esphome::StringRef)>(
      [btn_ptr, icon_lbl, status_label, locked_icon, unlocked_icon, ctx](esphome::StringRef state) {
        std::string state_text = string_ref_limited(state, HA_SHORT_STATE_MAX_LEN);
        ctx->state = state_text;
        bool active = lock_state_is_active(state_text);
        set_card_checked_state(btn_ptr, active);
        lv_label_set_display_text(icon_lbl,
          lock_state_uses_unlocked_icon(state_text) ? unlocked_icon : locked_icon);
        transient_status_label_show_if_changed(
          status_label, lock_state_label(state_text), lock_state_releases_label(state_text));
      })
  );
}

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
inline void subscribe_friendly_name_preserving_layout(
    lv_obj_t *text_lbl, const std::string &entity_id) {
  ha_subscribe_attribute(
    entity_id, std::string("friendly_name"),
    std::function<void(esphome::StringRef)>([text_lbl](esphome::StringRef name) {
      if (!text_lbl) return;
      configure_button_label_wrap(text_lbl);
      lv_label_set_display_text(
        text_lbl, string_ref_limited(name, HA_FRIENDLY_NAME_MAX_LEN).c_str());
    })
  );
}

// Subscribe to a toggle entity's state; updates checked visual, icon swap, sensor overlay
