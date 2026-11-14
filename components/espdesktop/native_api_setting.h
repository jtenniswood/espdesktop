#pragma once

#ifdef USE_ESPDESKTOP_NATIVE_CARD_BUTTONS
#include <atomic>
#include <nvs.h>
#include "esphome/components/api/api_server.h"

namespace espdesktop::home_assistant {

inline std::atomic<bool> native_api_enabled{false};
inline std::atomic<bool> native_api_configured{false};

inline void configure_native_api_at_boot() {
  nvs_handle_t handle;
  uint8_t value = 0;
  if (nvs_open("espdesktop_ha", NVS_READONLY, &handle) == ESP_OK) {
    if (nvs_get_u8(handle, "enabled", &value) != ESP_OK) value = 0;
    nvs_close(handle);
  }
  native_api_enabled.store(value == 1);
  native_api_configured.store(value == 1);
  if (value == 1) return;

  // Run before AFTER_WIFI: skip the server's setup and its native mDNS
  // advertisement. The API object remains owned by ESPHome for this boot.
  if (auto *server = esphome::api::global_api_server) server->disable_loop();
  esphome::api::global_api_server = nullptr;
}

inline bool save_native_api_setting(bool enabled) {
  nvs_handle_t handle;
  if (nvs_open("espdesktop_ha", NVS_READWRITE, &handle) != ESP_OK) return false;
  const bool saved = nvs_set_u8(handle, "enabled", enabled ? 1 : 0) == ESP_OK &&
      nvs_commit(handle) == ESP_OK;
  nvs_close(handle);
  if (saved) {
    native_api_configured.store(enabled);
    if (!enabled) native_api_enabled.store(false);
  }
  return saved;
}

}  // namespace espdesktop::home_assistant
#endif
