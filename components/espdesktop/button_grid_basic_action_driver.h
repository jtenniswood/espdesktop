#pragma once

// Mac Companion controls.
// The same visual, binding, interaction, layout, and cleanup entry points serve
// main-grid and subpage cards while preserving their established ownership.
// Contract coverage markers: type == "", "alarm_action",
// "companion", "fan_switch", "light_switch", "push".

namespace espdesktop::cards {

inline bool basic_action_driver_matches(const Context &context,
                                        const ParsedCfg &) {
  using Driver = card_runtime::CardDriverId;
  switch (context.runtime.driver) {
    case Driver::COMPANION:
      return true;
    default:
      return false;
  }
}

inline bool basic_action_driver_setup_visual(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    uint32_t sensor_color = theme_display_color(current_theme().surface_secondary)) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    case Driver::COMPANION:
      setup_companion_card(slot, config, sensor_color);
      break;
    default:
      setup_toggle_visual(slot, config);
      break;
  }
  return true;
}

inline bool basic_action_driver_attach_interaction(
    BtnSlot &slot, const ParsedCfg &config, const Context &context) {
  if (context.runtime.driver == card_runtime::CardDriverId::COMPANION &&
      companion_metric_key_valid(config.entity)) {
    lv_obj_clear_flag(slot.btn, LV_OBJ_FLAG_CLICKABLE);
  }
  return basic_action_driver_matches(context, config);
}

inline bool basic_action_driver_refresh_layout(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const DisplayProfile &display, int row_span, int col_span) {
  if (context.runtime.driver == card_runtime::CardDriverId::COMPANION &&
      companion_metric_key_valid(config.entity)) {
    if (large_number_square_card_layout(row_span, col_span) &&
        card_large_numbers_active_for_layout(config, row_span, col_span) &&
        display_large_sensor_font(display)) {
      apply_large_sensor_number_style(
        slot, display_large_sensor_font(display),
        display_large_sensor_unit_offset_percent(display));
    } else if (slot.sensor_lbl && display_sensor_font(display)) {
      lv_obj_set_style_text_font(slot.sensor_lbl, display_sensor_font(display), LV_PART_MAIN);
    }
  }
  return basic_action_driver_matches(context, config);
}

inline bool basic_action_driver_cleanup(
    BtnSlot &, const ParsedCfg &config, const Context &context) {
  // Main-grid allocations are released by grid_phase2; subpage allocations
  // are tied to their LVGL owner. Local registries reset before each rebuild.
  return basic_action_driver_matches(context, config);
}

template<typename T>
inline T *basic_action_driver_track(const Context &context,
                                    lv_obj_t *owner, T *ptr) {
  return context.surface == Surface::SUBPAGE
    ? grid_delete_with_owner(owner, ptr)
    : grid_track_runtime_allocation(owner, ptr);
}

struct ToggleDriverState {
  bool *has_sensor = nullptr;
  bool *sensor_text_mode = nullptr;
  bool *has_icon_on = nullptr;
  const char **icon_off = nullptr;
  const char **icon_on = nullptr;
};

inline bool basic_action_driver_bind_main(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const GridConfig &, const CardPalette &,
    const DisplayProfile &, lv_obj_t *, int,
    ToggleDriverState) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    default:
      break;
  }
  return true;
}

struct BasicActionSubpageEnvironment {
  const GridConfig *grid_config = nullptr;
  const ParsedCfg *parent_config = nullptr;
  CardPalette palette;
  DisplayProfile display;
  lv_obj_t *grid_page = nullptr;
  int grid_cols = 1;
  std::function<void(const std::string &)> add_parent_indicator;
  bool parent_indicator_enabled = false;
  int *child_allocation_index = nullptr;
  int child_capacity = 0;
  bool *child_was_on = nullptr;
  lv_obj_t *parent_btn = nullptr;
  lv_obj_t *parent_icon = nullptr;
  int parent_index = 0;
  bool parent_has_icon_on = false;
  const char *parent_icon_off = nullptr;
  const char *parent_icon_on = nullptr;
  int *parent_on_count = nullptr;
};

struct CompanionSubpageActionContext {
  ParsedCfg card;
  std::string required_focus_id;
};

