#pragma once

#include <ctime>

struct TokenUsageTileRow {
  lv_obj_t *value{nullptr};
  lv_obj_t *reset{nullptr};
};

struct TokenUsageTile {
  lv_obj_t *container{nullptr};
  lv_timer_t *timer{nullptr};
  TokenUsageTileRow row;
  size_t service{0};
  std::optional<ProviderUsageService> provider;
};

inline std::string token_usage_countdown(int64_t remaining) {
  std::string detail = espdesktop_i18n_key("token_usage_resets");
  const auto total_hours = remaining / 3600;
  const auto days = total_hours / 24;
  const auto hours = total_hours % 24;
  if (days > 0) detail += " " + std::to_string(days) + "d";
  if (hours > 0) detail += " " + std::to_string(hours) + "h";
  if (total_hours == 0) detail += " " + std::to_string(std::max<int64_t>(1, remaining / 60)) + "m";
  return detail;
}

inline std::string token_usage_money(int32_t amount_minor, ProviderUsageUnit unit) {
  const auto magnitude = std::abs(static_cast<int64_t>(amount_minor));
  const auto cents = magnitude % 100;
  return std::string(amount_minor < 0 ? "-" : "") + (unit == ProviderUsageUnit::USD ? "$" : "CNY ") +
      std::to_string(magnitude / 100) + (cents < 10 ? ".0" : ".") + std::to_string(cents);
}

inline void refresh_token_usage_tile(const TokenUsageTile &tile) {
  const auto now = std::time(nullptr);
  const bool clock_ready = now > 1700000000;
  const auto &row = tile.row;
  std::string value = espdesktop_i18n("Unavailable");
  std::string detail;
  if (tile.provider) {
    const auto [connected, reading] = companion_runtime_service().provider_usage(*tile.provider);
    const int64_t age = now - reading.observed_at;
    if (connected && clock_ready && reading.observed_at && age >= -60 && age <= 15 * 60) {
      if (reading.metric == ProviderUsageMetric::PERCENT_LEFT) {
        value = std::to_string((reading.amount_minor + 50) / 100) + espdesktop_i18n("% left");
        const int64_t remaining = static_cast<int64_t>(reading.resets_at) - now;
        if (remaining > 0) detail = token_usage_countdown(remaining);
      } else {
        value = token_usage_money(reading.amount_minor, reading.unit);
        const char *key = reading.metric == ProviderUsageMetric::KEY_BUDGET ? "provider_usage_key_budget" :
            reading.metric == ProviderUsageMetric::KEY_SPEND ? "provider_usage_key_spend" : "provider_usage_balance";
        detail = espdesktop_i18n_key(key);
      }
    }
  } else {
    const auto [connected, readings] = companion_runtime_service().token_usage();
    const auto &reading = readings[tile.service];
    if (reading.observed_at) {
      value = std::to_string(reading.remaining_percent) + espdesktop_i18n("% left");
      const int64_t remaining = static_cast<int64_t>(reading.resets_at) - now;
      if (connected && clock_ready && remaining > 0 && now - reading.observed_at <= 15 * 60)
        detail = token_usage_countdown(remaining);
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

// Contract coverage marker: "token_usage".
inline void setup_token_usage_card(BtnSlot &slot, const ParsedCfg &config,
                                    const DisplayProfile &display, const CardPalette &palette) {
  const auto configured_service = cfg_option_value(config.options, "services");
  const auto provider = provider_usage_service(configured_service);
  const auto service = token_usage_service(configured_service);
  lv_obj_clear_flag(slot.btn, LV_OBJ_FLAG_CLICKABLE);
  // Use the standard icon label so the glyph follows the card size and theme.
  constexpr const char *glyphs[] = {"\uE900", "\uE901", "\uE902", "\uE901", "\uE902", "\uE903", "\uE904"};
  static_assert(sizeof(glyphs) / sizeof(*glyphs) == static_cast<size_t>(TokenUsageService::COUNT));
  lv_obj_clear_flag(slot.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  constexpr const char *provider_icons[] = {"Gauge", "Router Network", "Database"};
  static_assert(sizeof(provider_icons) / sizeof(*provider_icons) == static_cast<size_t>(ProviderUsageService::COUNT));
  lv_label_set_text(slot.icon_lbl, provider ? find_icon(provider_icons[static_cast<size_t>(*provider)]) :
      glyphs[static_cast<size_t>(service)]);
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

  const auto usage_window = service == TokenUsageService::OPENCODE_GO &&
      cfg_option_value(config.options, "limit") == "monthly" ? TokenUsageService::OPENCODE_GO_MONTHLY : service;
  tile->service = static_cast<size_t>(usage_window);
  tile->provider = provider;
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
