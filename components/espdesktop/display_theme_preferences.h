#pragma once

#include <cstdio>

#include "panel_settings_generated.h"

#include "theme_settings.h"

namespace espdesktop {

inline constexpr std::string_view DISPLAY_THEME_PREFERENCES_KEY = panel_settings::display_theme_preferences_key;

// One portable, versioned record. Times are local minutes since midnight and
// solar offsets are signed minutes. Parsing never changes the active theme.
inline std::optional<ThemeSettings> parse_display_theme_preferences(std::string_view value) {
  const auto saved = panel_settings::read_display_theme_preferences(value);
  if (!saved) return {};
  ThemeSettings settings;
  if (saved->mode == "light") settings.mode = ThemeMode::LIGHT;
  if (saved->mode == "auto") settings.mode = ThemeMode::AUTO;
  if (saved->auto_method == "sun") settings.auto_method = ThemeAutoMethod::SUNRISE_SUNSET;
  settings.light_start = saved->light_start;
  settings.dark_start = saved->dark_start;
  settings.sunrise_offset = saved->sunrise_offset;
  settings.sunset_offset = saved->sunset_offset;
  return settings;
}

inline const char *display_theme_mode_option(ThemeMode mode) {
  switch (mode) {
    case ThemeMode::LIGHT: return "Light";
    case ThemeMode::AUTO: return "Auto";
    default: return "Dark";
  }
}

inline const char *display_theme_method_option(ThemeAutoMethod method) {
  return method == ThemeAutoMethod::SUNRISE_SUNSET ? "Sunrise / Sunset" : "Time";
}

inline std::string display_theme_time_option(int minutes) {
  char value[16];
  std::snprintf(value, sizeof(value), "%02d:%02d", minutes / 60, minutes % 60);
  return value;
}

inline std::string encode_display_theme_preferences(const ThemeSettings &settings) {
  const char *mode = settings.mode == ThemeMode::LIGHT ? "light" :
      settings.mode == ThemeMode::AUTO ? "auto" : "dark";
  const char *method = settings.auto_method == ThemeAutoMethod::SUNRISE_SUNSET ? "sun" : "time";
  return std::to_string(panel_settings::display_theme_preferences_version) + "," + mode + "," + method + "," + std::to_string(settings.light_start) +
      "," + std::to_string(settings.dark_start) + "," + std::to_string(settings.sunrise_offset) +
      "," + std::to_string(settings.sunset_offset);
}

inline bool same_display_theme_preferences(const ThemeSettings &left, const ThemeSettings &right) {
  return left.mode == right.mode && left.auto_method == right.auto_method &&
      left.light_start == right.light_start && left.dark_start == right.dark_start &&
      left.sunrise_offset == right.sunrise_offset && left.sunset_offset == right.sunset_offset;
}

}  // namespace espdesktop
