#pragma once
#ifdef USE_WEBSERVER
#include <esp_heap_caps.h>
#include <esp_system.h>
#include "esphome/core/application.h"
#include "esphome/core/helpers.h"
#include "esphome/core/version.h"
#include "esphome/components/json/json_util.h"
#include "esphome/components/web_server_idf/web_server_idf.h"
#include "panel_identity.h"
#include "grid_navigation_diagnostics.h"

namespace espdesktop {
// Read-only health information. No entity values, credentials or saved layout.
class PanelDiagnosticsHandler final : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->method() == HTTP_GET && request->url_to(path) == "/api/v1/diagnostics";
  }
  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    httpd_req_t *raw = *request;
    if (panel_identity == nullptr || !panel_identity->ready()) {
      httpd_resp_set_status(raw, "503 Service Unavailable");
      httpd_resp_send(raw, "Panel identity is unavailable", HTTPD_RESP_USE_STRLEN);
      return;
    }
#ifdef USE_WEBSERVER_AUTH
    if (!request->authenticate(panel_identity->username(), panel_identity->password())) {
      request->requestAuthentication();
      return;
    }
#endif
    const std::string response = esphome::json::build_json([](JsonObject root) {
      static const uint32_t boot_id = esphome::random_uint32();
      root["version"] = 1;
      root["hostname"] = esphome::App.get_name().c_str();
      root["mac_suffix"] = panel_identity->suffix();
      root["boot_id"] = boot_id;
      root["uptime_ms"] = esphome::millis_64();
      root["reset_reason"] = static_cast<unsigned>(esp_reset_reason());
      JsonObject firmware = root["firmware"].to<JsonObject>();
      firmware["esphome_version"] = ESPHOME_VERSION;
      char build[esphome::Application::BUILD_TIME_STR_SIZE];
      esphome::App.get_build_time_string(build);
      firmware["compilation_time"] = build;
#ifdef ESPHOME_PROJECT_VERSION
      firmware["project_version"] = ESPHOME_PROJECT_VERSION;
#endif
#ifdef ESPDESKTOP_DEVICE_SLUG
      firmware["model"] = ESPDESKTOP_DEVICE_SLUG;
#endif
      const auto &navigation = grid_navigation_diagnostics();
      JsonObject ui = root["navigation"].to<JsonObject>();
      ui["pages_built"] = navigation.pages_built.load(std::memory_order_relaxed);
      ui["pages_evicted"] = navigation.pages_evicted.load(std::memory_order_relaxed);
      ui["page_build_ms"] = navigation.page_build_ms.load(std::memory_order_relaxed);
      ui["page_open_frame_ms"] = navigation.page_open_frame_ms.load(std::memory_order_relaxed);
      ui["back_frame_ms"] = navigation.back_frame_ms.load(std::memory_order_relaxed);
      JsonObject memory = root["memory"].to<JsonObject>();
      const uint32_t internal = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
      const uint32_t external = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
      const size_t heap_total = heap_caps_get_total_size(internal);
      const size_t psram_total = heap_caps_get_total_size(external);
      if (heap_total > 0) memory["heap_free_percent"] = 100.0 * heap_caps_get_free_size(internal) / heap_total;
      if (psram_total > 0) memory["psram_free_percent"] = 100.0 * heap_caps_get_free_size(external) / psram_total;
      memory["heap_largest_bytes"] = heap_caps_get_largest_free_block(internal);
      memory["psram_largest_bytes"] = heap_caps_get_largest_free_block(external);
    });
    httpd_resp_set_type(raw, "application/json");
    httpd_resp_set_hdr(raw, "Cache-Control", "no-store");
    httpd_resp_send(raw, response.data(), response.size());
  }
};
inline void register_panel_diagnostics_endpoint(esphome::web_server_idf::AsyncWebServer &server) {
  static bool registered = false;
  if (!registered) { server.addHandler(new PanelDiagnosticsHandler()); registered = true; }
}
}  // namespace espdesktop
#endif
