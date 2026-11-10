// Generated from product/v2/panel_settings.json. Do not edit.
#pragma once

#include <cstdint>
#include "panel_setting_record.h"

namespace espdesktop::panel_settings {

enum class ScalarSetting : uint8_t {
  SCREEN_CLOCK_BAR,
  SCREEN_CLOCK_BAR_TIME,
  SCREEN_CLOCK_BAR_NIGHT_MODE,
  SCREEN_NETWORK_STATUS_ICON,
  SCREEN_BATTERY_STATUS,
  SCREEN_SUBPAGE_TITLE_BAR,
  SCREEN_SUBPAGE_CHEVRON,
  COMPANION_RETURN_HOME_ON_APP_SWITCH,
  SCREEN_DEFAULT_ICON_SIZE,
  SCREEN_CARD_CURVE,
  SCREENSAVER_MODE,
  SCREEN_SAVER_ACTION,
  SCREEN_SAVER_SHOW_DATE,
  SCREENSAVER_TIMEOUT,
  SCREEN_SAVER_DIMMED_BRIGHTNESS,
  SCREEN_SAVER_DAYTIME_DIMMED_BRIGHTNESS,
  SCREEN_SAVER_NIGHTTIME_DIMMED_BRIGHTNESS,
  SCREEN_SAVER_DAYTIME_CLOCK_BRIGHTNESS,
  SCREEN_SAVER_NIGHTTIME_CLOCK_BRIGHTNESS,
  COUNT
};
struct ScalarRule {
  std::string_view key;
  std::string_view default_value;
  bool (*valid)(std::string_view);
};
inline constexpr std::array<ScalarRule, size_t(ScalarSetting::COUNT)> SCALAR_RULES{{
  {"screen_clock_bar", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_clock_bar_time", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_clock_bar_night_mode", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_network_status_icon", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_battery_status", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_subpage_title_bar", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_subpage_chevron", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"companion_return_home_on_app_switch", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_default_icon_size", "Large", [](std::string_view value) { return value == "Small" || value == "Medium" || value == "Large"; }},
  {"screen_card_curve", "Large", [](std::string_view value) { return value == "Small" || value == "Medium" || value == "Large"; }},
  {"screensaver_mode", "disabled", [](std::string_view value) { return value == "disabled" || value == "timer" || value == "companion"; }},
  {"screen_saver_action", "Display Off", [](std::string_view value) { return value == "Display Off" || value == "Screen Dimmed" || value == "Clock"; }},
  {"screen_saver_show_date", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screensaver_timeout", "1800", [](std::string_view value) { int parsed; return read_integer(value, parsed, 10, 3600); }},
  {"screen_saver_dimmed_brightness", "10", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_daytime_dimmed_brightness", "10", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_nighttime_dimmed_brightness", "10", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_daytime_clock_brightness", "35", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_nighttime_clock_brightness", "35", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
}};

inline size_t scalar_setting_index(std::string_view key) {
  for (size_t i = 0; i < SCALAR_RULES.size(); ++i)
    if (SCALAR_RULES[i].key == key) return i;
  return SCALAR_RULES.size();
}

inline constexpr std::string_view screen_schedule_preferences_key = "screen_schedule_preferences";
inline constexpr int screen_schedule_preferences_version = 1;

struct ScreenSchedulePreferencesRecord {
  std::string_view enabled{};
  int on_hour{};
  int off_hour{};
  std::string_view night_mode{};
  int wake_timeout{};
  int wake_brightness{};
  int dimmed_brightness{};
  int clock_brightness{};
  std::string_view clock_color{};
};

inline std::optional<ScreenSchedulePreferencesRecord> read_screen_schedule_preferences(std::string_view value) {
  const auto fields = split_fields<10>(value);
  if (!fields || (*fields)[0] != "1") return {};
  ScreenSchedulePreferencesRecord result;
  const auto enabled = (*fields)[1];
  const auto on_hour = (*fields)[2];
  const auto off_hour = (*fields)[3];
  const auto night_mode = (*fields)[4];
  const auto wake_timeout = (*fields)[5];
  const auto wake_brightness = (*fields)[6];
  const auto dimmed_brightness = (*fields)[7];
  const auto clock_brightness = (*fields)[8];
  const auto clock_color = (*fields)[9];
  if ((enabled != "0" && enabled != "1")) return {};
  result.enabled = enabled;
  if (!read_integer(on_hour, result.on_hour, 0, 23)) return {};
  if (!read_integer(off_hour, result.off_hour, 0, 23)) return {};
  if ((night_mode != "off" && night_mode != "dim" && night_mode != "always" && night_mode != "clock")) return {};
  result.night_mode = night_mode;
  if (!read_integer(wake_timeout, result.wake_timeout, 10, 3600)) return {};
  if (!read_integer(wake_brightness, result.wake_brightness, 10, 100)) return {};
  if (!read_integer(dimmed_brightness, result.dimmed_brightness, 1, 100)) return {};
  if (!read_integer(clock_brightness, result.clock_brightness, 1, 100)) return {};
  if (!is_hex(clock_color, 6)) return {};
  result.clock_color = clock_color;
  return result;
}

inline constexpr std::string_view display_theme_preferences_key = "display_theme_preferences";
inline constexpr int display_theme_preferences_version = 1;

struct DisplayThemePreferencesRecord {
  std::string_view mode{};
  std::string_view auto_method{};
  int light_start{};
  int dark_start{};
  int sunrise_offset{};
  int sunset_offset{};
};

inline std::optional<DisplayThemePreferencesRecord> read_display_theme_preferences(std::string_view value) {
  const auto fields = split_fields<7>(value);
  if (!fields || (*fields)[0] != "1") return {};
  DisplayThemePreferencesRecord result;
  const auto mode = (*fields)[1];
  const auto auto_method = (*fields)[2];
  const auto light_start = (*fields)[3];
  const auto dark_start = (*fields)[4];
  const auto sunrise_offset = (*fields)[5];
  const auto sunset_offset = (*fields)[6];
  if ((mode != "dark" && mode != "light" && mode != "auto")) return {};
  result.mode = mode;
  if ((auto_method != "time" && auto_method != "sun")) return {};
  result.auto_method = auto_method;
  if (!read_integer(light_start, result.light_start, 0, 1439)) return {};
  if (!read_integer(dark_start, result.dark_start, 0, 1439)) return {};
  if (!read_integer(sunrise_offset, result.sunrise_offset, -180, 180)) return {};
  if (!read_integer(sunset_offset, result.sunset_offset, -180, 180)) return {};
  return result;
}

}  // namespace espdesktop::panel_settings
