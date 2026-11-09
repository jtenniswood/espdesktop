#pragma once
#include "card_modal_target.h"

// Local Mac output/input volume sliders. Legacy numeric, light, fan and
// option_select identifiers remain in the saved contract; their drivers retire.
// Contract coverage markers: "slider", "light_brightness", "light_temperature",
// "fan_speed", "fan_oscillate", "fan_direction", "fan_preset", "option_select".
namespace espdesktop::cards {
inline bool numeric_selectable_driver_matches(const Context &, const ParsedCfg &config) {
  return config.type == "slider" && companion_volume_control_valid(config.entity);
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
    const CardPalette &palette, const DisplayProfile &) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (companion_mute_control_valid(config.entity)) {
    setup_toggle_visual(slot, config);
  } else {
    setup_slider_visual(slot, config, card_slider_fill_color(palette));
    numeric_selectable_driver_track_slider_cleanup(slot);
  }
  return true;
}
inline bool numeric_selectable_driver_attach_interaction(
    BtnSlot &, const ParsedCfg &config, const Context &context) {
  return numeric_selectable_driver_matches(context, config);
}
inline bool numeric_selectable_driver_refresh_layout(
    BtnSlot &slot, const ParsedCfg &config, const Context &context) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (!companion_mute_control_valid(config.entity)) refresh_slider_card_layout(slot);
  return true;
}
inline bool numeric_selectable_driver_cleanup(
    BtnSlot &slot, const ParsedCfg &config, const Context &context) {
  // The incoming card may use any driver, but the persistent button can still
  // carry a previous mute binding. Remove it before applying the new visual.
  if (companion_forget_mute(slot.btn)) {
    set_card_checked_state(slot.btn, false);
    set_card_disabled_state(slot.btn, false);
  }
  // Slider state is deleted with its LVGL slider. Main-grid data allocations
  // use the runtime registry; subpage allocations are tied to their owner.
  return numeric_selectable_driver_matches(context, config);
}
inline void numeric_selectable_driver_bind_slider(BtnSlot &slot, const ParsedCfg &config) {
  if (config.type != "slider" || !companion_volume_control_valid(config.entity)) return;
  if (companion_mute_control_valid(config.entity)) {
    const bool microphone = config.entity == "media.input_mute";
    const char *previous_default_label = microphone ? "Microphone Mute" : "Output Mute";
    if (slot.text_lbl && (config.label.empty() || config.label == "Mute" ||
                         config.label == previous_default_label))
      lv_label_set_display_text(slot.text_lbl, companion_volume_control_label(config.entity));
    const char *muted_icon_name = microphone ? "Microphone Off" : "Volume Off";
    // Older cards saved the muted glyph as their default icon.
    const bool default_icon = config.icon.empty() || config.icon == "Auto" ||
      config.icon == muted_icon_name;
    const char *unmuted_icon = find_icon(default_icon
      ? (microphone ? "Microphone" : "Volume High") : config.icon.c_str());
    const char *muted_icon = find_icon(muted_icon_name);
    if (slot.icon_lbl) lv_label_set_display_text(slot.icon_lbl, unmuted_icon);
    companion_track_mute(slot.btn, config.entity, slot.icon_lbl, unmuted_icon, muted_icon);
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
  if (slot.text_lbl && (config.label.empty() ||
      (config.entity == "media.output_volume" && config.label == "Output Volume") ||
      (config.entity == "media.input_volume" &&
       (config.label == "Input Volume" || config.label == "Input volume" || config.label == "Mic")))) {
    lv_label_set_display_text(
      slot.text_lbl, companion_volume_control_label(config.entity));
  }
  companion_track_slider(
    slider, config.entity, slot.icon_lbl, has_icon_on, icon_off, icon_on);
}
inline bool numeric_selectable_driver_bind_main(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const CardPalette &, const DisplayProfile &) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  numeric_selectable_driver_bind_slider(slot, config);
  return true;
}
struct NumericSelectableSubpageEnvironment {
  CardPalette palette;
  DisplayProfile display;
  std::function<void(const std::string &)> add_parent_indicator;
};
inline bool numeric_selectable_driver_bind_subpage(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const NumericSelectableSubpageEnvironment &) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  numeric_selectable_driver_bind_slider(slot, config);
  if (!companion_mute_control_valid(config.entity)) return true;
  std::string *entity = grid_delete_with_owner(slot.btn, new std::string(config.entity));
  bind_immediate_button_action(slot.btn, [](lv_event_t *event) {
    auto *value = static_cast<std::string *>(lv_event_get_user_data(event));
    if (value) companion_toggle_mute(*value);
  }, entity);
  return true;
}
inline bool numeric_selectable_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  if (companion_mute_control_valid(config.entity)) companion_toggle_mute(config.entity);
  return true;
}
inline ModalTarget numeric_selectable_driver_modal_target(const Context &, const ParsedCfg &, lv_obj_t *) { return {}; }
}  // namespace espdesktop::cards
