#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

// =============================================================================
// GRID BOOT PHASES - Consolidated on_boot logic for all devices
// =============================================================================
// Each sensors.yaml builds id()-based arrays and calls these three functions.
// Device-specific behavior is controlled by GridConfig fields.
// =============================================================================

struct GridConfig {
  int num_slots;
  int cols;
  bool width_compensation_vertical = false;
  bool wrap_tall_labels;
  bool info_only = false;
  bool subpage_chevrons_enabled = true;
  int width_compensation_percent = 100;
  int text_width_compensation_percent = 100;
  int volume_width_compensation_percent = 100;
  int media_artwork_width_compensation_percent = 100;
  DisplayModalProfile modal_profile;
  int label_lines = 0;
  int label_lines_tall = 0;
  int color_correction_red_percent = COLOR_CORRECTION_RED_PERCENT;
  int color_correction_green_percent = COLOR_CORRECTION_GREEN_PERCENT;
  int color_correction_blue_percent = COLOR_CORRECTION_BLUE_PERCENT;
  const lv_font_t *icon_font;
  const lv_font_t *sp_sensor_font;
  const lv_font_t *sp_large_sensor_font = nullptr;
  int large_sensor_unit_offset_percent = -10;
  const lv_font_t *media_title_font;
  const lv_font_t *media_control_title_font = nullptr;
  const lv_font_t *media_control_artist_font = nullptr;
  const lv_font_t *media_cover_art_title_font = nullptr;
  const lv_font_t *media_cover_art_artist_font = nullptr;
  const lv_font_t *option_select_value_font = nullptr;
  const lv_font_t *volume_number_font;
  const lv_font_t *volume_label_font = nullptr;
  const lv_font_t *climate_card_icon_font = nullptr;
  const lv_font_t *climate_option_title_font = nullptr;
  const lv_font_t *climate_option_value_font = nullptr;
  const lv_font_t *volume_icon_font = nullptr;
  const lv_font_t *subpage_chevron_font = nullptr;
  int subpage_chevron_x = 0;
  int subpage_chevron_y = 2;
  int subpage_chevron_text_width_percent = 94;
  std::string temperature_unit;
  std::string timezone;
  std::function<void(espdesktop::DisplayTakeoverKind)> begin_display_takeover;
  std::function<void(espdesktop::DisplayTakeoverKind)> end_display_takeover;
};


inline void grid_log_memory(const char *stage) {
#ifdef ESP_PLATFORM
  ESP_LOGI("sensors", "Phase 2 %s heap: internal=%u largest=%u psram=%u",
    stage,
    (unsigned) heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
    (unsigned) heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL),
    (unsigned) heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
#else
  (void) stage;
#endif
}

inline DisplayProfile display_profile_from_grid_config(const GridConfig &cfg) {
  DisplayProfile profile;
  profile.fonts.icon = cfg.icon_font;
  profile.fonts.sensor = cfg.sp_sensor_font;
  profile.fonts.large_sensor = cfg.sp_large_sensor_font;
  profile.fonts.media_title = cfg.media_title_font;
  profile.fonts.media_control_title = cfg.media_control_title_font;
  profile.fonts.media_control_artist = cfg.media_control_artist_font;
  profile.fonts.media_cover_art_title = cfg.media_cover_art_title_font;
  profile.fonts.media_cover_art_artist = cfg.media_cover_art_artist_font;
  profile.fonts.option_select_value = cfg.option_select_value_font;
  profile.fonts.volume_number = cfg.volume_number_font;
  profile.fonts.volume_label = cfg.volume_label_font;
  profile.fonts.climate_card_icon = cfg.climate_card_icon_font;
  profile.fonts.climate_option_title = cfg.climate_option_title_font;
  profile.fonts.climate_option_value = cfg.climate_option_value_font;
  profile.fonts.volume_icon = cfg.volume_icon_font;
  profile.width.vertical_axis = cfg.width_compensation_vertical;
  profile.width.main_percent = cfg.width_compensation_percent;
  profile.width.text_percent = cfg.text_width_compensation_percent;
  profile.width.volume_percent = cfg.volume_width_compensation_percent;
  profile.large_numbers.font = cfg.sp_large_sensor_font;
  profile.large_numbers.unit_offset_percent = cfg.large_sensor_unit_offset_percent;
  profile.color.red_percent = cfg.color_correction_red_percent;
  profile.color.green_percent = cfg.color_correction_green_percent;
  profile.color.blue_percent = cfg.color_correction_blue_percent;
  profile.modal = cfg.modal_profile;
  return profile;
}

inline void configure_grid_layout(lv_obj_t *page, int num_slots, int cols) {
  if (!page) return;
  int slot_count = bounded_grid_slots(num_slots);
  int col_count = cols > 0 ? cols : 1;
  if (col_count > MAX_GRID_SLOTS) col_count = MAX_GRID_SLOTS;
  int row_count = (slot_count + col_count - 1) / col_count;
  if (row_count < 1) row_count = 1;
  if (row_count > MAX_GRID_SLOTS) row_count = MAX_GRID_SLOTS;

  static lv_coord_t col_dsc[MAX_GRID_SLOTS + 1];
  static lv_coord_t row_dsc[MAX_GRID_SLOTS + 1];
  for (int i = 0; i < col_count; i++) col_dsc[i] = LV_GRID_FR(1);
  col_dsc[col_count] = LV_GRID_TEMPLATE_LAST;
  for (int i = 0; i < row_count; i++) row_dsc[i] = LV_GRID_FR(1);
  row_dsc[row_count] = LV_GRID_TEMPLATE_LAST;
  lv_obj_set_grid_dsc_array(page, col_dsc, row_dsc);
  lv_obj_update_layout(page);
}

struct CardPalette {
  bool has_on = false;
  bool has_off = false;
  bool has_sensor_color = false;
  uint32_t on_val = DEFAULT_SLIDER_COLOR;
  uint32_t off_val = SECONDARY_GREY;
  uint32_t sensor_val = TERTIARY_GREY;
};

template<typename T>
inline T *grid_track_runtime_allocation(lv_obj_t *owner, T *ptr);

template<typename T>
inline T *grid_delete_with_owner(lv_obj_t *owner, T *ptr);

