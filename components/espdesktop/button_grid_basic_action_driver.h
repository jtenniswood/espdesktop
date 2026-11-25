#pragma once

#include "button_grid_touch.h"
#include "ha_controls.h"

// Mac Companion controls.
// The same visual, binding, interaction, layout, and cleanup entry points serve
// main-grid and subpage cards while preserving their established ownership.
// Contract coverage markers: type == "", "alarm_action",
// "companion", "fan_switch", "light_switch", "push".

namespace espdesktop::cards {

struct ObsConfirmationFonts {
  const lv_font_t *message = nullptr;
  const lv_font_t *icon = nullptr;
};

inline ObsConfirmationFonts &obs_confirmation_fonts() {
  static ObsConfirmationFonts fonts;
  return fonts;
}

struct MicHoldFonts {
  const lv_font_t *message = nullptr;
  const lv_font_t *icon = nullptr;
};

inline MicHoldFonts &mic_hold_fonts() {
  static MicHoldFonts fonts;
  return fonts;
}

inline bool basic_action_driver_matches(const Context &context,
                                        const ParsedCfg &) {
  using Driver = card_runtime::CardDriverId;
  switch (context.runtime.driver) {
    case Driver::COMPANION:
    case Driver::TOGGLE:
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
      (companion_metric_key_valid(config.entity) || companion_obs_status_card(config.entity))) {
    lv_obj_clear_flag(slot.btn, LV_OBJ_FLAG_CLICKABLE);
  }
  return basic_action_driver_matches(context, config);
}

inline void setup_apple_shortcut_detail(lv_obj_t *button, const lv_font_t *font) {
  for (auto &ref : companion_card_refs()) {
    if (ref.button != button || !ref.text_label) continue;
    if (!ref.shortcut_detail) {
      ref.shortcut_detail = companion_create_card_detail(button);
      ref.shortcut_binding = companion_next_request_number();
      lv_obj_set_user_data(ref.shortcut_detail, ref.text_label);
      lv_obj_add_flag(ref.shortcut_detail, LV_OBJ_FLAG_HIDDEN);
    }
    if (font) lv_obj_set_style_text_font(ref.shortcut_detail, font, LV_PART_MAIN);
    if (!lv_obj_has_flag(ref.shortcut_detail, LV_OBJ_FLAG_HIDDEN))
      companion_layout_card_detail(ref.text_label, ref.shortcut_detail);
    return;
  }
}

inline bool basic_action_driver_refresh_layout(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const DisplayProfile &display, int row_span, int col_span) {
  if (!basic_action_driver_matches(context, config)) return false;
  if (companion_metric_key_valid(config.entity)) {
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
  const bool status = companion_obs_status_card(config.entity);
  const bool output = companion_obs_output_card(config.entity);
  const bool scene = companion_obs_scene_card(config.entity);
  const bool default_scene_icon = scene && (config.icon.empty() || config.icon == "Auto" ||
    config.icon == "Image" || config.icon == "Image Card Loading");
  const bool mic = companion_obs_audio_uuid(config.entity, "obs.mute.");
  if (status || scene || mic || config.entity == "obs.take" || config.entity == "obs.brb" ||
      config.entity == "obs.replay" || output || config.entity == "obs.studio" ||
      config.entity == "obs.transition" || companion_obs_transition_target(config.entity) || config.entity == "obs.replay.buffer")
    companion_setup_obs_detail(slot.btn, display_small_text_font(display),
      status || default_scene_icon || (output && companion_obs_output_auto_icon(config.entity, config.icon))
        ? slot.icon_lbl : nullptr);
  if (companion_obs_confirmation_supported(config.entity))
    obs_confirmation_fonts() = {display_switch_confirmation_message_font(display), display.fonts.icon};
  if (companion_apple_shortcut_action(config.entity))
    setup_apple_shortcut_detail(slot.btn, display_small_text_font(display));
  return true;
}

inline bool basic_action_driver_cleanup(
    BtnSlot &slot, const ParsedCfg &config, const Context &context) {
  ha_controls::unregister_widget(slot.btn);
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

inline void basic_action_bind_ha_toggle(BtnSlot &slot, const ParsedCfg &config) {
  ha_controls::subscribe_state(config.entity);
  const std::string entity = config.entity;
  const std::string icon_off = config.icon;
  const std::string icon_on = config.icon_on;
  lv_obj_t *button = slot.btn;
  lv_obj_t *icon = slot.icon_lbl;
  auto refresh = [button, icon, entity, icon_off, icon_on]() {
    if (!lv_obj_is_valid(button)) return false;
    const auto value = ha_controls::state(entity);
    const bool available = !value.empty() && value != "unavailable" && value != "unknown";
    set_card_disabled_state(button, !available);
    const bool on = ha_controls::state_is_on(entity, value);
    set_card_checked_state(button, on);
    if (icon != nullptr && lv_obj_is_valid(icon)) {
      const std::string &name = on && !icon_on.empty() && icon_on != "Auto"
          ? icon_on : icon_off;
      if (!name.empty() && name != "Auto")
        lv_label_set_display_text(icon, find_icon(name.c_str()));
    }
    return true;
  };
  refresh();
  ha_controls::register_refresh(button, refresh);
}

inline bool basic_action_driver_bind_main(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const GridConfig &, const CardPalette &,
    const DisplayProfile &, lv_obj_t *, int,
    ToggleDriverState) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    case Driver::TOGGLE: {
      if (!ha_controls::toggle_control_valid(config.entity)) break;
      basic_action_bind_ha_toggle(slot, config);
      break;
    }
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

inline void show_apple_shortcut_completion(lv_obj_t *button, uint32_t binding) {
  for (const auto &ref : companion_card_refs()) {
    // A rebuilt dashboard can reuse the same button for a different card.
    if (ref.button != button || ref.shortcut_binding != binding || !ref.shortcut_detail) continue;
    auto *detail = ref.shortcut_detail;
    lv_label_set_display_text(detail, espdesktop_i18n_key("done"));
    lv_obj_clear_flag(detail, LV_OBJ_FLAG_HIDDEN);
    companion_layout_card_detail(ref.text_label, detail);
    sync_bound_card_text_color(button);

    // LVGL deletes animations owned by the detail label when a card is rebuilt.
    lv_anim_delete(detail, nullptr);
    lv_anim_t expiry;
    lv_anim_init(&expiry);
    lv_anim_set_var(&expiry, detail);
    lv_anim_set_duration(&expiry, 5000);
    lv_anim_set_completed_cb(&expiry, [](lv_anim_t *animation) {
      auto *detail = static_cast<lv_obj_t *>(animation->var);
      auto *title = static_cast<lv_obj_t *>(lv_obj_get_user_data(detail));
      lv_obj_add_flag(detail, LV_OBJ_FLAG_HIDDEN);
      lv_obj_align(title, LV_ALIGN_BOTTOM_LEFT, 0, 0);
    });
    lv_anim_start(&expiry);
    return;
  }
}

inline void run_apple_shortcut_card(lv_obj_t *button, const std::string &action_id,
                                    const std::string &request_id,
                                    const std::string &computer_id = "") {
  for (const auto &ref : companion_card_refs()) {
    if (ref.button != button || !ref.shortcut_detail) continue;
    companion_expect_action_result(request_id, [button, binding = ref.shortcut_binding]() {
      show_apple_shortcut_completion(button, binding);
    }, 0, computer_id, CompanionActionSuccess::PERFORMED);
    break;
  }
  if (!invoke_companion_action(action_id, request_id, "new_window", computer_id)) {
    companion_cancel_action_result(request_id, computer_id);
    ESP_LOGW("companion", "Action unavailable: %s", action_id.c_str());
    return;
  }
  if (!button) return;

  // Touch-down has already consumed the release. Show the pressed colour
  // briefly, and let LVGL cancel the animation if the card is deleted.
  lv_obj_add_state(button, APPLE_SHORTCUT_TAP_STATE);
  sync_bound_card_text_color(button);
  lv_anim_t pulse;
  lv_anim_init(&pulse);
  lv_anim_set_var(&pulse, button);
  lv_anim_set_values(&pulse, 0, 1);
  lv_anim_set_duration(&pulse, 160);
  lv_anim_set_exec_cb(&pulse, [](void *object, int32_t finished) {
    if (!finished) return;
    auto *card = static_cast<lv_obj_t *>(object);
    lv_obj_clear_state(card, APPLE_SHORTCUT_TAP_STATE);
    sync_bound_card_text_color(card);
  });
  lv_anim_start(&pulse);
}

struct CompanionSubpageActionContext {
  ParsedCfg card;
  std::string subpage_application;
  std::string computer_id;
};

inline bool invoke_confirmable_obs_action(const ParsedCfg &card, lv_obj_t *button,
                                          const std::string &request_id) {
  const std::string computer_id = companion_card_computer(card);
  if (!button || companion_computer_locked(computer_id))
    return false;
  auto *runtime = companion_runtime_for_command(computer_id);
  if (!runtime) return false;
  const auto shown = companion_rendered_obs_action(button);
  if (shown.id.empty() || !companion_action_available(runtime->snapshot(), shown.id))
    return false;
  const auto mode = cfg_option_value(card.options, "obs_confirm");
  if (!companion_obs_needs_confirmation(card.entity, mode, shown.label, shown.obs_state))
    return invoke_companion_action(shown.id, request_id, "new_window", computer_id);

  using Kind = ControlModalKind;
  const auto &fonts = obs_confirmation_fonts();
  auto shell = control_modal_open_shell(Kind::OBS_OUTPUT_CONFIRMATION, button, 100, fonts.icon, [] {
    control_modal_delete_overlay(Kind::OBS_OUTPUT_CONFIRMATION, control_modal_active().overlay);
  });
  if (!shell.panel) return false;
  const auto &layout = shell.layout;
  const auto *font = lv_obj_get_style_text_font(button, LV_PART_MAIN);
  auto message = cfg_option_value(card.options, "confirm_message");
  if (message.empty()) {
    const bool turning_off = shown.obs_state == OBSCardState::unknown ? shown.label == "On" : shown.obs_state == OBSCardState::toggle_on;
    if (card.entity == "obs.studio") {
      message = espdesktop_i18n_key(turning_off ? "turn_off_studio_mode" : "turn_on_studio_mode");
    } else if (card.entity == "obs.replay.buffer") {
      message = espdesktop_i18n_key(turning_off ? "stop_replay_buffer_prompt" : "start_replay_buffer_prompt");
    } else if (card.entity == "obs.output.virtualcam") {
      const bool running = shown.obs_state == OBSCardState::unknown ? shown.label.rfind("Stop ", 0) == 0
        : obs_card_presentation(shown.obs_state).lit;
      message = espdesktop_i18n_key(running ? "stop_virtual_camera_prompt" : "start_virtual_camera_prompt");
    } else {
      message = shown.label + "?";
    }
  }
  auto *prompt = control_modal_create_title(shell.panel, message,
      shell.content_w, fonts.message ? fonts.message : font, 100);
  lv_label_set_long_mode(prompt, LV_LABEL_LONG_WRAP);

  const auto scaled = [&](lv_coord_t value, lv_coord_t minimum) {
    return std::max(minimum, control_modal_scaled_px(value, layout.short_side));
  };
  const lv_coord_t gap = scaled(12, 8);
  const lv_coord_t message_gap = scaled(28, 18);
  const lv_coord_t height = scaled(52, 36);
  const lv_coord_t max_width = (shell.content_w - gap) / 2;
  const lv_coord_t min_width = std::min(max_width, std::max<lv_coord_t>(56, height + scaled(16, 0)));
  const uint32_t accent = current_button_primary_color();
  auto *cancel = control_modal_create_text_button(shell.panel, switch_confirmation_no_text(card),
      max_width, min_width, height, height / 2, theme_display_color(current_theme().border), font);
  auto *confirm = control_modal_create_text_button(shell.panel, switch_confirmation_yes_text(card),
      max_width, min_width, height, height / 2, accent, font);
  lv_obj_set_style_text_color(lv_obj_get_child(confirm, 0), lv_color_hex(readable_text_color_for_bg(accent)), LV_PART_MAIN);
  lv_obj_update_layout(shell.panel);
  const lv_coord_t prompt_height = lv_obj_get_height(prompt);
  const lv_coord_t actions_height = std::max(lv_obj_get_height(cancel), lv_obj_get_height(confirm));
  const lv_coord_t group_height = prompt_height + message_gap + actions_height;
  const lv_coord_t top_limit = layout.inset + layout.back_size + message_gap;
  const lv_coord_t bottom_limit = layout.panel_h - layout.inset - group_height;
  auto group_top = std::max<lv_coord_t>(top_limit, (layout.panel_h - group_height) / 2);
  group_top = std::max(layout.inset, std::min(group_top, bottom_limit));
  const lv_coord_t actions_y = group_top + prompt_height + message_gap + actions_height / 2 - layout.panel_h / 2;
  lv_obj_align(prompt, LV_ALIGN_CENTER, 0, group_top + prompt_height / 2 - layout.panel_h / 2);
  lv_obj_align(cancel, LV_ALIGN_CENTER, -(lv_obj_get_width(confirm) + gap) / 2, actions_y);
  lv_obj_align(confirm, LV_ALIGN_CENTER, (lv_obj_get_width(cancel) + gap) / 2, actions_y);
  lv_obj_add_event_cb(cancel, [](lv_event_t *) {
    control_modal_force_close_active();
  }, LV_EVENT_CLICKED, nullptr);

  struct Confirmation {
    std::string action;
    std::string computer;
    lv_obj_t *screen;
    uint32_t armed_at;
  };
  auto *checked = grid_delete_with_owner(confirm,
      new Confirmation{shown.id, computer_id, lv_obj_get_screen(button), esphome::millis()});
  lv_obj_add_event_cb(confirm, [](lv_event_t *event) {
    auto *checked = static_cast<Confirmation *>(lv_event_get_user_data(event));
    const bool locked = !checked ? true : companion_computer_locked(checked->computer);
    if (checked && !locked && checked->screen == lv_scr_act() &&
        esphome::millis() - checked->armed_at <= 15000) {
      const auto request = "obs-" + std::to_string(companion_next_request_number());
      invoke_companion_action(checked->action, request, "new_window", checked->computer);
    }
    control_modal_force_close_active();
  }, LV_EVENT_CLICKED, checked);
  return true;
}

struct EndCallConfirmation {
  std::string computer;
  lv_obj_t *screen;
  uint32_t armed_at;
};

inline void open_end_call_confirmation(lv_obj_t *button, const std::string &computer_id) {
  if (!button) return;
  auto shell = control_modal_open_shell(ControlModalKind::CALL_CONFIRMATION, button, 100,
      mic_hold_fonts().icon, [] {
        control_modal_delete_overlay(ControlModalKind::CALL_CONFIRMATION, control_modal_active().overlay);
      });
  if (!shell.panel) return;
  const auto &layout = shell.layout;
  const auto *font = lv_obj_get_style_text_font(button, LV_PART_MAIN);
  auto *prompt = control_modal_create_title(
      shell.panel, espdesktop_i18n_key("end_call_prompt"), shell.content_w,
      mic_hold_fonts().message ? mic_hold_fonts().message : font, 100);
  lv_label_set_long_mode(prompt, LV_LABEL_LONG_WRAP);

  const auto scaled = [&](lv_coord_t value, lv_coord_t minimum) {
    return std::max(minimum, control_modal_scaled_px(value, layout.short_side));
  };
  const lv_coord_t gap = scaled(12, 8);
  const lv_coord_t message_gap = scaled(28, 18);
  const lv_coord_t height = scaled(52, 36);
  const lv_coord_t max_width = (shell.content_w - gap) / 2;
  const lv_coord_t min_width = std::min(max_width, std::max<lv_coord_t>(56, height + scaled(16, 0)));
  const uint32_t accent = current_button_primary_color();
  auto *cancel = control_modal_create_text_button(shell.panel, espdesktop_i18n_key("cancel"),
      max_width, min_width, height, height / 2, theme_display_color(current_theme().border), font);
  auto *confirm = control_modal_create_text_button(shell.panel, espdesktop_i18n_key("end_call"),
      max_width, min_width, height, height / 2, accent, font);
  lv_obj_set_style_text_color(lv_obj_get_child(confirm, 0),
      lv_color_hex(readable_text_color_for_bg(accent)), LV_PART_MAIN);
  lv_obj_update_layout(shell.panel);
  const lv_coord_t prompt_height = lv_obj_get_height(prompt);
  const lv_coord_t actions_height = std::max(lv_obj_get_height(cancel), lv_obj_get_height(confirm));
  const lv_coord_t group_height = prompt_height + message_gap + actions_height;
  const lv_coord_t top_limit = layout.inset + layout.back_size + message_gap;
  const lv_coord_t bottom_limit = layout.panel_h - layout.inset - group_height;
  auto group_top = std::max<lv_coord_t>(top_limit, (layout.panel_h - group_height) / 2);
  group_top = std::max(layout.inset, std::min(group_top, bottom_limit));
  const lv_coord_t actions_y =
      group_top + prompt_height + message_gap + actions_height / 2 - layout.panel_h / 2;
  lv_obj_align(prompt, LV_ALIGN_CENTER, 0, group_top + prompt_height / 2 - layout.panel_h / 2);
  lv_obj_align(cancel, LV_ALIGN_CENTER, -(lv_obj_get_width(confirm) + gap) / 2, actions_y);
  lv_obj_align(confirm, LV_ALIGN_CENTER, (lv_obj_get_width(cancel) + gap) / 2, actions_y);
  lv_obj_add_event_cb(cancel, [](lv_event_t *) {
    control_modal_force_close_active();
  }, LV_EVENT_CLICKED, nullptr);

  auto *armed = grid_delete_with_owner(confirm,
      new EndCallConfirmation{computer_id, lv_obj_get_screen(button), esphome::millis()});
  lv_obj_add_event_cb(confirm, [](lv_event_t *event) {
    auto *armed = static_cast<EndCallConfirmation *>(lv_event_get_user_data(event));
    const bool locked = !armed ? true : companion_computer_locked(armed->computer);
    if (armed && !locked && armed->screen == lv_scr_act() &&
        esphome::millis() - armed->armed_at <= 15000)
      companion_end_active_call(armed->computer);
    control_modal_force_close_active();
  }, LV_EVENT_CLICKED, armed);
}

inline bool card_hold_end_call(lv_obj_t *button, const std::string &computer_id) {
  if (!button || lv_obj_has_state(button, LV_STATE_DISABLED) ||
      companion_computer_locked(computer_id))
    return false;
  // A moving pointer is a page swipe, not a hold. Do not let a slow swipe
  // arm the end-call confirmation while the page is changing.
  if (touch_pointer_moved(lv_indev_get_act())) return false;
  auto *runtime = companion_runtime_for_command(computer_id);
  int value = 0;
  if (!runtime || !runtime->connected() || !runtime->value("media.input_mute", value)) return false;
  // The finger is still down. Swallow the release so the card's normal tap
  // cannot toggle the microphone behind the confirmation.
  if (auto *indev = lv_indev_get_act()) lv_indev_wait_release(indev);
  touch_consume_actions();
  lv_obj_clear_state(button, LV_STATE_PRESSED);
  sync_bound_card_text_color(button);
  open_end_call_confirmation(button, computer_id);
  return true;
}

inline bool card_hold_action_end_call(const ParsedCfg &card, lv_obj_t *button) {
  if (card.entity != "media.input_mute" || card_hold_action(card) != "end_call") return false;
  return card_hold_end_call(button, companion_card_computer(card));
}

inline bool invoke_saved_companion_card(const ParsedCfg &card, const std::string &request_id,
                                         const std::string &subpage_application = {},
                                         lv_obj_t *button = nullptr,
                                         const std::string &default_computer = "") {
  std::string computer_id = companion_card_computer(card);
  if (computer_id.empty()) computer_id = default_computer;
  if (companion_obs_confirmation_supported(card.entity))
    return invoke_confirmable_obs_action(card, button, request_id);
  if (companion_obs_tokenized_card(card.entity))
    return invoke_companion_action(companion_rendered_obs_action(button).id, request_id,
                                   "new_window", computer_id);
  if (companion_obs_status_card(card.entity)) return false;
  return companion_encoded_url(card.sensor).empty()
    ? invoke_companion_action_for_app(card.entity, request_id, subpage_application,
                                     companion_folder_open_behavior(card),
                                     cfg_option_value(card.options, "app_shortcut_preset"),
                                     esphome::millis(), computer_id)
    : invoke_companion_url(card.sensor, request_id, companion_url_opens_new_window(card),
                          computer_id);
}

inline bool basic_action_driver_bind_subpage(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const BasicActionSubpageEnvironment &environment) {
  using Driver = card_runtime::CardDriverId;
  if (!basic_action_driver_matches(context, config)) return false;
  switch (context.runtime.driver) {
    case Driver::COMPANION: {
      if (companion_metric_key_valid(config.entity) || companion_obs_status_card(config.entity)) break;
      std::string subpage_application;
      if (config.type == "companion" && environment.parent_config &&
          companion_app_shortcuts_enabled(*environment.parent_config) &&
          config.entity.rfind("shortcut.", 0) == 0)
        subpage_application = environment.parent_config->entity;
      std::string computer_id = companion_card_computer(config);
      if (computer_id.empty() && environment.parent_config)
        computer_id = companion_card_computer(*environment.parent_config);
      auto *click = grid_delete_with_owner(slot.btn,
        new CompanionSubpageActionContext{config, subpage_application, computer_id});
      companion_require_card_focus(slot.btn, subpage_application);
      const auto action = [](lv_event_t *event) {
        auto *context = static_cast<CompanionSubpageActionContext *>(lv_event_get_user_data(event));
        if (!context || companion_computer_locked(context->computer_id)) return;
        const auto *card = &context->card;
        if (companion_app_shortcuts_enabled(*card)) {
          auto *button = static_cast<lv_obj_t *>(lv_event_get_target(event));
          const auto started = esphome::millis();
          auto *screen = companion_app_subpage_opens_on_press(card->entity, context->computer_id)
              ? navigation_screen_for_button(button) : nullptr;
          if (screen && lv_obj_is_valid(screen)) {
            if (!context->computer_id.empty()) companion_set_active_computer(context->computer_id);
            navigation_begin_page_open(screen, started);
            navigation_show_companion_subpage(screen, /*from_card=*/true);
            refresh_visible_image_cards();
            if (companion_app_subpage_manual()) return;
          }
        }
        char request_id[24];
        snprintf(request_id, sizeof(request_id), "sub-%08lx",
                 static_cast<unsigned long>(companion_next_request_number()));
        if (companion_apple_shortcut_action(card->entity)) {
          run_apple_shortcut_card(static_cast<lv_obj_t *>(lv_event_get_target(event)),
                                  card->entity, request_id, context->computer_id);
          return;
        }
        const bool invoked = invoke_saved_companion_card(*card, request_id, context->subpage_application,
          static_cast<lv_obj_t *>(lv_event_get_target(event)), context->computer_id);
        if (!invoked) {
          ESP_LOGW("companion", "Action unavailable: %s", card->entity.c_str());
        }
      };
      if (companion_obs_momentary_action(config.entity))
        lv_obj_add_event_cb(slot.btn, action, LV_EVENT_PRESSED, click);
      else
        bind_release_button_action(slot.btn, action, click);
      break;
    }
    case Driver::TOGGLE: {
      if (!ha_controls::toggle_control_valid(config.entity)) break;
      basic_action_bind_ha_toggle(slot, config);
      struct ToggleTarget { std::string entity; lv_obj_t *button; };
      auto *target = grid_delete_with_owner(slot.btn,
        new ToggleTarget{config.entity, slot.btn});
      lv_obj_add_event_cb(slot.btn, [](lv_event_t *event) {
        auto *target = static_cast<ToggleTarget *>(lv_event_get_user_data(event));
        if (target == nullptr) return;
        if (!ha_controls::toggle_entity(target->entity)) return;
        if (target->button != nullptr && lv_obj_is_valid(target->button) &&
            !ha_controls::is_button_entity(target->entity))
          set_card_checked_state(target->button,
            !lv_obj_has_state(target->button, LV_STATE_CHECKED));
      }, LV_EVENT_SHORT_CLICKED, target);
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
      if (companion_metric_key_valid(config.entity) || companion_obs_status_card(config.entity)) break;
      char request_id[24];
      snprintf(request_id, sizeof(request_id), "%08lx-%d",
               static_cast<unsigned long>(companion_next_request_number()), slot_number);
      if (companion_apple_shortcut_action(config.entity)) {
        run_apple_shortcut_card(button, config.entity, request_id,
                                companion_card_computer(config));
        break;
      }
      const std::string card_computer = companion_card_computer(config);
      if (companion_app_shortcuts_enabled(config) && button &&
          companion_app_subpage_opens_on_press(config.entity, card_computer)) {
        const auto started = esphome::millis();
        auto *screen = navigation_screen_for_button(button);
        if (screen && lv_obj_is_valid(screen)) {
          if (!card_computer.empty()) companion_set_active_computer(card_computer);
          navigation_begin_page_open(screen, started);
          navigation_show_companion_subpage(screen, /*from_card=*/true);
          // The manual press opens the page of an already active app.
          if (companion_app_subpage_manual()) break;
        }
      }
      const bool invoked = invoke_saved_companion_card(config, request_id, {}, button);
      if (!invoked) {
        companion_cancel_action_result(request_id);
        ESP_LOGW("companion", "Action unavailable: %s", config.entity.c_str());
      }
      break;
    }
    case Driver::TOGGLE: {
      if (!ha_controls::toggle_entity(config.entity)) {
        ESP_LOGW("ha_controls", "Action unavailable for %s", config.entity.c_str());
        break;
      }
      if (button != nullptr && lv_obj_is_valid(button) &&
          !ha_controls::is_button_entity(config.entity))
        set_card_checked_state(button, !lv_obj_has_state(button, LV_STATE_CHECKED));
      break;
    }
    default:
      break;
  }
  return true;
}

}  // namespace espdesktop::cards
