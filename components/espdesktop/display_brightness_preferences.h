#pragma once

#include <string>
#include "panel_settings_generated.h"

namespace espdesktop {

inline constexpr auto DISPLAY_BRIGHTNESS_PREFERENCES_KEY = panel_settings::display_brightness_preferences_key;

struct DisplayBrightnessPreferences {
  bool manual{false};
  bool use_sun{true};
  // Hundredths of a percent preserve the level of the light when switching to manual.
  unsigned manual_level{10000};
  unsigned daytime{100}, nighttime{75};
  unsigned dawn_minute{360}, dusk_minute{1080};

  float manual_percent() const { return manual_level / 100.0f; }
  const char *automatic_mode() const { return use_sun ? "Sunrise and sunset" : "Fixed times"; }
  const char *mode() const { return manual ? "Manual" : automatic_mode(); }
};

inline std::optional<DisplayBrightnessPreferences> parse_display_brightness_preferences(std::string_view value) {
  const auto saved = panel_settings::read_display_brightness_preferences(value);
  if (!saved) return {};
  return DisplayBrightnessPreferences{saved->manual == "1", saved->use_sun == "1",
      unsigned(saved->manual_level), unsigned(saved->daytime), unsigned(saved->nighttime),
      unsigned(saved->dawn_minute), unsigned(saved->dusk_minute)};
}

inline std::string encode_display_brightness_preferences(const DisplayBrightnessPreferences &settings) {
  return std::to_string(panel_settings::display_brightness_preferences_version) +
      (settings.manual ? ",1," : ",0,") + (settings.use_sun ? "1," : "0,") +
      std::to_string(settings.manual_level) + "," + std::to_string(settings.daytime) + "," +
      std::to_string(settings.nighttime) + "," + std::to_string(settings.dawn_minute) + "," +
      std::to_string(settings.dusk_minute);
}

}  // namespace espdesktop
