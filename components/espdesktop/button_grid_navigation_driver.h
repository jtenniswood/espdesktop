#pragma once

// Subpage navigation owns its parent visual, Mac statistics,
// screen target registration, navigation click, and target cleanup.
// Contract coverage marker: "subpage".

namespace espdesktop::cards {

inline bool navigation_driver_matches(const Context &context) {
  return context.runtime.driver == card_runtime::CardDriverId::SUBPAGE;
}

inline bool navigation_driver_owns_subpage(
    const Context &context, const ParsedCfg &config) {
  return navigation_driver_matches(context) || companion_app_shortcuts_enabled(config);
}

inline bool navigation_driver_parent_companion_stat_state_enabled(
    const ParsedCfg &config, const Context &context) {
  return navigation_driver_matches(context) &&
         subpage_companion_stat_config(config);
}

inline bool navigation_driver_setup_visual(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const GridConfig &grid, const DisplayProfile &display) {
  if (!navigation_driver_matches(context)) return false;
  if (navigation_driver_parent_companion_stat_state_enabled(config, context)) {
    setup_subpage_parent_state_card(
      slot, config, display_sensor_font(display),
      grid.subpage_chevrons_enabled, grid.subpage_chevron_x,
      grid.subpage_chevron_y, grid.subpage_chevron_text_width_percent);
    const std::string unit = trim_display_unit(
      config.unit.empty() ? subpage_companion_stat_default_unit(config.entity) : config.unit);
    lv_label_set_display_text(slot.icon_lbl, find_icon(companion_metric_icon(config.entity)));
    lv_obj_clear_flag(slot.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(slot.sensor_container, LV_OBJ_FLAG_HIDDEN);
    companion_track_metric_card(
      slot.btn, slot.text_lbl, nullptr, config.entity, unit,
      parse_precision(config.precision), true,
      !cfg_option_token_present(config.options, "stat_labels_off"));
  } else {
    setup_toggle_visual(slot, config);
  }
  return true;
}

inline bool navigation_driver_attach_interaction(
    BtnSlot &, const ParsedCfg &, const Context &context) {
  return navigation_driver_matches(context);
}

inline bool navigation_driver_refresh_layout(
    BtnSlot &slot, const ParsedCfg &, const Context &context,
    const GridConfig &grid) {
  if (!navigation_driver_matches(context)) return false;
  set_subpage_chevron_visible(
    slot, grid.subpage_chevrons_enabled, grid.subpage_chevron_x,
    grid.subpage_chevron_y, grid.subpage_chevron_text_width_percent);
  return true;
}

inline bool navigation_driver_cleanup(
    BtnSlot &slot, const ParsedCfg &, const Context &context) {
  if (!navigation_driver_matches(context)) return false;
  if (slot.btn) lv_obj_set_user_data(slot.btn, nullptr);
  return true;
}

struct NavigationDriverParentState {
  bool *has_sensor = nullptr;
  bool *sensor_text_mode = nullptr;
  bool *has_icon_on = nullptr;
  const char **icon_off = nullptr;
  const char **icon_on = nullptr;
};

inline bool navigation_driver_bind_main(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const NavigationDriverParentState &state) {
  if (!navigation_driver_matches(context)) return false;

  if (navigation_driver_parent_companion_stat_state_enabled(config, context)) {
    const std::string unit = trim_display_unit(
      config.unit.empty() ? subpage_companion_stat_default_unit(config.entity) : config.unit);
    lv_label_set_display_text(slot.icon_lbl, find_icon(companion_metric_icon(config.entity)));
    lv_obj_clear_flag(slot.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(slot.sensor_container, LV_OBJ_FLAG_HIDDEN);
    companion_track_metric_card(
      slot.btn, slot.text_lbl, nullptr, config.entity, unit,
      parse_precision(config.precision), true,
      !cfg_option_token_present(config.options, "stat_labels_off"));
    return true;
  }

  return true;
}

inline bool navigation_driver_own_subpage(
    BtnSlot &parent_slot, const ParsedCfg &config, const Context &context,
    int slot_number, int display_order, lv_obj_t *screen) {
  if (!navigation_driver_owns_subpage(context, config) || !screen) return false;
  const std::string kind = companion_app_shortcuts_enabled(config)
    ? "app_shortcuts"
    : normalize_subpage_kind(cfg_option_value(config.options, "subpage_kind"));
  navigation_register_subpage(
    slot_number, display_order,
    kind,
    screen);
  if (parent_slot.btn) lv_obj_set_user_data(parent_slot.btn, screen);
  return true;
}

inline bool navigation_driver_handle_main_click(
    const Context &context, const ParsedCfg &, lv_obj_t *button) {
  if (!navigation_driver_matches(context)) return false;
  lv_obj_t *screen = button
    ? static_cast<lv_obj_t *>(lv_obj_get_user_data(button)) : nullptr;
  if (screen) {
    lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
  }
  return true;
}

}  // namespace espdesktop::cards
