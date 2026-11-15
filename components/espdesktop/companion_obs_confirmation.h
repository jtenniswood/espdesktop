#pragma once

#include <string_view>

inline bool companion_obs_output_card(std::string_view id) {
  return id == "obs.output.stream" || id == "obs.output.record";
}

inline bool companion_obs_confirmable_toggle(std::string_view id) {
  return id == "obs.studio" || id == "obs.replay.buffer";
}

inline bool companion_obs_confirmation_supported(std::string_view id) {
  return companion_obs_output_card(id) || companion_obs_confirmable_toggle(id);
}

inline bool companion_obs_needs_confirmation(std::string_view id, std::string_view mode,
                                             std::string_view label) {
  const bool toggle = companion_obs_confirmable_toggle(id);
  if (mode == "none") return false;
  if (mode == "on") return toggle ? label != "On" : label.rfind("Stop ", 0) != 0;
  if (mode == "off" || (toggle && mode != "both")) {
    return toggle ? label != "Off" : label.rfind("Start ", 0) != 0;
  }
  return true;
}
