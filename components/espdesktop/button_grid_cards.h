#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

#include "button_grid_datetime_cards.h"
#include "companion_controls.h"

inline void apply_push_button_transition(lv_obj_t *btn);
inline void clear_push_button_transition(lv_obj_t *btn);

inline const char *screen_lock_locked_icon(const ParsedCfg &p) {
  (void) p;
  return find_icon("Lock");
}

inline const char *screen_lock_unlocked_icon(const ParsedCfg &p) {
  (void) p;
  return find_icon("Lock Open");
}

inline std::string screen_lock_card_label() {
  return screen_lock_enabled()
    ? espdesktop_i18n(std::string("Screen Locked"))
    : espdesktop_i18n(std::string("Screen Unlocked"));
}

inline void screen_lock_register_card(const BtnSlot &s, const ParsedCfg &p) {
  ScreenLockCardRef ref;
  ref.btn = s.btn;
  ref.icon_lbl = s.icon_lbl;
  ref.text_lbl = s.text_lbl;
  ref.locked_icon = screen_lock_locked_icon(p);
  ref.unlocked_icon = screen_lock_unlocked_icon(p);
  screen_lock_card_refs().push_back(ref);
  screen_lock_register_controlled_button(s.btn);
}

inline void setup_screen_lock_card(BtnSlot &s, const ParsedCfg &p) {
  lv_label_set_display_text(s.icon_lbl,
    screen_lock_enabled() ? screen_lock_locked_icon(p) : screen_lock_unlocked_icon(p));
  std::string label = screen_lock_card_label();
  lv_label_set_display_text(s.text_lbl, label.c_str());
  screen_lock_register_card(s, p);
  apply_push_button_transition(s.btn);
}

inline void apply_push_button_transition(lv_obj_t *btn) {
  if (!btn) return;
  static const lv_style_prop_t push_props[] = {LV_STYLE_BG_COLOR, LV_STYLE_PROP_INV};
  static lv_style_transition_dsc_t push_trans;
  static bool push_trans_inited = false;
  if (!push_trans_inited) {
    lv_style_transition_dsc_init(&push_trans, push_props, lv_anim_path_ease_out, 400, 0, NULL);
    push_trans_inited = true;
  }
  lv_obj_set_style_transition(btn, &push_trans,
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | LV_STATE_DEFAULT);
}

inline void clear_push_button_transition(lv_obj_t *btn) {
  if (!btn) return;
  lv_obj_remove_local_style_prop(btn, LV_STYLE_TRANSITION,
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | LV_STATE_DEFAULT);
}

inline void setup_toggle_visual(BtnSlot &s, const ParsedCfg &p) {
  lv_label_set_display_text(s.text_lbl, p.label.c_str());
  lv_label_set_display_text(s.icon_lbl, find_icon(p.icon.empty() || p.icon == "Auto" ? "Monitor" : p.icon.c_str()));
  lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
}


inline void setup_companion_card(BtnSlot &s, const ParsedCfg &p,
                                 uint32_t sensor_color = TERTIARY_GREY) {
  if (companion_metric_key_valid(p.entity)) {
    const std::string label = p.label.empty()
      ? espdesktop_i18n_key(companion_metric_label_key(p.entity)) : p.label;
    lv_label_set_display_text(s.text_lbl, label.c_str());
    lv_obj_add_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_bg_color(
      s.btn, lv_color_hex(sensor_color),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
        static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
    lv_label_set_display_text(s.sensor_lbl, "--");
    const std::string unit = trim_display_unit(
      p.unit.empty() ? companion_metric_default_unit(p.entity) : p.unit);
    lv_label_set_display_text(s.unit_lbl, "");
    companion_track_metric_card(s.btn, s.sensor_lbl, s.unit_lbl, p.entity, unit,
                                parse_precision(p.precision));
    return;
  }
  const bool url_card = !companion_encoded_url(p.sensor).empty();
  const bool available = url_card
    ? companion_url_available(p.entity, p.sensor)
    : companion_action_available(p.entity);
  const std::string label = p.label.empty() ? companion_default_action_label(p.entity, p.sensor) : p.label;
  lv_label_set_display_text(s.text_lbl, label.c_str());
  const char *icon = find_icon(p.icon.empty() || p.icon == "Auto" ? "Monitor" : p.icon.c_str());
  lv_label_set_display_text(s.icon_lbl, icon);
  companion_track_card(s.btn, p.entity, p.sensor, s.text_lbl);
  if (available) {
    lv_obj_clear_state(s.btn, LV_STATE_DISABLED);
    apply_push_button_transition(s.btn);
  } else {
    lv_obj_add_state(s.btn, LV_STATE_DISABLED);
    clear_push_button_transition(s.btn);
  }
  companion_apply_card_focus(s.btn, p.entity, p.sensor);
}


inline void setup_subpage_parent_state_card(BtnSlot &s, const ParsedCfg &p,
                                            const lv_font_t *value_font,
                                            bool subpage_chevron_enabled = true,
                                            int subpage_chevron_x = 0,
                                            int subpage_chevron_y = 2,
                                            int subpage_chevron_text_width_percent = 94) {
  setup_toggle_visual(s, p);
  if (p.precision == "text") {
    lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
    set_wrapped_button_label_text(s.text_lbl, "--");
    set_subpage_chevron_visible(
      s, subpage_chevron_enabled, subpage_chevron_x, subpage_chevron_y,
      subpage_chevron_text_width_percent);
    return;
  }

  lv_obj_add_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
  if (value_font) lv_obj_set_style_text_font(s.sensor_lbl, value_font, LV_PART_MAIN);
  lv_label_set_display_text(s.sensor_lbl, "--");
  std::string unit = trim_display_unit(p.unit);
  lv_label_set_display_text(s.unit_lbl, unit.c_str());
  std::string subpage_label = p.label.empty() ? espdesktop_i18n(std::string("Subpage")) : p.label;
  lv_label_set_display_text(s.text_lbl, subpage_label.c_str());
  set_subpage_chevron_visible(
    s, subpage_chevron_enabled, subpage_chevron_x, subpage_chevron_y,
    subpage_chevron_text_width_percent);
}
