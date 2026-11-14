#pragma once
#include <string>
#include "button_grid_contract_generated.h"

// Saved card identifiers are retained for backup/layout compatibility. Only
// local controls reach a live driver. Folders and QR cards retain their local
// navigation/credentials; their former HA decorations are removed separately.
template<typename Config>
inline bool retired_home_assistant_card(const Config &config) {
  const auto &type = config.type;
  if (type.empty() && config.entity.empty() && config.label.empty() && config.sensor.empty()) return false;
  if (type == "local" || type == "local_sensor" || type == "internal" ||
      type == "calendar" || type == "clock" || type == "timezone" || type == "screen_lock" ||
      type == "screensaver" || type == "wifi_qr" || type == "wifi_qr_card") return false;
  if (type == "action" || type == "sensor") return config.sensor != "local";
  if (type == "slider") {
    return config.entity != "media.output_volume" && config.entity != "media.input_volume" &&
           config.entity != "media.output_mute" && config.entity != "media.input_mute";
  }
  return !card_contract_type_stable(type);
}
