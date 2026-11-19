#pragma once
#include "esphome/core/defines.h"

#ifdef USE_COMPANION_USB
#include <esp_http_server.h>
#include <atomic>
#include <cstddef>
#include <cstdint>

namespace esphome::companion {

// One HTTP stream, carried inside the paired USB WebSocket. The existing
// local web server still owns configuration validation, auth and persistence.
class CompanionUSBEditor {
 public:
  bool handle(httpd_handle_t server, int companion_socket, const uint8_t *frame, size_t size);
  void disconnect(int companion_socket);
#ifdef USE_WIFI
  static void restore_wifi_on_boot();
#endif
  void update_wifi();

 private:
  void close_();

  int editor_socket_{-1};
  int owner_{-1};
#ifdef USE_WIFI
  enum class WifiSaveState { idle, disable_pending, enable_pending, disabled, enabled, failed };
  std::atomic<WifiSaveState> wifi_save_state_{WifiSaveState::idle};
  std::atomic<bool> wifi_enabled_{true};
#endif
};

}  // namespace esphome::companion
#endif
