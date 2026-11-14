#pragma once

#include <functional>
#include "esphome/core/preferences.h"
#include <esp_https_server.h>
#include <array>
#include <mutex>
#include <string>

namespace esphome::companion {
class HomeAssistantApi {
 public:
  using Defer = std::function<void(std::function<void()>)>;
  bool start(Defer defer, httpd_handle_t server, const std::string &fingerprint);
 private:
  static esp_err_t handle(httpd_req_t *request);
  esp_err_t request(httpd_req_t *request);
  bool setup(bool disconnect);
  std::string token() const;
  using Credential = std::array<unsigned char, 32>;
  Defer defer_;
  ESPPreferenceObject preferences_;
  Credential credential_{};
  Credential pairing_{};
  uint32_t expires_{0};
  unsigned attempts_{0};
  std::string fingerprint_;
  mutable std::mutex mutex_;
};
}  // namespace esphome::companion
