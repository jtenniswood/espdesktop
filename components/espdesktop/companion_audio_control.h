#pragma once

#include <cstddef>
#include <string_view>

inline bool companion_obs_level_control(std::string_view id) {
  constexpr std::string_view prefix = "obs.level.";
  if (id.substr(0, prefix.size()) != prefix || id.size() != prefix.size() + 36) return false;
  const auto uuid = id.substr(prefix.size());
  for (std::size_t index = 0; index < uuid.size(); ++index) {
    const char ch = uuid[index];
    if (index == 8 || index == 13 || index == 18 || index == 23) {
      if (ch != '-') return false;
    } else if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) {
      return false;
    }
  }
  return true;
}

inline bool companion_audio_control_id(std::string_view id) {
  return id == "media.output_volume" || id == "media.input_volume" ||
    id == "media.output_mute" || id == "media.input_mute" || companion_obs_level_control(id);
}

// Keep this aligned with OBSConnection.faderDecibels. The scale reserves 80
// for unity gain and 0 for digital silence.
inline float companion_obs_fader_decibels(int value) {
  return value <= 80 ? static_cast<float>(value - 80) * 1.25f
                     : static_cast<float>(value - 80) * 1.3f;
}
