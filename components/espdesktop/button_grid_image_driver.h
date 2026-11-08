#pragma once

#include "card_modal_target.h"

// Retired Home Assistant camera/image cards keep their reserved type and saved
// fields, but never allocate a downloader, subscribe, or open a modal.
// Mac web-app icons still use the shared image pool independently.
// Contract coverage marker: "image".
namespace espdesktop::cards {

inline bool image_driver_matches(const Context &context) {
  return context.runtime.driver == card_runtime::CardDriverId::IMAGE;
}

inline bool image_driver_setup_visual(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const CardPalette &) {
  if (!image_driver_matches(context)) return false;
  setup_toggle_visual(slot, config);
  lv_obj_add_flag(slot.sensor_container, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(slot.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  lv_label_set_display_text(slot.icon_lbl, find_icon("Camera"));
  set_wrapped_button_label_text(slot.text_lbl, "--");
  set_card_disabled_state(slot.btn, true);
  lv_obj_clear_flag(slot.btn, LV_OBJ_FLAG_CLICKABLE);
  return true;
}

inline bool image_driver_attach_interaction(
    BtnSlot &, const ParsedCfg &, const Context &context) {
  return image_driver_matches(context);
}

inline bool image_driver_refresh_layout(
    BtnSlot &, const ParsedCfg &, const Context &context) {
  return image_driver_matches(context);
}

inline bool image_driver_cleanup(
    BtnSlot &slot, const ParsedCfg &, const Context &context) {
  if (!image_driver_matches(context)) return false;
  if (slot.btn) lv_obj_set_user_data(slot.btn, nullptr);
  return true;
}

inline void image_driver_reset_pool(const GridConfig &grid) {
  reset_image_card_pool(grid);
}

inline bool image_driver_bind_main(
    BtnSlot &, const ParsedCfg &, const Context &context,
    const GridConfig &, const CardPalette &) {
  return image_driver_matches(context) && context.surface == Surface::MAIN_GRID;
}

inline bool image_driver_bind_subpage(
    BtnSlot &, const ParsedCfg &, const Context &context,
    const GridConfig &, const CardPalette &) {
  return image_driver_matches(context) && context.surface == Surface::SUBPAGE;
}

inline bool image_driver_handle_main_click(
    const Context &context, const ParsedCfg &, lv_obj_t *) {
  return image_driver_matches(context);
}

inline ModalTarget image_driver_modal_target(
    const Context &, const ParsedCfg &, lv_obj_t *) {
  return {};
}

}  // namespace espdesktop::cards
