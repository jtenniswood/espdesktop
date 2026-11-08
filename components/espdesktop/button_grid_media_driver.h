#pragma once
#include "card_modal_target.h"

// Retired HA media modes retain their saved identifiers without playback,
// subscriptions, artwork downloads or modals. Mac volume uses its own driver.
// Contract coverage marker: "media".
namespace espdesktop::cards {
inline bool media_driver_theme_owned_surface(const Context &, const ParsedCfg &) { return true; }
inline bool media_driver_matches(const Context &context) {
  using Driver = card_runtime::CardDriverId;
  switch (context.runtime.driver) {
    case Driver::MEDIA:
    case Driver::MEDIA_CONTROL:
    case Driver::MEDIA_GROUP:
    case Driver::MEDIA_PLAY_PAUSE:
    case Driver::MEDIA_TRANSPORT:
    case Driver::MEDIA_VOLUME:
    case Driver::MEDIA_POSITION:
    case Driver::MEDIA_NOW_PLAYING:
    case Driver::MEDIA_COVER_ART:
    case Driver::MEDIA_PLAYLIST:
      return true;
    default:
      return false;
  }
}

inline bool media_driver_setup_visual(
    BtnSlot &slot, const ParsedCfg &config, const Context &context,
    const CardPalette &, const DisplayProfile &, int = 1, int = 1) {
  if (!media_driver_matches(context)) return false;
  setup_toggle_visual(slot, config);
  lv_obj_add_flag(slot.sensor_container, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(slot.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  lv_label_set_display_text(slot.icon_lbl, find_icon("Speaker"));
  set_wrapped_button_label_text(slot.text_lbl, "--");
  set_card_disabled_state(slot.btn, true);
  lv_obj_clear_flag(slot.btn, LV_OBJ_FLAG_CLICKABLE);
  return true;
}
inline bool media_driver_attach_interaction(BtnSlot &, const ParsedCfg &, const Context &context) {
  return media_driver_matches(context);
}
inline bool media_driver_refresh_layout(BtnSlot &, const ParsedCfg &, const Context &context,
    const GridConfig &, int = 1, int = 1) { return media_driver_matches(context); }
inline bool media_driver_cleanup(BtnSlot &slot, const ParsedCfg &, const Context &context) {
  if (!media_driver_matches(context)) return false;
  if (slot.btn) lv_obj_set_user_data(slot.btn, nullptr);
  return true;
}
struct MediaDriverEnvironment {
  std::function<void(const std::string &)> add_parent_indicator;
};
inline MediaDriverEnvironment media_driver_environment(
    const CardPalette &, const DisplayProfile &, const BtnSlot &, const GridConfig &) { return {}; }
inline bool media_driver_bind_main(BtnSlot &, const ParsedCfg &, const Context &context,
    const MediaDriverEnvironment &) {
  return media_driver_matches(context) && context.surface == Surface::MAIN_GRID;
}
inline bool media_driver_bind_subpage(BtnSlot &, const ParsedCfg &, const Context &context,
    const MediaDriverEnvironment &) {
  return media_driver_matches(context) && context.surface == Surface::SUBPAGE;
}
inline bool media_driver_handle_main_click(const Context &context, const ParsedCfg &, lv_obj_t *) {
  return media_driver_matches(context);
}
inline ModalTarget media_driver_modal_target(const Context &, const ParsedCfg &, lv_obj_t *) { return {}; }
}  // namespace espdesktop::cards
