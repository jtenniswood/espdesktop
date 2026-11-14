#pragma once

#include <ctime>
#include "token_usage_icons.h"

struct TokenUsageTileRow {
  lv_obj_t *value{nullptr};
  lv_obj_t *reset{nullptr};
};

struct TokenUsageTile {
  lv_obj_t *container{nullptr};
  lv_timer_t *timer{nullptr};
  TokenUsageTileRow row;
  size_t service{0};
};

inline void refresh_token_usage_tile(const TokenUsageTile &tile) {
  const auto [connected, readings] = companion_runtime_service().token_usage();
  const auto now = std::time(nullptr);
  constexpr int64_t seconds_per_hour = 3600;
  constexpr int64_t hours_per_day = 24;
  const auto &row = tile.row;
  const auto &reading = readings[tile.service];
  const int64_t remaining = static_cast<int64_t>(reading.resets_at) - now;
  const bool clock_ready = now > 1700000000;
  const int64_t age = now - reading.observed_at;
  const bool reset_known = connected && clock_ready && remaining > 0 && age <= 15 * 60;
  std::string value = espdesktop_i18n("Unavailable");
  std::string detail;
  if (reading.observed_at) {
    value = std::to_string(reading.remaining_percent) + espdesktop_i18n("% left");
    if (reset_known) {
      detail = espdesktop_i18n_key("token_usage_resets");
      const auto total_hours = remaining / seconds_per_hour;
      const auto days = total_hours / hours_per_day;
      const auto hours = total_hours % hours_per_day;
      if (days > 0) detail += " " + std::to_string(days) + "d";
      if (hours > 0) detail += " " + std::to_string(hours) + "h";
      if (total_hours == 0) detail += " " + std::to_string(std::max<int64_t>(1, remaining / 60)) + "m";
    }
  }
  const bool show_detail = !detail.empty();
  if (show_detail == lv_obj_has_flag(row.reset, LV_OBJ_FLAG_HIDDEN)) {
    if (show_detail) {
      lv_obj_clear_flag(row.reset, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(row.reset, LV_OBJ_FLAG_HIDDEN);
    }
    const auto line_height = lv_font_get_line_height(lv_obj_get_style_text_font(row.reset, LV_PART_MAIN));
    lv_obj_set_y(row.value, show_detail ? -line_height : 0);
  }
  if (normalize_display_text(value) != lv_label_get_text(row.value))
    lv_label_set_display_text(row.value, value.c_str());
  if (normalize_display_text(detail) != lv_label_get_text(row.reset))
    lv_label_set_display_text(row.reset, detail.c_str());
}

inline void token_usage_tile_deleted(lv_event_t *event) {
  auto *tile = static_cast<TokenUsageTile *>(lv_event_get_user_data(event));
  lv_timer_del(tile->timer);
  delete tile;
}

inline void token_usage_tile_tick(lv_timer_t *timer) {
  const auto *tile = static_cast<TokenUsageTile *>(lv_timer_get_user_data(timer));
  if (lv_obj_get_screen(tile->container) == lv_scr_act()) refresh_token_usage_tile(*tile);
}

#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
inline const lv_image_dsc_t *token_usage_icon(size_t index) {
  static const auto descriptors = [] {
    std::array<lv_image_dsc_t, 2> result{};
    const uint8_t *pixels[] = {token_usage_codex_icon, token_usage_claude_icon};
    for (size_t i = 0; i < result.size(); ++i) {
      auto &icon = result[i];
      icon.header.magic = LV_IMAGE_HEADER_MAGIC;
      icon.header.cf = LV_COLOR_FORMAT_A8;
      icon.header.w = icon.header.h = 32;
      icon.header.stride = 32;
      icon.data_size = sizeof(token_usage_codex_icon);
      icon.data = pixels[i];
    }
    return result;
  }();
  return &descriptors[index];
}
#endif

// Contract coverage marker: "token_usage".
inline void setup_token_usage_card(BtnSlot &slot, const ParsedCfg &config,
                                    const DisplayProfile &display, const CardPalette &palette) {
  const size_t service = cfg_option_value(config.options, "services") == "claude" ? 1 : 0;
  lv_obj_clear_flag(slot.btn, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(slot.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_flag(slot.text_lbl, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_flag(slot.sensor_container, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_style_bg_color(slot.btn, lv_color_hex(palette.has_off ? palette.off_val : palette.sensor_val),
                            LV_PART_MAIN);

  auto *container = lv_obj_create(slot.btn);
  lv_obj_remove_style_all(container);
  lv_obj_set_size(container, lv_pct(100), lv_pct(100));
  lv_obj_clear_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(container, LV_OBJ_FLAG_CLICKABLE);
  auto *tile = new TokenUsageTile{container};
  const auto *primary_font = lv_obj_get_style_text_font(slot.text_lbl, LV_PART_MAIN);
  const auto *secondary_font = display_small_text_font(display, primary_font);
  const auto foreground = lv_obj_get_style_text_color(slot.text_lbl, LV_PART_MAIN);

  tile->service = service;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  auto *icon = lv_image_create(container);
  lv_image_set_src(icon, token_usage_icon(service));
  lv_obj_set_style_image_recolor(icon, foreground, LV_PART_MAIN);
  lv_obj_set_style_image_recolor_opa(icon, LV_OPA_COVER, LV_PART_MAIN);
#else
  auto *icon = lv_label_create(container);
  lv_label_set_text(icon, service == 0 ? "Codex" : "Claude");
#endif
  lv_obj_clear_flag(icon, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_align(icon, LV_ALIGN_TOP_LEFT, 0, 0);
  auto *value = lv_label_create(container);
  auto *reset = lv_label_create(container);
  for (auto *label : {value, reset}) {
    lv_obj_set_style_text_color(label, foreground, LV_PART_MAIN);
    lv_obj_set_style_text_font(label, label == value ? primary_font : secondary_font, LV_PART_MAIN);
    lv_obj_set_width(label, lv_pct(100));
    lv_obj_set_height(label, LV_SIZE_CONTENT);
    lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN);
  }
  lv_obj_set_style_text_opa(reset, LV_OPA_80, LV_PART_MAIN);
  lv_obj_align(value, LV_ALIGN_BOTTOM_LEFT, 0, 0);
  lv_obj_add_flag(reset, LV_OBJ_FLAG_HIDDEN);
  lv_obj_align(reset, LV_ALIGN_BOTTOM_LEFT, 0, 0);
  tile->row = {value, reset};
  refresh_token_usage_tile(*tile);
  tile->timer = lv_timer_create(token_usage_tile_tick, 1000, tile);
  lv_obj_add_event_cb(container, token_usage_tile_deleted, LV_EVENT_DELETE, tile);
}
