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
  setup_slider_visual(slot, config, card_slider_fill_color(palette));
  numeric_selectable_driver_track_slider_cleanup(slot);
  return true;
}
inline bool numeric_selectable_driver_attach_interaction(
    BtnSlot &, const ParsedCfg &config, const Context &context) {
  return numeric_selectable_driver_matches(context, config);
}
inline bool numeric_selectable_driver_refresh_layout(
    BtnSlot &slot, const ParsedCfg &config, const Context &context) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  refresh_slider_card_layout(slot);
  return true;
}
inline bool numeric_selectable_driver_cleanup(
    BtnSlot &, const ParsedCfg &config, const Context &context) {
  // Slider state is deleted with its LVGL slider. Main-grid data allocations
  // use the runtime registry; subpage allocations are tied to their owner.
  return numeric_selectable_driver_matches(context, config);
}
inline void numeric_selectable_driver_bind_slider(BtnSlot &slot, const ParsedCfg &config) {
  if (config.type != "slider" || !companion_volume_control_valid(config.entity)) return;
  lv_obj_t *slider = slot.sensor_container
    ? static_cast<lv_obj_t *>(lv_obj_get_user_data(slot.sensor_container)) : nullptr;
  const bool has_icon_on = slider_has_alt_icon(config.type, config.icon_on);
  const char *icon_off = slider_icon_off(
    config.type, config.entity, config.icon);
  const char *icon_on = has_icon_on
    ? slider_icon_on(config.type, config.entity, config.icon, config.icon_on)
    : nullptr;
  if (slot.icon_lbl) {
    lv_label_set_display_text(slot.icon_lbl, icon_off);
  }
  if (config.label.empty() && slot.text_lbl) {
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
  std::string *entity = grid_delete_with_owner(slot.btn, new std::string(config.entity));
  bind_immediate_button_action(slot.btn, [](lv_event_t *event) {
    auto *value = static_cast<std::string *>(lv_event_get_user_data(event));
    if (value) send_slider_action(*value, -1);
  }, entity);
  return true;
}
inline bool numeric_selectable_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *) {
  if (!numeric_selectable_driver_matches(context, config)) return false;
  send_slider_action(config.entity, -1);
  return true;
}
inline ModalTarget numeric_selectable_driver_modal_target(const Context &, const ParsedCfg &, lv_obj_t *) { return {}; }
}  // namespace espdesktop::cards
