#pragma once

// Home Assistant entity rules shared by the on-device control bridge and the
// saved-card retirement classifier. This header deliberately avoids LVGL so
// host-side classifier tests can include it without a display build.

#include <cmath>
#include <cstdlib>
#include <string>

namespace espdesktop::ha_controls {

inline std::string domain_of(const std::string &entity_id) {
  const auto dot = entity_id.find('.');
  return dot == std::string::npos ? std::string{} : entity_id.substr(0, dot);
}

inline bool is_button_entity(const std::string &entity_id) {
  const auto domain = domain_of(entity_id);
  return domain == "button" || domain == "input_button";
}

inline bool state_is_on(const std::string &entity_id, const std::string &value) {
  if (value.empty() || value == "unavailable" || value == "unknown" ||
      value == "off" || value == "standby" || value == "idle") return false;
  if (domain_of(entity_id) == "media_player")
    return value == "on" || value == "playing" || value == "paused" ||
        value == "buffering";
  return value == "on";
}

inline bool toggle_control_valid(const std::string &entity_id) {
  const auto domain = domain_of(entity_id);
  return domain == "light" || domain == "switch" || domain == "fan" ||
      domain == "media_player" || domain == "input_boolean" ||
      domain == "button" || domain == "input_button";
}

inline bool slider_control_valid(const std::string &entity_id) {
  const auto domain = domain_of(entity_id);
  return domain == "light" || domain == "media_player" || domain == "fan" ||
      domain == "number" || domain == "input_number";
}

inline std::string slider_attribute(const std::string &entity_id) {
  const auto domain = domain_of(entity_id);
  if (domain == "light") return "brightness";
  if (domain == "media_player") return "volume_level";
  if (domain == "fan") return "percentage";
  return {};
}

inline bool parse_number(const std::string &value, double &result) {
  if (value.empty()) return false;
  char *end = nullptr;
  result = std::strtod(value.c_str(), &end);
  return end != value.c_str() && *end == '\0' && std::isfinite(result);
}

}  // namespace espdesktop::ha_controls