inline lv_coord_t large_sensor_unit_offset_px(const lv_font_t *large_font, int percent) {
  if (!large_font || large_font->line_height <= 0) return 0;
  return large_font->line_height * percent / 100;
}

inline void apply_large_sensor_number_style(const BtnSlot &s, const lv_font_t *large_font,
                                            int unit_offset_percent) {
  if (s.sensor_lbl && large_font) {
    lv_obj_set_style_text_font(s.sensor_lbl, large_font, LV_PART_MAIN);
  }
  if (s.unit_lbl) {
    lv_obj_set_style_translate_y(
      s.unit_lbl, large_sensor_unit_offset_px(large_font, unit_offset_percent), LV_PART_MAIN);
  }
}

inline void apply_standard_sensor_number_style(const BtnSlot &s, const DisplayProfile &display) {
  if (s.sensor_lbl && display_sensor_font(display)) {
    lv_obj_set_style_text_font(s.sensor_lbl, display_sensor_font(display), LV_PART_MAIN);
  }
  if (s.unit_lbl) lv_obj_set_style_translate_y(s.unit_lbl, 0, LV_PART_MAIN);
}

inline bool large_number_square_card_layout(int row_span, int col_span) {
  return card_span_is_large(row_span, col_span);
}

inline bool card_large_numbers_active_for_layout(const ParsedCfg &p, int row_span, int col_span) {
  return card_large_numbers_supported(p) && !card_large_numbers_disabled(p) && (
    large_number_square_card_layout(row_span, col_span) ||
    card_large_numbers_enabled(p));
}

inline bool wide_large_date_time_card_layout(int row_span, int col_span) {
  return card_span_is_wide(row_span, col_span);
}

inline void apply_wide_large_date_time_card_layout(const BtnSlot &s,
                                                   lv_align_t align = LV_ALIGN_CENTER) {
  if (s.text_lbl) lv_obj_add_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  if (s.sensor_container) lv_obj_align(s.sensor_container, align, 0, 0);
}

#include "button_grid_date_time_driver.h"
#include "button_grid_basic_action_driver.h"
#include "button_grid_navigation_driver.h"

inline void apply_card_label_line_clamp(lv_obj_t *label, const GridConfig &cfg,
                                        int row_span = 1) {
  if (!label || cfg.label_lines <= 0) return;
  int lines = (row_span > 1 && cfg.label_lines_tall > 0)
    ? cfg.label_lines_tall
    : cfg.label_lines;
  if (lines <= 0) return;
  lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(label, lv_pct(100));
  const lv_font_t *font = lv_obj_get_style_text_font(label, LV_PART_MAIN);
  lv_coord_t line_height = font && font->line_height > 0 ? font->line_height : 16;
  lv_coord_t line_space = lv_obj_get_style_text_line_space(label, LV_PART_MAIN);
  lv_coord_t max_height = line_height * lines + line_space * (lines - 1);
  lv_obj_set_height(label, LV_SIZE_CONTENT);
  lv_obj_set_style_max_height(label, max_height, LV_PART_MAIN);
  lv_obj_align(label, LV_ALIGN_BOTTOM_LEFT, 0, 0);
}

inline bool card_slot_static_child(const BtnSlot &s, lv_obj_t *child) {
  return child == s.icon_lbl || child == s.sensor_container ||
         child == s.text_lbl || child == s.subpage_lbl;
}

