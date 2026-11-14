#pragma once

#include <array>
#include <string>
#include "panel_settings_generated.h"

namespace espdesktop {

inline constexpr std::string_view SCREEN_SCHEDULE_PREFERENCES_KEY = panel_settings::screen_schedule_preferences_key;

enum class ScheduledNightMode { OFF, DIMMED, ALWAYS_ON, CLOCK };

struct ScreenSchedulePreferences {
  bool enabled{false};
  unsigned on_hour{7}, off_hour{19};
  ScheduledNightMode night_mode{ScheduledNightMode::DIMMED};
  unsigned wake_timeout{60}, wake_brightness{10}, dimmed_brightness{15}, clock_brightness{10};
  std::array<char, 7> clock_color{'F', 'F', 'F', 'F', 'F', 'F', '\0'};
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

inline ScheduledNightMode scheduled_night_mode_from_option(std::string_view mode) {
  if (mode == "Screen Dimmed") return ScheduledNightMode::DIMMED;
  if (mode == "Always On") return ScheduledNightMode::ALWAYS_ON;
  if (mode == "Clock") return ScheduledNightMode::CLOCK;
  return ScheduledNightMode::OFF;
}

inline std::string encode_screen_schedule_preferences(const ScreenSchedulePreferences &settings) {
  const char *mode = settings.night_mode == ScheduledNightMode::DIMMED ? "dim" :
      settings.night_mode == ScheduledNightMode::CLOCK ? "clock" :
      settings.night_mode == ScheduledNightMode::ALWAYS_ON ? "always" : "off";
  return std::to_string(panel_settings::screen_schedule_preferences_version) +
      (settings.enabled ? ",1," : ",0,") + std::to_string(settings.on_hour) + "," +
      std::to_string(settings.off_hour) + "," + mode + "," + std::to_string(settings.wake_timeout) +
      "," + std::to_string(settings.wake_brightness) + "," + std::to_string(settings.dimmed_brightness) +
      "," + std::to_string(settings.clock_brightness) + "," +
      std::string(settings.clock_color.data(), settings.clock_color.size() - 1);
}

}  // namespace espdesktop
