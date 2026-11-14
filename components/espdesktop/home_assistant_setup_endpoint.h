#pragma once

#include "home_assistant_cards.h"
#include "reset_policy.h"
#include "native_api_setting.h"

#ifdef USE_WEBSERVER
namespace espdesktop::home_assistant {
class SetupEndpoint final : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->url_to(path) == "/api/v1/home-assistant";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    if (!companion_authorize_web_request(request)) return;
    httpd_req_t *raw = *request;
#ifdef USE_ESPDESKTOP_NATIVE_CARD_BUTTONS
    if (hooks().fingerprint.empty()) {
      httpd_resp_send_err(raw, HTTPD_404_NOT_FOUND, "Home Assistant is unavailable");
      return;
    }
    if (request->method() == HTTP_POST) {
      const auto operation = request->get_header("X-EspDesktop-Request").value_or("");
      if ((operation != "enable-esphome" && operation != "disable-esphome") ||
          !reset::same_origin(request->get_header("Origin").value_or(""),
              request->get_header("Host").value_or(""),
              request->get_header("Sec-Fetch-Site").value_or(""), "reset")) {
        httpd_resp_send_err(raw, HTTPD_403_FORBIDDEN, "Same-origin request required");
        return;
      }
      const bool enabled = operation == "enable-esphome";
      if (enabled != native_api_configured.load()) {
        if (!save_native_api_setting(enabled)) {
          httpd_resp_send_err(raw, HTTPD_500_INTERNAL_SERVER_ERROR, "Could not save the ESPHome API setting");
          return;
        }
        esphome::App.scheduler.set_timeout(nullptr, "espdesktop-esphome-api", 750,
            [] { esphome::App.safe_reboot(); });
      }
    } else if (request->method() != HTTP_GET) {
      httpd_resp_set_status(raw, "405 Method Not Allowed");
      httpd_resp_send(raw, nullptr, 0);
      return;
    }
    const auto body = std::string("{\"id\":\"") + hooks().fingerprint +
        "\",\"enabled\":" + (native_api_configured.load() ? "true}" : "false}");
#else
    if (!hooks().setup || !hooks().paired) {
      httpd_resp_send_err(raw, HTTPD_404_NOT_FOUND, "Home Assistant is unavailable");
      return;
    }
    if (request->method() == HTTP_POST) {
      const auto operation = request->get_header("X-EspDesktop-Request").value_or("");
      if ((operation != "pair" && operation != "disconnect") ||
          !reset::same_origin(request->get_header("Origin").value_or(""),
              request->get_header("Host").value_or(""),
              request->get_header("Sec-Fetch-Site").value_or(""),
              "reset")) {
        httpd_resp_send_err(raw, HTTPD_403_FORBIDDEN, "Same-origin setup request required");
        return;
      }
      if (!hooks().setup(operation == "disconnect")) {
        httpd_resp_send_err(raw, HTTPD_500_INTERNAL_SERVER_ERROR, "Home Assistant setup unavailable");
        return;
      }
    } else if (request->method() != HTTP_GET) {
      httpd_resp_set_status(raw, "405 Method Not Allowed");
      httpd_resp_send(raw, nullptr, 0);
      return;
    }
    const auto body = std::string("{\"id\":\"") + hooks().fingerprint +
        "\",\"paired\":" + (hooks().paired() ? "true}" : "false}");
#endif
    httpd_resp_set_type(raw, "application/json");
    httpd_resp_set_hdr(raw, "Cache-Control", "no-store");
    httpd_resp_send(raw, body.c_str(), body.size());
  }
};

inline void register_setup_endpoint(esphome::web_server_idf::AsyncWebServer &server) {
  static bool registered = false;
  if (!registered) {
    server.addHandler(new SetupEndpoint());
    registered = true;
  }
}
}  // namespace espdesktop::home_assistant
#endif
