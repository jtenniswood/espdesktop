#pragma once
#include "card_modal_target.h"
#include "ha_controls.h"

// Local Mac output/input volume sliders. Legacy numeric, light, fan and
// option_select identifiers remain in the saved contract; their drivers retire.
// Contract coverage markers: "companion_app_volume", "companion_cough", "companion_obs_cough", "slider", "light_brightness", "light_temperature",
// "fan_speed", "fan_oscillate", "fan_direction", "fan_preset", "option_select".
namespace espdesktop::cards {
inline bool numeric_selectable_cough_card(const ParsedCfg &config) {
  return config.type == "companion_cough" || config.type == "companion_obs_cough";
}

inline bool numeric_selectable_ha_slider(const ParsedCfg &config) {
  if (config.type != "light_brightness" && config.type != "slider") return false;
  return ha_controls::slider_control_valid(config.entity) &&
      !companion_volume_control_valid(config.entity);
}

inline bool numeric_selectable_driver_matches(const Context &, const ParsedCfg &config) {
  if (numeric_selectable_cough_card(config)) return true;
  if (numeric_selectable_ha_slider(config)) return true;
  if (config.type == "companion_app_volume")
    return companion_app_volume_control_valid(config.entity);
  if (config.type == "companion_output_volume") return config.entity == "media.output_volume";
  if (config.type == "companion_input_device")
    return companion_input_device_control_valid(config.entity);
  if (config.type == "companion_input_volume") return config.entity == "media.input_volume";
  if (config.type == "companion_output_mute") return config.entity == "media.output_mute";
  if (config.type == "companion_input_mute") return config.entity == "media.input_mute";
  return config.type == "slider" && companion_volume_control_valid(config.entity) &&
    !companion_app_volume_control_valid(config.entity) && !companion_input_device_control_valid(config.entity);
}
inline void numeric_selectable_driver_track_slider_cleanup(BtnSlot &slot) {
  lv_obj_t *slider = slot.sensor_container
    ? static_cast<lv_obj_t *>(lv_obj_get_user_data(slot.sensor_container))
    : nullptr;
  SliderCtx *state = slider
    ? static_cast<SliderCtx *>(lv_obj_get_user_data(slider))
    : nullptr;
  if (!slider || !state) return;
  lv_obj_add_event_cb(slider, [](lv_event_t *event) {
    delete static_cast<SliderCtx *>(lv_event_get_user_data(event));
  }, LV_EVENT_DELETE, state);
}
inline bool numeric_selectable_driver_setup_visual(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const CardPalette &palette, const DisplayProfile &display) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (numeric_selectable_cough_card(config) || companion_mute_control_valid(config.entity)) {
    setup_toggle_visual(slot, config);
    remove_button_state_transitions(slot.btn);
    if (config.entity == "media.input_mute" && card_hold_action(config) == "end_call")
      mic_hold_fonts() = {display_switch_confirmation_message_font(display), display.fonts.icon};
  } else {
    setup_slider_visual(slot, config, palette.on_val,
      !companion_obs_meter_control(config.entity));
    numeric_selectable_driver_track_slider_cleanup(slot);
  }
  return true;
}
inline bool numeric_selectable_driver_attach_interaction(
    BtnSlot &, const ParsedCfg &config, const Context &context) {
  return numeric_selectable_driver_matches(context, config);
}
inline bool numeric_selectable_driver_refresh_layout(
    BtnSlot &slot, const ParsedCfg &config, const Context &context, const DisplayProfile &display) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (config.entity == "media.input_mute")
    companion_setup_mic_mute_detail(slot.btn, display_small_text_font(display));
  else if (!numeric_selectable_cough_card(config) && !companion_mute_control_valid(config.entity))
    refresh_slider_card_layout(slot);
  return true;
}
inline bool numeric_selectable_driver_cleanup(
    BtnSlot &slot, const ParsedCfg &config, const Context &context) {
  // The incoming card may use any driver, but the persistent button can still
  // carry a previous mute binding. Remove it before applying the new visual.
  if (slot.sensor_container != nullptr) {
    auto *slider = static_cast<lv_obj_t *>(lv_obj_get_user_data(slot.sensor_container));
    if (slider != nullptr) ha_controls::unregister_widget(slider);
  }
  unbind_cough_button(slot.btn);
  if (companion_forget_mute(slot.btn)) {
    set_card_checked_state(slot.btn, false);
    set_card_disabled_state(slot.btn, false);
  }
  // Slider state is deleted with its LVGL slider. Main-grid data allocations
  // use the runtime registry; subpage allocations are tied to their owner.
  return numeric_selectable_driver_matches(context, config);
}
inline void numeric_selectable_driver_bind_slider(BtnSlot &slot, const ParsedCfg &config, const DisplayProfile &display) {
  if (companion_mute_control_valid(config.entity)) {
    const bool microphone = config.entity == "media.input_mute";
    const bool default_label = config.label.empty() || (microphone
      ? config.label == "Input State" || config.label == "Mute" ||
        config.label == "Input Mute" || config.label == "Microphone Mute"
      : config.label == "Mute" || (config.type == "slider" && config.label == "Output Mute"));
    if (slot.text_lbl && default_label)
      lv_label_set_display_text(slot.text_lbl, companion_volume_control_label(config.entity));
    const char *muted_icon_name = microphone ? "Microphone Off" : "Volume Off";
    // Older cards saved the muted glyph as their default icon.
    const bool default_icon = config.icon.empty() || config.icon == "Auto" ||
      config.icon == muted_icon_name;
    const char *unmuted_icon = find_icon(default_icon
      ? (microphone ? "Microphone" : "Volume High") : config.icon.c_str());
    const char *muted_icon = find_icon(muted_icon_name);
    if (slot.icon_lbl) lv_label_set_display_text(slot.icon_lbl, unmuted_icon);
    companion_track_mute(slot.btn, config.entity, slot.icon_lbl, unmuted_icon, muted_icon,
      microphone ? slot.text_lbl : nullptr, companion_card_computer(config));
    if (microphone) companion_setup_mic_mute_detail(slot.btn, display_small_text_font(display));
    return;
  }
  lv_obj_t *slider = slot.sensor_container
    ? static_cast<lv_obj_t *>(lv_obj_get_user_data(slot.sensor_container))
    : nullptr;
  // Mac volume has one icon at every level, including zero.
  const bool has_icon_on = false;
  const char *icon_off = slider_icon_off(
    config.type, config.entity, config.icon);
  const char *icon_on = nullptr;
  if (slot.icon_lbl) {
    lv_label_set_display_text(slot.icon_lbl, icon_off);
  }
  const bool native_volume = config.type == "companion_output_volume" || config.type == "companion_input_volume";
  if (slot.text_lbl && native_volume && config.label == "Volume") {
    lv_label_set_display_text(slot.text_lbl, espdesktop_i18n_key("volume"));
  } else if (slot.text_lbl && (config.label.empty() || (config.type == "slider" && (
      (config.entity == "media.output_volume" &&
       (config.label == "Output Volume" || config.label == "Volume")) ||
      (config.entity == "media.input_volume" &&
       (config.label == "Input Volume" || config.label == "Input volume" || config.label == "Mic")))))) {
    lv_label_set_display_text(
      slot.text_lbl, companion_volume_control_label(config.entity));
  }
  const bool obs_audio = companion_obs_level_control(config.entity) || companion_obs_meter_control(config.entity);
  companion_track_slider(slider, config.entity, slot.icon_lbl, has_icon_on, icon_off, icon_on,
    obs_audio ? slot.text_lbl : nullptr, obs_audio ? config.label : std::string{},
    companion_card_computer(config));
}
inline void numeric_selectable_bind_cough(BtnSlot &slot, const ParsedCfg &config, bool subpage) {
  const std::string control = config.type == "companion_cough" ? COMPANION_COUGH_ID : config.entity;
  if (slot.text_lbl && config.label == espdesktop_i18n_key_en("label_cough")) {
    lv_label_set_display_text(slot.text_lbl, espdesktop_i18n_key("label_cough"));
  }
  bind_cough_button(slot.btn, slot.icon_lbl, slot.text_lbl, find_icon(config.icon.c_str()),
    find_icon("Microphone Off"), control, subpage, companion_card_computer(config));
  if (config.type == "companion_obs_cough" && !companion_obs_cough_control(control))
    set_card_disabled_state(slot.btn, true);
}
inline bool numeric_selectable_driver_bind_main(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const CardPalette &, const DisplayProfile &display) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (numeric_selectable_cough_card(config)) {
    numeric_selectable_bind_cough(slot, config, false);
  } else if (numeric_selectable_ha_slider(config)) {
    if (slot.text_lbl != nullptr && config.label.empty())
      lv_label_set_display_text(slot.text_lbl,
        ha_controls::domain_of(config.entity) == "media_player" ? "Volume" : "Brightness");
  } else {
    numeric_selectable_driver_bind_slider(slot, config, display);
  }
  return true;
}
struct NumericSelectableSubpageEnvironment {
  CardPalette palette;
  DisplayProfile display;
  std::function<void(const std::string &)> add_parent_indicator;
};
inline bool numeric_selectable_driver_bind_subpage(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const NumericSelectableSubpageEnvironment &environment) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (numeric_selectable_cough_card(config)) {
    numeric_selectable_bind_cough(slot, config, true);
    return true;
  }
  // HA sliders subscribe and render themselves in setup_slider_visual.
  if (numeric_selectable_ha_slider(config)) return true;
  numeric_selectable_driver_bind_slider(slot, config, environment.display);
  if (!companion_mute_control_valid(config.entity)) return true;
  struct MuteCardTarget {
    std::string control;
    std::string computer;
    lv_obj_t *button = nullptr;
    bool held = false;
  };
  const bool hold_end_call = config.entity == "media.input_mute" &&
      card_hold_action(config) == "end_call";
  auto *entity = grid_delete_with_owner(slot.btn,
    new MuteCardTarget{config.entity, companion_card_computer(config), slot.btn});
  if (hold_end_call) {
    // Tap keeps the mute toggle on release. A hold opens the end-call
    // confirmation instead of toggling.
    lv_obj_add_event_cb(slot.btn, [](lv_event_t *event) {
      auto *value = static_cast<MuteCardTarget *>(lv_event_get_user_data(event));
      if (value) value->held = false;
    }, LV_EVENT_PRESSED, entity);
    lv_obj_add_event_cb(slot.btn, [](lv_event_t *event) {
      auto *value = static_cast<MuteCardTarget *>(lv_event_get_user_data(event));
      if (!value) return;
      value->held = true;
      card_hold_end_call(value->button, value->computer);
    }, LV_EVENT_LONG_PRESSED, entity);
    lv_obj_add_event_cb(slot.btn, [](lv_event_t *event) {
      auto *value = static_cast<MuteCardTarget *>(lv_event_get_user_data(event));
      if (!value || value->held || companion_computer_locked(value->computer)) return;
      companion_toggle_mute(value->control, value->computer);
    }, LV_EVENT_SHORT_CLICKED, entity);
    return true;
  }
  // Toggle on release, like the main grid. Acting on touch-down consumed the
  // pointer, so a page swipe that started on the card could not page and the
  // card highlighted before its action ran.
  lv_obj_add_event_cb(slot.btn, [](lv_event_t *event) {
    auto *value = static_cast<MuteCardTarget *>(lv_event_get_user_data(event));
    if (value && !companion_computer_locked(value->computer))
      companion_toggle_mute(value->control, value->computer);
  }, LV_EVENT_SHORT_CLICKED, entity);
  return true;
}
inline bool numeric_selectable_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (!numeric_selectable_cough_card(config) && companion_mute_control_valid(config.entity))
    companion_toggle_mute(config.entity, companion_card_computer(config));
  return true;
}

inline bool numeric_selectable_driver_ha_slider(const ParsedCfg &config) {
  return numeric_selectable_ha_slider(config);
}
inline ModalTarget numeric_selectable_driver_modal_target(const Context &, const ParsedCfg &, lv_obj_t *) { return {}; }
}  // namespace espdesktop::cards
