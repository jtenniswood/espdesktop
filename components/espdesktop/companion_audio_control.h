#pragma once

#include <cstddef>
#include <string_view>

inline bool companion_obs_audio_uuid(std::string_view id, std::string_view prefix) {
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

inline bool companion_obs_level_control(std::string_view id) {
  return companion_obs_audio_uuid(id, "obs.level.");
}

inline bool companion_obs_meter_control(std::string_view id) {
  // Keep development-build meter bindings out of Home Assistant slider routing.
  return companion_obs_audio_uuid(id, "obs.meter.");
}

inline bool companion_obs_cough_control(std::string_view id) {
  return companion_obs_audio_uuid(id, "obs.cough.");
}

inline bool companion_writable_audio_control_id(std::string_view id) {
  return id == "media.output_volume" || id == "media.input_volume" ||
    id == "media.output_mute" || id == "media.input_mute" || companion_obs_level_control(id);
}

inline bool companion_audio_control_id(std::string_view id) {
  return companion_writable_audio_control_id(id) || companion_obs_meter_control(id);
}
