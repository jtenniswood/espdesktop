#pragma once

#include <mdns.h>
#include <cstdint>
#include <string>

namespace esphome::companion {

// Keep this public advertisement independent of pairing state and credentials.
inline esp_err_t register_discovery(uint16_t port, const std::string &name, const std::string &fingerprint) {
  mdns_txt_item_t records[] = {
    {"v", "1"}, {"name", name.c_str()}, {"id", fingerprint.c_str()},
  };
  return mdns_service_add(nullptr, "_espdesktop", "_tcp", port, records, 3);
}

}  // namespace esphome::companion