inline bool basic_action_driver_bind_subpage(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const BasicActionSubpageEnvironment &environment) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    case Driver::COMPANION: {
      if (companion_metric_key_valid(config.entity)) break;
      std::string required_focus_id;
      if (config.type == "companion" && environment.parent_config &&
          companion_app_shortcuts_enabled(*environment.parent_config) &&
          config.entity.rfind("shortcut.", 0) == 0)
        required_focus_id = environment.parent_config->entity;
      auto *click = grid_delete_with_owner(slot.btn,
        new CompanionSubpageActionContext{config, required_focus_id});
      companion_require_card_focus(slot.btn, required_focus_id);
      bind_immediate_button_action(slot.btn, [](lv_event_t *event) {
        auto *context = static_cast<CompanionSubpageActionContext *>(lv_event_get_user_data(event));
        if (!context) return;
        const auto *card = &context->card;
        if (companion_app_shortcuts_enabled(*card)) {
          auto *button = static_cast<lv_obj_t *>(lv_event_get_target(event));
          const auto started = esphome::millis();
          const bool active = companion_action_active(card->entity);
          auto *screen = (companion_auto_open_app_subpages() || active)
              ? navigation_screen_for_button(button) : nullptr;
          if (screen && lv_obj_is_valid(screen)) {
            navigation_begin_page_open(screen, started);
            navigation_show_companion_subpage(screen, /*from_card=*/true);
            refresh_visible_image_cards();
            if (!companion_auto_open_app_subpages()) return;
          }
        }
        char request_id[24];
        snprintf(request_id, sizeof(request_id), "sub-%08lx",
                 static_cast<unsigned long>(companion_next_request_number()));
        const bool invoked = companion_encoded_url(card->sensor).empty()
          ? invoke_companion_action_for_app(card->entity, request_id, context->required_focus_id,
                                    companion_folder_open_behavior(*card),
                                    cfg_option_value(card->options, "app_shortcut_preset"))
          : invoke_companion_url(card->sensor, request_id,
                                 companion_url_opens_new_window(*card));
        if (!invoked) {
          ESP_LOGW("companion", "Action unavailable: %s", card->entity.c_str());
        }
      }, click);
      break;
    }
    default:
      break;
  }
  return true;
}

inline bool basic_action_driver_handle_main_click(
    const Context &context, const ParsedCfg &config,
    int slot_number, lv_obj_t *button) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    case Driver::COMPANION: {
      if (companion_metric_key_valid(config.entity)) break;
      char request_id[24];
      snprintf(request_id, sizeof(request_id), "%08lx-%d",
               static_cast<unsigned long>(companion_next_request_number()), slot_number);
      lv_obj_t *screen = nullptr;
      if (companion_app_shortcuts_enabled(config) && button) {
        const auto started = esphome::millis();
        if (companion_auto_open_app_subpages() || companion_action_active(config.entity))
          screen = navigation_screen_for_button(button);
        if (screen && !companion_auto_open_app_subpages()) {
          // In manual mode, the first press focuses the app. Only an already
          // active (on) card opens its subpage, without invoking the app again.
          if (companion_action_active(config.entity) && lv_obj_is_valid(screen)) {
            navigation_begin_page_open(screen, started);
            navigation_show_companion_subpage(screen, /*from_card=*/true);
            break;
          }
        }
        if (screen && companion_auto_open_app_subpages()) {
          // Navigation is local; do not wait for Mac focus/acknowledgement.
          if (lv_obj_is_valid(screen)) {
            navigation_begin_page_open(screen, started);
            navigation_show_companion_subpage(screen, /*from_card=*/true);
          }
        }
      }
      const bool invoked = companion_encoded_url(config.sensor).empty()
        ? invoke_companion_action_for_app(config.entity, request_id, {},
                                  companion_folder_open_behavior(config),
                                  cfg_option_value(config.options, "app_shortcut_preset"))
        : invoke_companion_url(config.sensor, request_id,
                                 companion_url_opens_new_window(config));
      if (!invoked) {
        companion_cancel_action_result(request_id);
        ESP_LOGW("companion", "Action unavailable: %s", config.entity.c_str());
      }
      break;
    }
    default:
      break;
  }
  return true;
}

}  // namespace espdesktop::cards
