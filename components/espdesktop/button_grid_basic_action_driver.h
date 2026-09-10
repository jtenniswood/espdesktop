#pragma once

// Shared lifecycle driver for the basic toggle and action-bearing card family.
// The same visual, binding, interaction, layout, and cleanup entry points serve
// main-grid and subpage cards while preserving their established ownership.
namespace espdesktop::cards {

inline bool basic_action_driver_matches(const Context &context,
                                        const ParsedCfg &config) {
  using Driver = card_runtime::CardDriverId;
  using Type = card_runtime::CardTypeId;
  switch (context.runtime.driver) {
    case Driver::COMPANION:
    case Driver::SCREEN_LOCK:
    case Driver::WEBHOOK:
      return true;
    default:
      return false;
  }
}

inline bool basic_action_driver_setup_visual(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    uint32_t sensor_color = TERTIARY_GREY) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    case Driver::SCREEN_LOCK:
      setup_screen_lock_card(slot, config);
      break;
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
    const GridConfig &grid_config, const CardPalette &palette,
    const DisplayProfile &display, lv_obj_t *grid_page, int grid_cols,
    ToggleDriverState toggle_state) {
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

inline bool basic_action_driver_bind_subpage(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const BasicActionSubpageEnvironment &environment) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    case Driver::COMPANION: {
      if (companion_metric_key_valid(config.entity)) break;
      ParsedCfg *click = grid_delete_with_owner(slot.btn, new ParsedCfg(config));
      lv_obj_add_event_cb(slot.btn, [](lv_event_t *event) {
        ParsedCfg *card = static_cast<ParsedCfg *>(lv_event_get_user_data(event));
        if (!card) return;
        char request_id[24];
        snprintf(request_id, sizeof(request_id), "sub-%08lx",
                 static_cast<unsigned long>(companion_next_request_number()));
        const bool invoked = companion_encoded_url(card->sensor).empty()
          ? invoke_companion_action(card->entity, request_id)
          : invoke_companion_url(card->entity, card->sensor, request_id);
        if (!invoked) {
          ESP_LOGW("companion", "Action unavailable: %s", card->entity.c_str());
        }
      }, LV_EVENT_CLICKED, click);
      break;
    }
    case Driver::SCREEN_LOCK:
      lv_obj_add_event_cb(slot.btn, [](lv_event_t *) {
        screen_lock_toggle();
      }, LV_EVENT_CLICKED, nullptr);
      break;
    case Driver::WEBHOOK: {
      ParsedCfg *click = grid_delete_with_owner(slot.btn, new ParsedCfg(config));
      lv_obj_add_event_cb(slot.btn, [](lv_event_t *event) {
        ParsedCfg *card = static_cast<ParsedCfg *>(lv_event_get_user_data(event));
        if (card) send_webhook_action(*card);
      }, LV_EVENT_CLICKED, click);
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
    case Driver::SCREEN_LOCK:
      screen_lock_toggle();
      break;
    case Driver::COMPANION: {
      if (companion_metric_key_valid(config.entity)) break;
      char request_id[24];
      snprintf(request_id, sizeof(request_id), "%08lx-%d",
               static_cast<unsigned long>(companion_next_request_number()), slot_number);
      lv_obj_t *screen = nullptr;
      if (companion_app_shortcuts_enabled(config) && button) {
        screen = static_cast<lv_obj_t *>(lv_obj_get_user_data(button));
        if (screen) {
          companion_expect_action_result(request_id, config.entity, [screen]() {
            if (lv_obj_is_valid(screen)) {
              lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
            }
          }, esphome::millis() + 10000);
        }
      }
      const bool invoked = companion_encoded_url(config.sensor).empty()
        ? invoke_companion_action(config.entity, request_id)
        : invoke_companion_url(config.entity, config.sensor, request_id);
      if (!invoked) {
        companion_cancel_action_result(request_id);
        ESP_LOGW("companion", "Action unavailable: %s", config.entity.c_str());
      }
      break;
    }
    case Driver::WEBHOOK:
      send_webhook_action(config);
      break;
    default:
      break;
  }
  return true;
}

}  // namespace espdesktop::cards
