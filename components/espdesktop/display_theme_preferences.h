#pragma once

#include <array>
#include <charconv>
#include <cstdio>
#include <optional>
#include <string_view>

#include "theme_settings.h"

namespace espdesktop {

inline constexpr std::string_view DISPLAY_THEME_PREFERENCES_KEY = "display_theme_preferences";

// One portable, versioned record. Times are local minutes since midnight and
// solar offsets are signed minutes. Parsing never changes the active theme.
inline std::optional<ThemeSettings> parse_display_theme_preferences(std::string_view value) {
  std::array<std::string_view, 7> fields;
  for (size_t i = 0; i < fields.size(); ++i) {
    const auto comma = value.find(',');
    if ((comma == std::string_view::npos) != (i == fields.size() - 1)) return {};
    fields[i] = value.substr(0, comma);
    if (comma != std::string_view::npos) value.remove_prefix(comma + 1);
  }
  if (fields[0] != "1") return {};

  ThemeSettings settings;
  if (fields[1] == "light") settings.mode = ThemeMode::LIGHT;
  else if (fields[1] == "auto") settings.mode = ThemeMode::AUTO;
  else if (fields[1] != "dark") return {};
  if (fields[2] == "sun") settings.auto_method = ThemeAutoMethod::SUNRISE_SUNSET;
  else if (fields[2] != "time") return {};

  auto read = [](std::string_view field, int &out, int minimum, int maximum) {
    const auto *end = field.data() + field.size();
    const auto result = std::from_chars(field.data(), end, out);
    return result.ec == std::errc{} && result.ptr == end && out >= minimum && out <= maximum;
  };
  constexpr int OFFSET = THEME_SUN_OFFSET_LIMIT_MINUTES;
  if (!read(fields[3], settings.light_start, 0, 1439) ||
      !read(fields[4], settings.dark_start, 0, 1439) ||
      !read(fields[5], settings.sunrise_offset, -OFFSET, OFFSET) ||
      !read(fields[6], settings.sunset_offset, -OFFSET, OFFSET)) return {};
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
  return std::string("1,") + mode + "," + method + "," + std::to_string(settings.light_start) +
      "," + std::to_string(settings.dark_start) + "," + std::to_string(settings.sunrise_offset) +
      "," + std::to_string(settings.sunset_offset);
}

inline bool same_display_theme_preferences(const ThemeSettings &left, const ThemeSettings &right) {
  return left.mode == right.mode && left.auto_method == right.auto_method &&
      left.light_start == right.light_start && left.dark_start == right.dark_start &&
      left.sunrise_offset == right.sunrise_offset && left.sunset_offset == right.sunset_offset;
}

}  // namespace espdesktop