inline void reset_card_slot_dynamic_children(BtnSlot &s) {
  if (!s.btn) return;
  lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_state(s.btn, LV_STATE_CHECKED);
  sync_card_checked_text_color(s.btn);
  lv_obj_clear_state(s.btn, LV_STATE_DISABLED);
  lv_obj_set_style_opa(s.btn, LV_OPA_COVER, LV_PART_MAIN);
  if (s.icon_lbl) lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  if (s.sensor_container) lv_obj_set_user_data(s.sensor_container, nullptr);
  if (s.text_lbl) {
    lv_obj_set_style_bg_opa(s.text_lbl, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_style_pad_all(s.text_lbl, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(s.text_lbl, 0, LV_PART_MAIN);
  }
  int32_t count = static_cast<int32_t>(lv_obj_get_child_cnt(s.btn));
  for (int32_t i = count - 1; i >= 0; i--) {
    lv_obj_t *child = lv_obj_get_child(s.btn, i);
    if (!child || card_slot_static_child(s, child)) continue;
    lv_obj_del(child);
  }
}

inline void clear_unsupported_card_slot_visuals(BtnSlot &s) {
  // Slot widgets persist across dashboard reloads. An unsupported replacement
  // must not keep showing the icon, label, or value from the previous card.
  if (s.icon_lbl) lv_label_set_display_text(s.icon_lbl, "");
  if (s.text_lbl) lv_label_set_display_text(s.text_lbl, "");
  if (s.sensor_lbl) lv_label_set_display_text(s.sensor_lbl, "");
  if (s.unit_lbl) lv_label_set_display_text(s.unit_lbl, "");
}

inline bool info_only_hidden_card_type(const espdesktop::cards::Context &context) {
  return !card_runtime_information_only(context);
}

inline void setup_card_visual(BtnSlot &s, const ParsedCfg &p,
                              const espdesktop::cards::Context &context,
                              const GridConfig &cfg,
                              const CardPalette &palette,
                              int row_span = 1,
                              int col_span = 1) {
  const DisplayProfile display = display_profile_from_grid_config(cfg);
  const auto family = context.family;
  espdesktop::cards::date_time_driver_cleanup(s, p, context);
  espdesktop::cards::basic_action_driver_cleanup(s, p, context);
  espdesktop::cards::navigation_driver_cleanup(s, p, context);
  reset_card_slot_dynamic_children(s);
  apply_button_colors(s.btn, palette.has_on, palette.on_val,
    palette.has_off, palette.off_val);
  apply_button_on_pattern(s.btn, p.options, palette.has_on, palette.on_val);
  apply_standard_sensor_number_style(s, display);
  if (s.unit_lbl) lv_obj_clear_flag(s.unit_lbl, LV_OBJ_FLAG_HIDDEN);
  if (s.text_lbl) lv_obj_clear_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  if (s.icon_lbl) lv_obj_align(s.icon_lbl, LV_ALIGN_TOP_LEFT, 0, 0);
  if (s.sensor_container) lv_obj_align(s.sensor_container, LV_ALIGN_TOP_LEFT, 0, 0);
  if (s.text_lbl) lv_obj_align(s.text_lbl, LV_ALIGN_BOTTOM_LEFT, 0, 0);
  // A previous unsupported or information-only config may have disabled this
  // persistent button. Restore the default before the current driver applies
  // its own interaction policy.
  lv_obj_add_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
  set_subpage_chevron_visible(
    s, (family == espdesktop::cards::Family::SUBPAGE || companion_app_shortcuts_enabled(p)) &&
       cfg.subpage_chevrons_enabled,
    cfg.subpage_chevron_x, cfg.subpage_chevron_y,
    cfg.subpage_chevron_text_width_percent);

  if (cfg.info_only && info_only_hidden_card_type(context)) {
    lv_obj_add_flag(s.btn, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
    return;
  }

  if (context.known) screen_lock_register_controlled_button(s.btn);


  if (espdesktop::cards::date_time_driver_setup_visual(
        s, p, context, palette)) {
    espdesktop::cards::date_time_driver_attach_interaction(s, p, context);
    espdesktop::cards::date_time_driver_refresh_layout(
      s, p, context, display, row_span, col_span);
    return;
  }
  if (espdesktop::cards::basic_action_driver_setup_visual(
        s, p, context, palette.sensor_val)) {
    espdesktop::cards::basic_action_driver_attach_interaction(s, p, context);
    espdesktop::cards::basic_action_driver_refresh_layout(
      s, p, context, display, row_span, col_span);
    return;
  }
  if (espdesktop::cards::navigation_driver_setup_visual(
        s, p, context, cfg, display)) {
    espdesktop::cards::navigation_driver_attach_interaction(s, p, context);
    espdesktop::cards::navigation_driver_refresh_layout(s, p, context, cfg);
    return;
  }
  clear_unsupported_card_slot_visuals(s);
  ESP_LOGW("card_runtime", "Unsupported card type has no visual driver: type=%s",
           p.type.c_str());
  lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
}

inline void refresh_card_layout(BtnSlot &s, const ParsedCfg &p,
    const GridConfig &cfg, int row_span = 1, int col_span = 1) {
  apply_card_label_line_clamp(s.text_lbl, cfg, row_span);
  const auto context = card_runtime_context(p);
  const auto display = display_profile_from_grid_config(cfg);
  espdesktop::cards::date_time_driver_refresh_layout(s, p, context, display, row_span, col_span);
  espdesktop::cards::basic_action_driver_refresh_layout(s, p, context, display, row_span, col_span);
  espdesktop::cards::navigation_driver_refresh_layout(s, p, context, cfg);
}

inline void grid_refresh_layout(
    BtnSlot *slots, const GridConfig &cfg,
    const std::string &order_str,
    lv_obj_t *main_page_obj = nullptr) {
  ESP_LOGI("sensors", "Grid refresh: layout start (%lu ms)", esphome::millis());
  set_display_temperature_unit(cfg.temperature_unit, cfg.timezone);
  const DisplayProfile display = display_profile_from_grid_config(cfg);
  display_activate_profile(display);
  int NS = bounded_grid_slots(cfg.num_slots);
  int COLS = cfg.cols > 0 ? cfg.cols : 1;
  // When the grid shape changes, LVGL can otherwise lay out children that
  // still point at now-invalid cells from the previous descriptor.
  for (int i = 0; i < NS; i++)
    lv_obj_add_flag(slots[i].btn, LV_OBJ_FLAG_HIDDEN);
  configure_grid_layout(main_page_obj, NS, COLS);
  int ROWS = (NS + COLS - 1) / COLS;

  OrderResult parsed, order;
  parse_order_string(order_str, NS, parsed);
  clear_spanned_cells(parsed, NS, COLS, order);
  clock_bar_clear_responsive_grid_cards(main_page_obj);
  navigation_clear_home_targets();

  lv_obj_t *first_card = nullptr;
  if (parsed.positions[0] >= 1 && parsed.positions[0] <= NS) {
    first_card = slots[parsed.positions[0] - 1].btn;
  } else if (NS > 0) {
    first_card = slots[0].btn;
  }

  for (int pos = 0; pos < NS; pos++) {
    int idx = order.positions[pos];
    if (idx < 1 || idx > NS) continue;
    auto &s = slots[idx - 1];
    lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_HIDDEN);
    int col = pos % COLS, row = pos / COLS;
    int row_span = order.row_span[idx - 1] > 0 ? order.row_span[idx - 1] : 1;
    int col_span = order.col_span[idx - 1] > 0 ? order.col_span[idx - 1] : 1;
    set_grid_card_cell(s.btn, main_page_obj, col, row, col_span, row_span, COLS, ROWS);
  }

  if (main_page_obj) lv_obj_update_layout(main_page_obj);

  for (int pos = 0; pos < NS; pos++) {
    int idx = order.positions[pos];
    if (idx < 1 || idx > NS) continue;
    auto &s = slots[idx - 1];
    ParsedCfg p = parse_cfg(s.config->state);
    navigation_register_home_target(idx, pos, p.label, s.config->state, s.btn);
    int row_span = order.row_span[idx - 1] > 0 ? order.row_span[idx - 1] : 1;
    int col_span = order.col_span[idx - 1] > 0 ? order.col_span[idx - 1] : 1;
    refresh_card_layout(s, p, cfg, row_span, col_span);
  }
  ESP_LOGI("sensors", "Grid refresh: layout done (%lu ms)", esphome::millis());
}

// ── Phase 1: Visual setup ────────────────────────────────────────────

inline void grid_phase1(
    BtnSlot *slots, const GridConfig &cfg,
    const std::string &order_str,
    const std::string &on_hex,
    lv_obj_t *main_page_obj = nullptr) {
  ESP_LOGI("sensors", "Phase 1: visual setup start (%lu ms)", esphome::millis());
  set_backlight_display_takeover_callback(navigation_close_modals_for_display_takeover);
  set_display_temperature_unit(cfg.temperature_unit, cfg.timezone);
  const DisplayProfile display = display_profile_from_grid_config(cfg);
  display_activate_profile(display);
  // Clear image references before visual setup removes their old LVGL widgets.
  int NS = bounded_grid_slots(cfg.num_slots);
  int COLS = cfg.cols > 0 ? cfg.cols : 1;
  if (COLS > MAX_GRID_SLOTS) COLS = MAX_GRID_SLOTS;
  for (int i = 0; i < NS; i++)
    lv_obj_add_flag(slots[i].btn, LV_OBJ_FLAG_HIDDEN);
  configure_grid_layout(main_page_obj, NS, COLS);
  int ROWS = (NS + COLS - 1) / COLS;
  if (NS != cfg.num_slots) {
    ESP_LOGW("sensors", "Grid slot count %d exceeds max %d; ignoring extra slots",
      cfg.num_slots, MAX_GRID_SLOTS);
  }

  if (!order_str.empty()) {
    bool all_empty = true;
    for (int i = 0; i < NS; i++) {
      if (!slots[i].config->state.empty()) { all_empty = false; break; }
    }
    if (all_empty) {
      ESP_LOGW("sensors", "Button order is set but all configs are empty. "
        "If upgrading from the old per-field format, export your config "
        "from the old firmware's web UI and import it after upgrading.");
    }
  }

  OrderResult parsed, order;
  parse_order_string(order_str, NS, parsed);
  clear_spanned_cells(parsed, NS, COLS, order);
  clock_bar_clear_responsive_grid_cards(main_page_obj);

  bool has_on;
  uint32_t on_val = parse_hex_color(on_hex, has_on);
  uint32_t off_val = display_correct_color(DEFAULT_SECONDARY_COLOR_RAW, display);
  uint32_t sensor_val = display_correct_color(DEFAULT_TERTIARY_COLOR_RAW, display);
  if (has_on) on_val = display_correct_color(on_val, display);

  CardPalette palette;
  palette.has_on = has_on;
  palette.has_off = true;
  palette.has_sensor_color = true;
  palette.on_val = has_on ? on_val : DEFAULT_SLIDER_COLOR;
  palette.off_val = off_val;
  palette.sensor_val = sensor_val;
  set_current_button_primary_color(palette.on_val);

  reset_calendar_cards();
  reset_timezone_cards();
  screen_lock_reset_registry();

  for (int pos = 0; pos < NS; pos++) {
    int idx = order.positions[pos];
    if (idx < 1 || idx > NS) continue;
    auto &s = slots[idx - 1];
    std::string scfg = s.config->state;
    lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_HIDDEN);
    int col = pos % COLS, row = pos / COLS;
    int row_span = order.row_span[idx - 1] > 0 ? order.row_span[idx - 1] : 1;
    int col_span = order.col_span[idx - 1] > 0 ? order.col_span[idx - 1] : 1;
    set_grid_card_cell(s.btn, main_page_obj, col, row, col_span, row_span, COLS, ROWS);

    if (cfg.wrap_tall_labels && row_span > 1) {
      lv_label_set_long_mode(s.text_lbl, LV_LABEL_LONG_WRAP);
      lv_obj_set_width(s.text_lbl, lv_pct(100));
    }

    ParsedCfg p = parse_cfg(scfg);
    const auto context = card_runtime_context(p);
    display_apply_main_width(s.icon_lbl, display);
    display_apply_slot_text_width(s, display);
    setup_card_visual(s, p, context, cfg, palette, row_span, col_span);
    refresh_card_layout(s, p, cfg, row_span, col_span);
  }
  screen_lock_apply();
  ESP_LOGI("sensors", "Phase 1: done (%lu ms)", esphome::millis());
}

// ── Phase 2: HA subscriptions + subpage creation ─────────────────────

inline std::string optional_text_state(esphome::text::Text **configs, int index) {
  return (configs != nullptr && configs[index] != nullptr) ? configs[index]->state : "";
}

// Moving a card changes only the saved order, not the card itself. Keep the
// existing LVGL widgets and their Home Assistant callbacks alive, and update
// just their grid cells. Structural card edits are applied on the next normal
// grid rebuild rather than risking a blank live page.
inline bool grid_refresh_subpage_layouts(
    BtnSlot *slots, const GridConfig &cfg, lv_obj_t *main_page_obj,
    esphome::text::Text **sp_configs,
    esphome::text::Text **sp_ext_configs,
    esphome::text::Text **sp_ext2_configs,
    esphome::text::Text **sp_ext3_configs,
    esphome::text::Text **sp_ext4_configs,
    esphome::text::Text **sp_ext5_configs,
    esphome::text::Text **sp_ext6_configs,
    esphome::text::Text **sp_ext7_configs) {
  if (slots == nullptr) return false;
  const int NS = bounded_grid_slots(cfg.num_slots);
  const int COLS = cfg.cols > 0 ? cfg.cols : 1;
  const int ROWS = (NS + COLS - 1) / COLS;
  const DisplayProfile display = display_profile_from_grid_config(cfg);
  static lv_coord_t subpage_cols[MAX_GRID_SLOTS + 1];
  static lv_coord_t subpage_rows[MAX_GRID_SLOTS + 1];
  for (int i = 0; i < COLS; i++) subpage_cols[i] = LV_GRID_FR(1);
  subpage_cols[COLS] = LV_GRID_TEMPLATE_LAST;
  for (int i = 0; i < ROWS; i++) subpage_rows[i] = LV_GRID_FR(1);
  subpage_rows[ROWS] = LV_GRID_TEMPLATE_LAST;

  bool refreshed = false;
  for (int si = 0; si < NS; si++) {
    const auto parent_config = parse_cfg(slots[si].config->state);
    const auto parent_context = card_runtime_context(parent_config);
    if (!espdesktop::cards::navigation_driver_owns_subpage(parent_context, parent_config)) {
      navigation_retire_subpage(si + 1, main_page_obj);
      continue;
    }

    const std::string sp_cfg = optional_text_state(sp_configs, si) +
      optional_text_state(sp_ext_configs, si) +
      optional_text_state(sp_ext2_configs, si) +
      optional_text_state(sp_ext3_configs, si) +
      optional_text_state(sp_ext4_configs, si) +
      optional_text_state(sp_ext5_configs, si) +
      optional_text_state(sp_ext6_configs, si) +
      optional_text_state(sp_ext7_configs, si);
    if (sp_cfg.empty()) continue;

    NavigationSubpageEntry *entry = navigation_find_slot(si + 1);
    const auto sp_btns = parse_subpage_config(sp_cfg);
    if (entry == nullptr || entry->screen == nullptr || entry->back_button == nullptr) {
      ESP_LOGW("sensors", "Subpage %d is not ready for a layout refresh", si + 1);
      continue;
    }
    if (entry->cards.size() != sp_btns.size()) {
      ESP_LOGW("sensors", "Subpage %d card count changed; repositioning existing cards", si + 1);
    }

    const std::string order = get_subpage_order(sp_cfg);
    SubpageOrder sp_order;
    parse_subpage_order(order, NS, sp_btns.size(), sp_order);
    normalize_subpage_order_spans(sp_order, NS, COLS);

    // Binding a card to another entity/type requires new HA callbacks. Keep
    // the existing data-bound widgets intact and defer that structural edit to
    // a normal rebuild rather than moving a card that still controls its old
    // entity. Pure order and span changes continue to update in place.
    bool structural_change = false;
    for (int gp = 0; gp < NS; gp++) {
      const int button_index = sp_order.positions[gp];
      if (button_index < 1 || button_index > static_cast<int>(sp_btns.size())) continue;
      NavigationSubpageEntry::Card *card = navigation_subpage_card(*entry, button_index);
      if (card != nullptr &&
          !subpage_btn_same_definition(card->definition, sp_btns[button_index - 1])) {
        structural_change = true;
        break;
      }
    }
    if (structural_change) {
      ESP_LOGW("sensors", "Subpage %d card details changed; deferring until the next normal rebuild", si + 1);
      continue;
    }

    // Change the descriptor only when the preserved cards will be repositioned
    // below. A deferred structural edit must keep its current grid intact.
    lv_obj_set_grid_dsc_array(entry->screen, subpage_cols, subpage_rows);
    const std::string back_label = get_subpage_back_label(order);
    if (entry->back_slot.text_lbl != nullptr) {
      lv_label_set_display_text(entry->back_slot.text_lbl, back_label.c_str());
    }
    set_grid_card_cell(
      entry->back_button, entry->screen,
      sp_order.back_pos % COLS, sp_order.back_pos / COLS,
      sp_order.back_col_span, sp_order.back_row_span, COLS, ROWS);
    apply_card_label_line_clamp(entry->back_slot.text_lbl, cfg,
                                sp_order.back_row_span);
    configure_button_label_wrap(entry->back_slot.text_lbl);

    // Preserve card instances (and their HA subscriptions), but hide cards
    // removed from the saved order so stale content is never left visible.
    bool visible_cards[MAX_GRID_SLOTS] = {};
    for (int gp = 0; gp < NS; gp++) {
      const int button_index = sp_order.positions[gp];
      if (button_index >= 1 &&
          button_index <= static_cast<int>(sp_btns.size()) &&
          button_index <= MAX_GRID_SLOTS) {
        visible_cards[button_index - 1] = true;
      }
    }
    for (auto &card : entry->cards) {
      const bool visible = card.index >= 1 && card.index <= MAX_GRID_SLOTS &&
        card.index <= static_cast<int>(sp_btns.size()) &&
        visible_cards[card.index - 1];
      if (card.button != nullptr) {
        if (visible) {
          lv_obj_clear_flag(card.button, LV_OBJ_FLAG_HIDDEN);
        } else {
          lv_obj_add_flag(card.button, LV_OBJ_FLAG_HIDDEN);
        }
      }
    }

    for (int gp = 0; gp < NS; gp++) {
      const int button_index = sp_order.positions[gp];
      if (button_index < 1 || button_index > static_cast<int>(sp_btns.size())) continue;
      NavigationSubpageEntry::Card *card = navigation_subpage_card(*entry, button_index);
      if (card == nullptr || card->button == nullptr) {
        ESP_LOGW("sensors", "Subpage %d is missing card %d", si + 1, button_index);
        continue;
      }
      const int col = sp_order.has_back_token ? gp % COLS : (gp + 1) % COLS;
      const int row = sp_order.has_back_token ? gp / COLS : (gp + 1) / COLS;
      const int col_span = sp_order.col_span[button_index - 1] > 0
        ? sp_order.col_span[button_index - 1] : 1;
      const int row_span = sp_order.row_span[button_index - 1] > 0
        ? sp_order.row_span[button_index - 1] : 1;
      set_grid_card_cell(card->button, entry->screen, col, row, col_span, row_span, COLS, ROWS);
      const ParsedCfg button_config =
        parsed_cfg_from_subpage_btn(sp_btns[button_index - 1]);
      refresh_card_layout(card->slot, button_config, cfg, row_span, col_span);
    }
    lv_obj_update_layout(entry->screen);
    refreshed = true;
  }
  return refreshed;
}

template<typename T>
inline T *grid_delete_with_owner(lv_obj_t *owner, T *ptr) {
  if (owner != nullptr && ptr != nullptr) {
    lv_obj_add_event_cb(owner, [](lv_event_t *e) {
      delete static_cast<T *>(lv_event_get_user_data(e));
    }, LV_EVENT_DELETE, ptr);
  }
  return ptr;
}

struct GridRuntimeAllocation {
  lv_obj_t *owner = nullptr;
  void *ptr = nullptr;
  void (*deleter)(void *) = nullptr;
};

inline std::vector<GridRuntimeAllocation> &grid_runtime_allocations() {
  static std::vector<GridRuntimeAllocation> allocations;
  return allocations;
}

template<typename T>
inline void grid_delete_runtime_ptr(void *ptr) {
  delete static_cast<T *>(ptr);
}

inline void grid_release_runtime_allocations(
    lv_obj_t *owner, void *preserve_primary = nullptr,
    void *preserve_secondary = nullptr) {
  if (owner == nullptr) return;
  std::vector<GridRuntimeAllocation> &allocations = grid_runtime_allocations();
  size_t write_index = 0;
  for (size_t read_index = 0; read_index < allocations.size(); read_index++) {
    GridRuntimeAllocation &allocation = allocations[read_index];
    if (allocation.owner == owner) {
      // Phase 2 can rerun without Phase 1 when a restored display setting
      // schedules a layout refresh. Keep contexts that are still owned by the
      // persistent Phase 1 widgets; deleting them here leaves LVGL user_data
      // pointing at freed memory before the media driver rebinds subscriptions.
      if (allocation.ptr == preserve_primary ||
          allocation.ptr == preserve_secondary) {
        if (write_index != read_index) allocations[write_index] = allocation;
        write_index++;
        continue;
      }
      if (allocation.deleter != nullptr && allocation.ptr != nullptr) {
        allocation.deleter(allocation.ptr);
      }
      continue;
    }
    if (write_index != read_index) allocations[write_index] = allocation;
    write_index++;
  }
  allocations.resize(write_index);
  if (allocations.empty()) std::vector<GridRuntimeAllocation>().swap(allocations);
}

inline void navigation_release_subpage_runtime(NavigationSubpageEntry &entry) {
  if (!entry.screen) return;
  screen_lock_unregister_tree(entry.screen);
  grid_release_runtime_allocations(entry.back_button);
  for (const auto &card : entry.cards) {
    grid_release_runtime_allocations(card.button);
  }
}

template<typename T>
inline T *grid_track_runtime_allocation(lv_obj_t *owner, T *ptr) {
  if (owner != nullptr && ptr != nullptr) {
    grid_runtime_allocations().push_back({
      owner,
      ptr,
      grid_delete_runtime_ptr<T>,
    });
  }
  return ptr;
}
inline void grid_clear_navigation_targets(BtnSlot *slots, int slot_count) {
  if (slots == nullptr) return;
  for (int i = 0; i < slot_count; i++) {
    ParsedCfg p = parse_cfg(slots[i].config->state);
    const auto context = card_runtime_context(p);
    espdesktop::cards::navigation_driver_cleanup(slots[i], p, context);
  }
}

inline void grid_phase2(
    BtnSlot *slots, const GridConfig &cfg,
    esphome::text::Text **sp_configs,
    esphome::text::Text **sp_ext_configs,
    esphome::text::Text **sp_ext2_configs,
    esphome::text::Text **sp_ext3_configs,
    esphome::text::Text **sp_ext4_configs,
    esphome::text::Text **sp_ext5_configs,
    esphome::text::Text **sp_ext6_configs,
    esphome::text::Text **sp_ext7_configs,
    const std::string &order_str,
    const std::string &on_hex,
    lv_obj_t *main_page_obj) {
  ESP_LOGI("sensors", "Phase 2: subscriptions + subpages start (%lu ms)", esphome::millis());
  grid_log_memory("start");
  set_display_temperature_unit(cfg.temperature_unit, cfg.timezone);
  const DisplayProfile display = display_profile_from_grid_config(cfg);
  display_activate_profile(display);
  network_status_card_icon_font() = display_icon_font(display);
  int NS = bounded_grid_slots(cfg.num_slots);
  int COLS = cfg.cols > 0 ? cfg.cols : 1;
  configure_grid_layout(main_page_obj, NS, COLS);
  if (NS != cfg.num_slots) {
    ESP_LOGW("sensors", "Grid slot count %d exceeds max %d; ignoring extra slots",
      cfg.num_slots, MAX_GRID_SLOTS);
  }
  int ROWS = (NS + COLS - 1) / COLS;

  static bool has_sensor[MAX_GRID_SLOTS] = {};
  static bool sensor_text_mode[MAX_GRID_SLOTS] = {};
  static bool has_icon_on[MAX_GRID_SLOTS] = {};
  static const char* icon_off_cp[MAX_GRID_SLOTS] = {};
  static const char* icon_on_cp[MAX_GRID_SLOTS] = {};

  grid_clear_navigation_targets(slots, NS);
  navigation_clear_home_targets();
  // Image-card contexts may still point at widgets inside subpage screens.
  navigation_clear_subpages();

  bool has_on;
  uint32_t on_val = parse_hex_color(on_hex, has_on);
  uint32_t off_val = display_correct_color(DEFAULT_SECONDARY_COLOR_RAW, display);
  uint32_t sensor_val = display_correct_color(DEFAULT_TERTIARY_COLOR_RAW, display);
  if (has_on) on_val = display_correct_color(on_val, display);

  CardPalette palette;
  palette.has_on = has_on;
  palette.has_off = true;
  palette.has_sensor_color = true;
  palette.on_val = has_on ? on_val : DEFAULT_SLIDER_COLOR;
  palette.off_val = off_val;
  palette.sensor_val = sensor_val;
  set_current_button_primary_color(palette.on_val);

  OrderResult parsed, order;
  parse_order_string(order_str, NS, parsed);
  clear_spanned_cells(parsed, NS, COLS, order);
  lv_obj_t *first_card = nullptr;
  if (order.positions[0] >= 1 && order.positions[0] <= NS) {
    first_card = slots[order.positions[0] - 1].btn;
  } else if (NS > 0) {
    first_card = slots[0].btn;
  }

  for (int pos = 0; pos < NS; pos++) {
    int idx = order.positions[pos];
    if (idx < 1 || idx > NS) continue;
    auto &s = slots[idx - 1];
    std::string scfg = s.config->state;

    ParsedCfg p = parse_cfg(scfg);
    const auto context = card_runtime_context(p);
    int row_span = order.row_span[idx - 1] > 0 ? order.row_span[idx - 1] : 1;
    int col_span = order.col_span[idx - 1] > 0 ? order.col_span[idx - 1] : 1;
    if (cfg.info_only && info_only_hidden_card_type(context)) continue;
    navigation_register_home_target(idx, pos, p.label, scfg, s.btn);
    espdesktop::cards::ToggleDriverState toggle_state;
    if (espdesktop::cards::basic_action_driver_bind_main(
          s, p, context, cfg, palette, display, main_page_obj, COLS,
          toggle_state)) continue;
    espdesktop::cards::NavigationDriverParentState navigation_state;
    if (espdesktop::cards::navigation_driver_bind_main(
          s, p, context, navigation_state)) continue;
    if (espdesktop::cards::date_time_driver_bind_data(s, p, context)) continue;
    ESP_LOGE("card_runtime", "Card has no main-grid data driver: type=%s",
             p.type.c_str());
  }

  if (cfg.info_only) return;

  // --- Subpage creation ---
  static lv_coord_t sp_col_dsc[MAX_GRID_SLOTS + 1];
  for (int i = 0; i < COLS; i++) sp_col_dsc[i] = LV_GRID_FR(1);
  sp_col_dsc[COLS] = LV_GRID_TEMPLATE_LAST;
  static lv_coord_t sp_row_dsc[MAX_GRID_SLOTS + 1];
  for (int i = 0; i < ROWS; i++) sp_row_dsc[i] = LV_GRID_FR(1);
  sp_row_dsc[ROWS] = LV_GRID_TEMPLATE_LAST;

  const lv_font_t *sp_icon_fnt = lv_obj_get_style_text_font(slots[0].icon_lbl, LV_PART_MAIN);

  lv_obj_t *ref_btn = slots[0].btn;
  lv_coord_t sp_radius = lv_obj_get_style_radius(ref_btn, LV_PART_MAIN);
  lv_coord_t sp_pad = lv_obj_get_style_pad_top(ref_btn, LV_PART_MAIN);
  const lv_font_t *sp_btn_fnt = lv_obj_get_style_text_font(ref_btn, LV_PART_MAIN);
  lv_color_t sp_txt_color = lv_obj_get_style_text_color(ref_btn, LV_PART_MAIN);

  lv_coord_t mp_pad_top = lv_obj_get_style_pad_top(main_page_obj, LV_PART_MAIN);
  lv_coord_t mp_pad_bottom = lv_obj_get_style_pad_bottom(main_page_obj, LV_PART_MAIN);
  lv_coord_t mp_pad_left = lv_obj_get_style_pad_left(main_page_obj, LV_PART_MAIN);
  lv_coord_t mp_pad_right = lv_obj_get_style_pad_right(main_page_obj, LV_PART_MAIN);
  lv_coord_t mp_pad_row = lv_obj_get_style_pad_row(main_page_obj, LV_PART_MAIN);
  lv_coord_t mp_pad_col = lv_obj_get_style_pad_column(main_page_obj, LV_PART_MAIN);

  for (int si = 0; si < NS; si++) {
    ParsedCfg p = parse_cfg(slots[si].config->state);
    const auto parent_context = card_runtime_context(p);
    if (!espdesktop::cards::navigation_driver_owns_subpage(parent_context, p)) continue;

    std::string sp_cfg = optional_text_state(sp_configs, si) +
      optional_text_state(sp_ext_configs, si) +
      optional_text_state(sp_ext2_configs, si) +
      optional_text_state(sp_ext3_configs, si) +
      optional_text_state(sp_ext4_configs, si) +
      optional_text_state(sp_ext5_configs, si) +
      optional_text_state(sp_ext6_configs, si) +
      optional_text_state(sp_ext7_configs, si);
    if (sp_cfg.empty()) continue;

    auto sp_btns = parse_subpage_config(sp_cfg);
    std::string sp_order_str = get_subpage_order(sp_cfg);
    std::string sp_back_label = get_subpage_back_label(sp_order_str);

    SubpageOrder sp_ord;
    parse_subpage_order(sp_order_str, NS, sp_btns.size(), sp_ord);
    normalize_subpage_order_spans(sp_ord, NS, COLS);

    lv_obj_t *sub_scr = lv_obj_create(NULL);
    int display_order = NS;
    for (int pos = 0; pos < NS; pos++) {
      if (parsed.positions[pos] == si + 1) {
        display_order = pos;
        break;
      }
    }
    espdesktop::cards::navigation_driver_own_subpage(
      slots[si], p, parent_context, si + 1, display_order, sub_scr);
    lv_obj_set_style_bg_color(sub_scr, lv_obj_get_style_bg_color(main_page_obj, LV_PART_MAIN), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(sub_scr, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_layout(sub_scr, LV_LAYOUT_GRID);
    lv_obj_set_grid_dsc_array(sub_scr, sp_col_dsc, sp_row_dsc);
    lv_obj_set_style_pad_top(sub_scr, mp_pad_top, LV_PART_MAIN);
    lv_obj_set_style_pad_bottom(sub_scr, mp_pad_bottom, LV_PART_MAIN);
    lv_obj_set_style_pad_left(sub_scr, mp_pad_left, LV_PART_MAIN);
    lv_obj_set_style_pad_right(sub_scr, mp_pad_right, LV_PART_MAIN);
    lv_obj_set_style_pad_row(sub_scr, mp_pad_row, LV_PART_MAIN);
    lv_obj_set_style_pad_column(sub_scr, mp_pad_col, LV_PART_MAIN);
    lv_obj_clear_flag(sub_scr, LV_OBJ_FLAG_SCROLLABLE);
    clock_bar_clear_responsive_grid_cards(sub_scr);

    lv_obj_t *back_btn = create_grid_card_button(
      sub_scr, sp_radius, sp_pad, sp_btn_fnt, sp_txt_color);
    apply_button_colors(back_btn, false, DEFAULT_SLIDER_COLOR, true, off_val);
    set_grid_card_cell(
      back_btn, sub_scr,
      sp_ord.back_pos % COLS, sp_ord.back_pos / COLS,
      sp_ord.back_col_span, sp_ord.back_row_span,
      COLS, ROWS);
    BtnSlot back_slot = create_dynamic_card_slot(
      back_btn, sp_icon_fnt, display_sensor_font(display), sp_btn_fnt, sp_txt_color,
      cfg.subpage_chevron_font);
    display_apply_main_width(back_slot.icon_lbl, display);
    display_apply_slot_text_width(back_slot, display);
    lv_label_set_display_text(back_slot.icon_lbl, "\U000F0141");
    lv_label_set_display_text(back_slot.text_lbl, sp_back_label.c_str());
    apply_card_label_line_clamp(back_slot.text_lbl, cfg, sp_ord.back_row_span);
    configure_button_label_wrap(back_slot.text_lbl);

    lv_obj_add_event_cb(back_btn, [](lv_event_t *e) {
      lv_scr_load_anim((lv_obj_t *)lv_event_get_user_data(e), LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
    }, LV_EVENT_CLICKED, main_page_obj);
    screen_lock_register_controlled_button(back_btn);
    navigation_register_subpage_back_button(si + 1, back_slot);

    for (int gp = 0; gp < NS; gp++) {
      int bn = sp_ord.positions[gp];
      if (bn < 1 || bn > (int)sp_btns.size()) continue;
      auto &sb = sp_btns[bn - 1];
      ParsedCfg sb_cfg = parsed_cfg_from_subpage_btn(sb);
      const auto context = card_runtime_context(
          sb_cfg, espdesktop::cards::Surface::SUBPAGE);
      int col, row;
      if (sp_ord.has_back_token) { col = gp % COLS; row = gp / COLS; }
      else { int op = gp + 1; col = op % COLS; row = op / COLS; }
      int rs = sp_ord.row_span[bn - 1] > 0 ? sp_ord.row_span[bn - 1] : 1;

      lv_obj_t *sb_btn = create_grid_card_button(
        sub_scr, sp_radius, sp_pad, sp_btn_fnt, sp_txt_color);
      int cs = sp_ord.col_span[bn - 1] > 0 ? sp_ord.col_span[bn - 1] : 1;
      set_grid_card_cell(sb_btn, sub_scr, col, row, cs, rs, COLS, ROWS);
      BtnSlot sub_slot = create_dynamic_card_slot(
        sb_btn, sp_icon_fnt, display_sensor_font(display), sp_btn_fnt, sp_txt_color,
        cfg.subpage_chevron_font);
      navigation_register_subpage_card(si + 1, bn, sub_slot, sb);
      display_apply_main_width(sub_slot.icon_lbl, display);
      display_apply_slot_text_width(sub_slot, display);
      setup_card_visual(sub_slot, sb_cfg, context, cfg, palette, rs, cs);
      // The line clamp re-anchors labels at the button content origin. Slider
      // cards remove button padding so their fill can reach the edges, so run
      // the card-specific refresh after clamping to restore the captured inset.
      refresh_card_layout(sub_slot, sb_cfg, cfg, rs, cs);

      espdesktop::cards::BasicActionSubpageEnvironment action_environment;
      action_environment.grid_config = &cfg;
      action_environment.parent_config = &p;
      action_environment.palette = palette;
      action_environment.display = display;
      action_environment.grid_page = sub_scr;
      action_environment.grid_cols = COLS;
      if (espdesktop::cards::basic_action_driver_bind_subpage(
            sub_slot, sb_cfg, context, action_environment)) continue;
      if (espdesktop::cards::date_time_driver_bind_data(sub_slot, sb_cfg, context)) continue;
      ESP_LOGE("card_runtime", "Card has no subpage data driver: type=%s",
               sb_cfg.type.c_str());
    }

  }
  screen_lock_apply();
  grid_log_memory("end");
  ESP_LOGI("sensors", "Phase 2: done (%lu ms)", esphome::millis());
}

// Secondary-page definitions can change the cards, subscriptions, or runtime
// resources they own. Recreate the complete grid instead of retaining widgets
// that may still refer to the previous definition. Restore the current page
// only when its parent survives the rebuild.
inline bool grid_rebuild_all(
    BtnSlot *slots, const GridConfig &cfg,
    esphome::text::Text **sp_configs,
    esphome::text::Text **sp_ext_configs,
    esphome::text::Text **sp_ext2_configs,
    esphome::text::Text **sp_ext3_configs,
    esphome::text::Text **sp_ext4_configs,
    esphome::text::Text **sp_ext5_configs,
    esphome::text::Text **sp_ext6_configs,
    esphome::text::Text **sp_ext7_configs,
    const std::string &order_str,
    const std::string &on_hex,
    lv_obj_t *main_page_obj) {
  if (main_page_obj == nullptr) {
    ESP_LOGW("navigation", "Main page is not ready");
    return false;
  }
  const int active_subpage_slot = navigation_active_subpage_slot();
  const bool grid_screen_active = grid_navigation_rebuild_should_return_home(
      lv_scr_act() == main_page_obj, active_subpage_slot);
  if (grid_screen_active && !navigation_return_home(main_page_obj)) return false;
  grid_phase1(slots, cfg, order_str, on_hex, main_page_obj);
  grid_phase2(slots, cfg, sp_configs, sp_ext_configs, sp_ext2_configs,
              sp_ext3_configs, sp_ext4_configs, sp_ext5_configs,
              sp_ext6_configs, sp_ext7_configs, order_str, on_hex,
              main_page_obj);
  if (active_subpage_slot > 0 &&
      !navigation_restore_subpage_slot(active_subpage_slot)) {
    ESP_LOGI("navigation", "Secondary page %d was removed during rebuild",
             active_subpage_slot);
  }
  return true;
}

inline void grid_phase2(
    BtnSlot *slots, const GridConfig &cfg,
    esphome::text::Text **sp_configs,
    esphome::text::Text **sp_ext_configs,
    esphome::text::Text **sp_ext2_configs,
    esphome::text::Text **sp_ext3_configs,
    const std::string &order_str,
    const std::string &on_hex,
    lv_obj_t *main_page_obj) {
  grid_phase2(slots, cfg, sp_configs, sp_ext_configs, sp_ext2_configs, sp_ext3_configs,
    nullptr, nullptr, nullptr, nullptr,
    order_str, on_hex, main_page_obj);
}

inline void grid_phase2(
    BtnSlot *slots, const GridConfig &cfg,
    esphome::text::Text **sp_configs,
    esphome::text::Text **sp_ext_configs,
    const std::string &order_str,
    const std::string &on_hex,
    lv_obj_t *main_page_obj) {
  grid_phase2(slots, cfg, sp_configs, sp_ext_configs, nullptr, nullptr,
    order_str, on_hex, main_page_obj);
}

// ── Phase 3: Temperature + presence/media subscriptions ───────────────

