#pragma once

#include <array>
#include <charconv>
#include <optional>
#include <string_view>

namespace espdesktop {

inline constexpr std::string_view SCREEN_SCHEDULE_PREFERENCES_KEY = "screen_schedule_preferences";

enum class ScheduledNightMode { OFF, DIMMED, ALWAYS_ON, CLOCK };

struct ScreenSchedulePreferences {
  bool enabled;
  unsigned on_hour, off_hour;
  ScheduledNightMode night_mode;
  unsigned wake_timeout, wake_brightness, dimmed_brightness, clock_brightness;
  std::array<char, 7> clock_color{};
};

inline std::optional<ScreenSchedulePreferences> parse_screen_schedule_preferences(std::string_view value) {
  std::array<std::string_view, 10> fields;
  for (size_t index = 0; index < fields.size(); ++index) {
    const auto comma = value.find(',');
    if ((comma == std::string_view::npos) != (index + 1 == fields.size())) return {};
    fields[index] = value.substr(0, comma);
    if (comma != std::string_view::npos) value.remove_prefix(comma + 1);
  }
  if (fields[0] != "1" || (fields[1] != "0" && fields[1] != "1")) return {};
  ScreenSchedulePreferences result{};
  result.enabled = fields[1] == "1";
  if (fields[4] == "off") result.night_mode = ScheduledNightMode::OFF;
  else if (fields[4] == "dim") result.night_mode = ScheduledNightMode::DIMMED;
  else if (fields[4] == "always") result.night_mode = ScheduledNightMode::ALWAYS_ON;
  else if (fields[4] == "clock") result.night_mode = ScheduledNightMode::CLOCK;
  else return {};

  auto read = [](std::string_view text, unsigned &out, unsigned minimum, unsigned maximum) {
    const auto end = text.data() + text.size();
    const auto number = std::from_chars(text.data(), end, out);
    return number.ec == std::errc{} && number.ptr == end && out >= minimum && out <= maximum;
  };
  if (!read(fields[2], result.on_hour, 0, 23) ||
      !read(fields[3], result.off_hour, 0, 23) ||
      !read(fields[5], result.wake_timeout, 10, 3600) ||
      !read(fields[6], result.wake_brightness, 10, 100) ||
      !read(fields[7], result.dimmed_brightness, 1, 100) ||
      !read(fields[8], result.clock_brightness, 1, 100) ||
      fields[9].size() != 6) return {};

  for (size_t index = 0; index < fields[9].size(); ++index) {
    const char digit = fields[9][index];
    if (!((digit >= '0' && digit <= '9') || (digit >= 'A' && digit <= 'F'))) return {};
    result.clock_color[index] = digit;
  }
  return result;
}

inline const char *scheduled_night_mode_option(ScheduledNightMode mode) {
  switch (mode) {
    case ScheduledNightMode::DIMMED: return "Screen Dimmed";
    case ScheduledNightMode::ALWAYS_ON: return "Always On";
    case ScheduledNightMode::CLOCK: return "Clock";
    default: return "Screen off";
  }
}

}  // namespace espdesktop
