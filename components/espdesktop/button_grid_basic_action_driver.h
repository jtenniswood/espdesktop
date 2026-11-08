#pragma once

// Local actions, webhooks and Mac Companion controls.
// The same visual, binding, interaction, layout, and cleanup entry points serve
// main-grid and subpage cards while preserving their established ownership.
// Contract coverage markers: type == "", "action", "alarm_action",
// "companion", "fan_switch", "light_switch", "push", "webhook".

namespace espdesktop::cards {

inline bool basic_action_driver_matches(const Context &context,
                                        const ParsedCfg &config) {
  using Driver = card_runtime::CardDriverId;
  switch (context.runtime.driver) {
    case Driver::ACTION:
      return config.type == "local" || action_card_local_action(config);
    case Driver::COMPANION:
    case Driver::WEBHOOK:
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
    case Driver::ACTION:
      if (config.type == "local" || action_card_local_action(config)) {
        setup_local_action_card(slot, config);
      } else {
        lv_label_set_display_text(slot.icon_lbl, find_icon("Monitor Off"));
        const std::string label = config.label.empty() ? espdesktop_i18n("Unavailable")
            : config.label + "\n" + espdesktop_i18n("Unavailable");
        lv_label_set_display_text(slot.text_lbl, label.c_str());
        lv_obj_clear_flag(slot.btn, LV_OBJ_FLAG_CLICKABLE);
      }
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
    case Driver::ACTION:
      break;
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
      if (environment.parent_config && companion_app_shortcuts_enabled(*environment.parent_config) &&
          (config.entity.rfind("shortcut.", 0) == 0 || config.entity.rfind("window.", 0) == 0))
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
          auto *screen = static_cast<lv_obj_t *>(lv_obj_get_user_data(button));
          const bool active = companion_action_active(card->entity);
          if (screen && lv_obj_is_valid(screen) && (companion_auto_open_app_subpages() || active)) {
            lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
            refresh_visible_image_cards();
            if (!companion_auto_open_app_subpages()) return;
          }
        }
        char request_id[24];
        snprintf(request_id, sizeof(request_id), "sub-%08lx",
                 static_cast<unsigned long>(companion_next_request_number()));
        const bool invoked = companion_encoded_url(card->sensor).empty()
          ? invoke_companion_action_for_app(card->entity, request_id, context->required_focus_id,
                                    companion_folder_open_behavior(*card))
          : invoke_companion_url(card->entity, card->sensor, request_id);
        if (!invoked) {
          ESP_LOGW("companion", "Action unavailable: %s", card->entity.c_str());
        }
      }, click);
      break;
    }
    case Driver::WEBHOOK: {
      ParsedCfg *click = grid_delete_with_owner(slot.btn, new ParsedCfg(config));
      bind_immediate_button_action(slot.btn, [](lv_event_t *event) {
        ParsedCfg *card = static_cast<ParsedCfg *>(lv_event_get_user_data(event));
        if (card) send_webhook_action(*card);
      }, click);
      break;
    }
    case Driver::ACTION: {
      if (!config.entity.empty() &&
          (config.type == "local" || !config.sensor.empty())) {
        ParsedCfg *click = grid_delete_with_owner(slot.btn, new ParsedCfg(config));
        bind_immediate_button_action(slot.btn, [](lv_event_t *event) {
          ParsedCfg *card = static_cast<ParsedCfg *>(lv_event_get_user_data(event));
          if (!card) return;
          if (card->type == "local") {
            send_local_action(card->entity);
          } else {
            send_action_card_action(*card);
          }
        }, click);
      }
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
        screen = static_cast<lv_obj_t *>(lv_obj_get_user_data(button));
        if (screen && !companion_auto_open_app_subpages()) {
          // In manual mode, the first press focuses the app. Only an already
          // active (on) card opens its subpage, without invoking the app again.
          if (companion_action_active(config.entity) && lv_obj_is_valid(screen)) {
            lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
            break;
          }
        }
        if (screen && companion_auto_open_app_subpages()) {
          // Navigation is local; do not wait for Mac focus/acknowledgement.
          if (lv_obj_is_valid(screen)) {
            lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
          }
        }
      }
      const bool invoked = companion_encoded_url(config.sensor).empty()
        ? invoke_companion_action(config.entity, request_id,
                                  companion_folder_open_behavior(config))
        : invoke_companion_url(config.entity, config.sensor, request_id);
      if (!invoked) {
        companion_cancel_action_result(request_id);
        ESP_LOGW("companion", "Action unavailable: %s", config.entity.c_str());
      }
      break;
    }
    case Driver::ACTION:
      if (config.type == "local") {
        if (!config.entity.empty()) send_local_action(config.entity);
      } else if (action_card_local_action(config)) {
        if (!config.entity.empty()) send_local_action(config.entity);
      } else {
        send_action_card_action(config);
      }
      break;
    case Driver::WEBHOOK:
      send_webhook_action(config);
      break;
    default:
      break;
  }
  return true;
}

}  // namespace espdesktop::cards
