#pragma once

#include <cstdint>
#include "rainfall_display.h"

// Forecast widgets exist only on configured forecast cards. The modal allocates
// only visible forecast columns and a stale-status label, sharing the owner's source.
enum class WeatherForecastView : uint8_t { DAILY, TODAY, TOMORROW, RAINFALL };
struct WeatherDailyColumn { lv_obj_t *icon, *day, *high; };
struct WeatherDailyCard {
  lv_obj_t *owner = nullptr, *root = nullptr, *caption = nullptr, *placeholder_icon = nullptr;
  WeatherDailySource *source = nullptr;
  WeatherForecastView view = WeatherForecastView::DAILY;
  const lv_font_t *font = nullptr, *icon_font = nullptr, *summary_font = nullptr, *detail_font = nullptr, *temperature_font = nullptr;
  std::vector<WeatherDailyColumn> columns;
  int width = 0, height = 0;
  espdesktop::weather::CardLayout layout;
};
inline std::vector<WeatherDailyCard *> &weather_daily_cards() {
  static std::vector<WeatherDailyCard *> cards;
  return cards;
}
inline std::string weather_daily_temperature(float value, const char *unit) {
  if (!std::isfinite(value)) return "--";
  char text[16];
  std::snprintf(text, sizeof(text), "%d", static_cast<int>(std::round(
    convert_temperature_value_for_display_float(value, unit))));
  return text;
}
inline std::string weather_daily_temperature_range(const espdesktop::weather::Day &day, const char *unit) {
  return weather_daily_temperature(day.high, unit) + "\u00B0/" + weather_daily_temperature(day.low, unit) + "\u00B0";
}
inline std::string weather_daily_weekday_label(const espdesktop::weather::Day &day) {
  static const char *const weekdays[] = {"Sun", "Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"};
  const int index = espdesktop::weather::weekday(day.date);
  if (index < 0 || index >= 7) return "";
  return espdesktop_i18n(std::string(weekdays[index]));
}
inline std::string weather_daily_date_label(const espdesktop::weather::Day &day,
                                           const espdesktop::weather::Forecast &forecast) {
  return std::strcmp(day.date, forecast.today) == 0 ? espdesktop_i18n(std::string("Today")) : weather_daily_weekday_label(day);
}
// Select by Home Assistant's local date, rather than assuming the first entry is today.
// A provider may omit either requested day. Do not substitute a different date.
inline size_t weather_daily_selected_day(const WeatherDailyCard &card) {
  const auto &forecast = card.source->forecast;
  if (card.view == WeatherForecastView::DAILY) return 0;
  const char *date = (card.view == WeatherForecastView::TODAY || card.view == WeatherForecastView::RAINFALL) ? forecast.today : forecast.tomorrow;
  for (size_t i = 0; i < forecast.count; ++i)
    if (std::strcmp(forecast.days[i].date, date) == 0) return i;
  return forecast.count;
}
inline lv_obj_t *weather_daily_label(lv_obj_t *parent, const lv_font_t *font) {
  auto *label = lv_label_create(parent);
  if (font) lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
  lv_obj_clear_flag(label, LV_OBJ_FLAG_CLICKABLE);
  apply_text_width_compensation(label);
  return label;
}
inline int weather_daily_minimum_width(const lv_font_t *font, const lv_font_t *icon_font, int padding, bool include_today = true) {
  lv_point_t measured;
  lv_text_get_size(&measured, "-188\u00B0", font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  int width = std::max(static_cast<int>(measured.x), static_cast<int>(lv_font_get_line_height(icon_font)));
  static const char *const labels[] = {"Today", "Sun", "Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"};
  for (const char *key : labels) {
    if (!include_today && std::strcmp(key, "Today") == 0) continue;
    const auto text = espdesktop_i18n(std::string(key));
    lv_text_get_size(&measured, text.c_str(), font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
    width = std::max(width, static_cast<int>(measured.x));
  }
  return width + padding;
}
inline int weather_daily_day_gap(const lv_font_t *font) {
  return std::max(8, static_cast<int>(lv_font_get_line_height(font)));
}
inline int weather_daily_forecast_minimum_width(const lv_font_t *font, const lv_font_t *icon_font,
    const lv_font_t *temperature_font, const espdesktop::weather::Forecast &forecast,
    size_t first, size_t count, int padding = 24, bool include_today = true) {
  int minimum = weather_daily_minimum_width(font, icon_font, padding, include_today);
  for (size_t i = first; i < std::min(first + count, forecast.count); ++i) {
    const auto temperature = weather_daily_temperature_range(forecast.days[i], forecast.temperature_unit);
    lv_point_t measured;
    lv_text_get_size(&measured, temperature.c_str(), temperature_font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
    minimum = std::max(minimum, static_cast<int>(measured.x) + padding);
  }
  return minimum;
}
#include "button_grid_weather_modal.h"

inline void weather_daily_render_card(WeatherDailyCard *card) {
  if (!card || !card->source || !card->root) return;
  auto &forecast = card->source->forecast;
  const int width = lv_obj_get_content_width(card->owner);
  const int height = lv_obj_get_content_height(card->owner);
  if (width <= 0 || height <= 0) return;
  const size_t first = weather_daily_selected_day(*card);
  if (!forecast.count || first >= forecast.count) {
    // Reuse the normal card icon until real days arrive; no placeholder columns.
    if (!card->columns.empty()) {
      lv_obj_clean(card->root);
      card->columns.clear();
    }
    lv_obj_add_flag(card->root, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_display_text(card->placeholder_icon, card->source->loading
      ? find_icon("Weather Cloudy Clock") : weather_icon_for_state("unavailable"));
    lv_obj_clear_flag(card->placeholder_icon, LV_OBJ_FLAG_HIDDEN);
    const char *status_key = card->source->loading ? "Loading" : "Forecast unavailable";
    lv_label_set_display_text(card->caption, espdesktop_i18n(std::string(status_key)).c_str());
    return;
  }
  lv_obj_add_flag(card->placeholder_icon, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(card->root, LV_OBJ_FLAG_HIDDEN);
  const int font_height = lv_font_get_line_height(card->font);
  const int temperature_height = lv_font_get_line_height(card->temperature_font);
  const int day_gap = weather_daily_day_gap(card->font);
  const int icon_height = lv_font_get_line_height(card->icon_font);
  const size_t available_days = card->view == WeatherForecastView::DAILY ? forecast.count : 1;
  const int minimum_day_width = weather_daily_forecast_minimum_width(card->font, card->icon_font,
    card->temperature_font, forecast, first, available_days);
  // Stale status belongs in the details modal; it must not change card geometry.
  const int content_height = height;
  const int row_gap = std::max(8, font_height / 2);
  const int minimum_height = icon_height + font_height + temperature_height + 4;
  const auto layout = espdesktop::weather::card_layout(width, content_height, minimum_day_width,
    minimum_height, day_gap, row_gap, available_days);
  const bool grid = layout.rows > 1;
  const int icon_gap = grid ? std::min(std::max(6, font_height / 3),
    (content_height - row_gap * static_cast<int>(layout.rows - 1)) / static_cast<int>(layout.rows)
      - icon_height - font_height - temperature_height - 2) : 2;
  const int group_height = icon_height + icon_gap + font_height + temperature_height + 2;
  // Group each icon with its text; use spare height to separate whole rows.
  const int grid_row_gap = grid ? std::min(std::max(row_gap, font_height),
    (content_height - group_height * static_cast<int>(layout.rows)) / static_cast<int>(layout.rows - 1)) : row_gap;
  // Keep widgets stable on refresh; rebuild only when the geometry or layout changes.
  if (card->width != width || card->height != height || card->columns.size() != layout.count ||
      card->layout.columns != layout.columns || card->layout.rows != layout.rows) {
    lv_obj_clean(card->root); card->columns.clear();
    card->width = width; card->height = height;
    card->layout = layout;
    lv_obj_set_size(card->root, width, height);
    lv_obj_align(card->root, LV_ALIGN_TOP_LEFT, 0, 0);
    for (size_t i = 0; i < layout.count; ++i) {
      auto make = [&](const lv_font_t *font) {
        auto *label = weather_daily_label(card->root, font);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN);
        return label;
      };
      WeatherDailyColumn col{make(card->icon_font), make(card->font), make(card->temperature_font)};
      theme_set_content_foreground(col.high);
      card->columns.push_back(col);
    }
  }
  lv_label_set_display_text(card->caption, "");
  for (size_t i = 0; i < card->columns.size(); ++i) {
    const auto &col = card->columns[i];
    const auto &day = forecast.days[first + i];
    const int column = static_cast<int>(i % layout.columns), row = static_cast<int>(i / layout.columns);
    const int usable_width = width - day_gap * static_cast<int>(layout.columns - 1);
    const int usable_height = content_height - grid_row_gap * static_cast<int>(layout.rows - 1);
    const int base_width = usable_width / static_cast<int>(layout.columns), remainder_width = usable_width % layout.columns;
    const int base_height = usable_height / static_cast<int>(layout.rows), remainder_height = usable_height % layout.rows;
    const int cell_width = base_width + (column < remainder_width ? 1 : 0);
    const int cell_height = base_height + (row < remainder_height ? 1 : 0);
    const int x = column * (base_width + day_gap) + std::min(column, remainder_width);
    const int y = row * (base_height + grid_row_gap) + std::min(row, remainder_height);
    const int icon_y = y + (grid ? (cell_height - group_height) / 2 : 0);
    const int text_top = grid ? icon_y + icon_height + icon_gap
      : y + std::max(icon_height + 2, cell_height - temperature_height - font_height - 2);
    lv_obj_set_width(col.icon, cell_width);
    lv_obj_set_pos(col.icon, x, icon_y);
    lv_obj_set_width(col.day, cell_width); lv_obj_set_width(col.high, cell_width);
    lv_obj_set_pos(col.day, x, text_top);
    lv_obj_set_pos(col.high, x, text_top + font_height + 2);
    std::string date = card->view == WeatherForecastView::TOMORROW
      ? espdesktop_i18n(std::string("Tomorrow")) : weather_daily_date_label(day, forecast);
    // Columns may be created after the card foreground was synchronized.
    const auto foreground = lv_obj_get_style_text_color(card->owner, LV_PART_MAIN);
    lv_obj_set_style_text_color(col.day, foreground, LV_PART_MAIN);
    lv_obj_set_style_text_color(col.icon, foreground, LV_PART_MAIN);
    if (card->view == WeatherForecastView::RAINFALL) date = espdesktop_i18n("Rainfall");
    lv_label_set_display_text(col.day, date.c_str());
    lv_label_set_display_text(col.icon, card->view == WeatherForecastView::RAINFALL ? find_icon("Weather Rainy") : weather_icon_for_state(day.condition));
    const auto high = card->view == WeatherForecastView::RAINFALL
      ? espdesktop::rainfall::amount(day.precipitation, forecast.precipitation_unit)
      : weather_daily_temperature_range(day, forecast.temperature_unit);
    // Blend secondary text with the card surface instead of painting opaque grey.
    lv_obj_set_style_text_color(col.high, foreground, LV_PART_MAIN);
    lv_obj_set_style_text_opa(col.high, LV_OPA_70, LV_PART_MAIN);
    lv_label_set_display_text(col.high, high.c_str());
  }
}
inline void weather_daily_refresh_visuals() {
  for (auto *card : weather_daily_cards()) weather_daily_render_card(card);
  weather_daily_refresh_modal();
  if (!weather_daily_cards().empty()) notify_dashboard_content_changed();
}
