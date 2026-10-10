#pragma once

#include <string>
#include "esphome/core/defines.h"
#ifdef USE_WIFI
#include "esphome/components/wifi/wifi_component.h"
#endif

inline std::string wifi_setup_address() {
#if defined(USE_WIFI) && defined(USE_WIFI_AP)
  auto *wifi = esphome::wifi::global_wifi_component;
  if (wifi != nullptr) {
    char address[esphome::network::IP_ADDRESS_BUFFER_SIZE];
    const auto live = wifi->wifi_soft_ap_ip();
    if (live.is_set()) return live.str_to(address);
#ifdef USE_WIFI_MANUAL_IP
    const auto ap = wifi->get_ap();
    const auto &manual = ap.get_manual_ip();
    if (manual.has_value() && manual->static_ip.is_set()) return manual->static_ip.str_to(address);
#endif
  }
#endif
  return "192.168.4.1";
}

inline std::string wifi_setup_browser_instruction(std::string translated,
                                                  const std::string &address) {
  const std::string marker = "{address}";
  const auto position = translated.find(marker);
  if (position != std::string::npos) translated.replace(position, marker.size(), address);
  return translated;
}
