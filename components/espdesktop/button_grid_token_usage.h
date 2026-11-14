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
  std::array<TokenUsageTileRow, 2> rows{};
};

inline void refresh_token_usage_tile(const TokenUsageTile &tile) {
  const auto [connected, readings] = companion_runtime_service().token_usage();
  const auto now = std::time(nullptr);
  constexpr int64_t seconds_per_hour = 3600;
  constexpr int64_t seconds_per_day = 24 * seconds_per_hour;
  for (size_t i = 0; i < tile.rows.size(); ++i) {
    const auto &row = tile.rows[i];
    if (!row.value) continue;
    const auto &reading = readings[i];
    const int64_t remaining = static_cast<int64_t>(reading.resets_at) - now;
    const bool clock_ready = now > 1700000000;
    const int64_t age = clock_ready ? now - reading.observed_at : 0;
    const bool stale = !connected || (clock_ready && (remaining <= 0 || age > 15 * 60));
    std::string value = espdesktop_i18n("Unavailable");
    std::string detail;
    if (reading.observed_at) {
      value = std::to_string(reading.remaining_percent) + espdesktop_i18n("% left");
      if (stale) {
        detail = espdesktop_i18n("Out of date");
      } else if (clock_ready) {
        const auto count = remaining >= seconds_per_day ? remaining / seconds_per_day
          : remaining >= seconds_per_hour ? remaining / seconds_per_hour
          : std::max<int64_t>(1, remaining / 60);
        const char *unit = remaining >= seconds_per_day ? "d"
          : remaining >= seconds_per_hour ? "h" : "m";
        detail = std::string(espdesktop_i18n("Resets in")) + " " + std::to_string(count) + unit;
      }
    }
    if (normalize_display_text(value) != lv_label_get_text(row.value))
      lv_label_set_display_text(row.value, value.c_str());
    if (normalize_display_text(detail) != lv_label_get_text(row.reset))
      lv_label_set_display_text(row.reset, detail.c_str());
  }
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
      icon.header.cf = LV_COLOR_FORMAT_RGB565A8;
      icon.header.w = icon.header.h = 24;
      icon.header.stride = 48;
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
  const auto services = cfg_option_value(config.options, "services");
  const bool both = services == "both";
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
  const auto *secondary_font = display_sensor_font(display) ? display_sensor_font(display) : primary_font;
  const int line_height = lv_font_get_line_height(secondary_font);
  const auto foreground = lv_obj_get_style_text_color(slot.text_lbl, LV_PART_MAIN);

  for (size_t i = 0; i < tile->rows.size(); ++i) {
    if (!both && i != static_cast<size_t>(services == "claude")) continue;
    const int left = both ? 29 : 0;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
    auto *icon = lv_image_create(container);
    lv_image_set_src(icon, token_usage_icon(i));
#else
    auto *icon = lv_label_create(container);
    lv_label_set_text(icon, i == 0 ? "Codex" : "Claude");
#endif
    lv_obj_clear_flag(icon, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_align(icon, both && i == 1 ? LV_ALIGN_BOTTOM_LEFT : LV_ALIGN_TOP_LEFT, 0, 0);

    auto *value = lv_label_create(container);
    auto *reset = lv_label_create(container);
    const auto *value_font = both ? secondary_font : primary_font;
    for (auto *label : {value, reset}) {
      lv_obj_set_style_text_color(label, foreground, LV_PART_MAIN);
      lv_obj_set_style_text_font(label, label == value ? value_font : secondary_font, LV_PART_MAIN);
      lv_obj_set_width(label, LV_PCT(100));
      lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
    }
    lv_obj_set_style_text_opa(reset, LV_OPA_80, LV_PART_MAIN);
    if (both && i == 0) {
      lv_obj_align(value, LV_ALIGN_TOP_LEFT, left, 0);
      lv_obj_align(reset, LV_ALIGN_TOP_LEFT, left, line_height);
    } else {
      lv_obj_align(value, LV_ALIGN_BOTTOM_LEFT, left, -line_height);
      lv_obj_align(reset, LV_ALIGN_BOTTOM_LEFT, left, 0);
    }
    tile->rows[i] = {value, reset};
  }
  refresh_token_usage_tile(*tile);
  tile->timer = lv_timer_create(token_usage_tile_tick, 1000, tile);
  lv_obj_add_event_cb(container, token_usage_tile_deleted, LV_EVENT_DELETE, tile);
}
