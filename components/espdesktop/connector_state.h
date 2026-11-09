#pragma once

#include <cstdint>
#include <string>

#ifdef USE_WEBSERVER
#include "esphome/components/web_server_idf/web_server_idf.h"
#include <esp_http_server.h>
#endif
#include "companion_controls.h"

namespace espdesktop::connectors {

struct ConnectorStatus {
  bool onboarding_complete{true};
  bool companion_available{false};
  bool companion_paired{false};
  bool companion_connected{false};
};

class ConnectorStateService {
 public:
  void setup(const char *web_auth_username, const char *web_auth_password) {
    web_auth_username_ = web_auth_username == nullptr ? "" : web_auth_username;
    web_auth_password_ = web_auth_password == nullptr ? "" : web_auth_password;
  }
  const char *web_auth_username() const { return web_auth_username_; }
  const char *web_auth_password() const { return web_auth_password_; }
  ConnectorStatus status() const {
    const CompanionPairingSnapshot companion = companion_pairing_provider()
        ? companion_pairing_provider()() : CompanionPairingSnapshot{};
    return {true, companion.available, companion.paired, companion.connected};
  }
 private:
  const char *web_auth_username_{""};
  const char *web_auth_password_{""};
};

inline ConnectorStateService &connector_state_service() {
  static ConnectorStateService service;
  return service;
}

inline bool onboarding_complete() {
  return connector_state_service().status().onboarding_complete;
}

#ifdef USE_WEBSERVER
inline std::string connector_status_json(const ConnectorStatus &status) {
  auto boolean = [](bool value) { return value ? "true" : "false"; };
  return std::string("{\"onboarding_complete\":") +
      boolean(status.onboarding_complete) +
      ",\"mac_companion\":{\"available\":" +
      boolean(status.companion_available) +
      ",\"configured\":" + boolean(status.companion_paired) +
      ",\"paired\":" + boolean(status.companion_paired) +
      ",\"connected\":" + boolean(status.companion_connected) + "}}";
}

class ConnectorStatusHandler : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(
      esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_GET) {
      return false;
    }
    char url_buf[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    const auto url = request->url_to(url_buf);
    return url == "/connectors/status";
  }

  void handleRequest(
      esphome::web_server_idf::AsyncWebServerRequest *request) override {
#ifdef USE_WEBSERVER_AUTH
    const ConnectorStateService &service = connector_state_service();
    if (!request->authenticate(service.web_auth_username(),
                               service.web_auth_password())) {
      request->requestAuthentication();
      return;
    }
#endif
    const std::string json = connector_status_json(
        connector_state_service().status());
    httpd_req_t *req = *request;
    httpd_resp_set_status(req, "200 OK");
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_send(req, json.c_str(), HTTPD_RESP_USE_STRLEN);
  }
};

inline void register_connector_status_endpoint(
    esphome::web_server_idf::AsyncWebServer &server) {
  static bool registered = false;
  if (registered) return;
  server.addHandler(new ConnectorStatusHandler());
  registered = true;
}
#else
inline void register_connector_status_endpoint(...) {}
#endif

}  // namespace espdesktop::connectors
