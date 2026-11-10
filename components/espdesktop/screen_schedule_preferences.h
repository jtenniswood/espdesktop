#pragma once

#include <array>
#include "panel_settings_generated.h"

namespace espdesktop {

inline constexpr std::string_view SCREEN_SCHEDULE_PREFERENCES_KEY = panel_settings::screen_schedule_preferences_key;

enum class ScheduledNightMode { OFF, DIMMED, ALWAYS_ON, CLOCK };

struct ScreenSchedulePreferences {
  bool enabled;
  unsigned on_hour, off_hour;
  ScheduledNightMode night_mode;
  unsigned wake_timeout, wake_brightness, dimmed_brightness, clock_brightness;
  std::array<char, 7> clock_color{};
};

inline std::optional<ScreenSchedulePreferences> parse_screen_schedule_preferences(std::string_view value) {
  const auto saved = panel_settings::read_screen_schedule_preferences(value);
  if (!saved) return {};
  const auto mode = saved->night_mode == "dim" ? ScheduledNightMode::DIMMED :
      saved->night_mode == "clock" ? ScheduledNightMode::CLOCK :
      saved->night_mode == "always" ? ScheduledNightMode::ALWAYS_ON : ScheduledNightMode::OFF;
  ScreenSchedulePreferences result{saved->enabled == "1", unsigned(saved->on_hour),
      unsigned(saved->off_hour), mode, unsigned(saved->wake_timeout), unsigned(saved->wake_brightness),
      unsigned(saved->dimmed_brightness), unsigned(saved->clock_brightness)};
  saved->clock_color.copy(result.clock_color.data(), result.clock_color.size() - 1);
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
