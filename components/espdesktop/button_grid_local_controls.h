#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

inline void set_wrapped_button_label_text(lv_obj_t *label, const std::string &text);

// ── Local action controls ─────────────────────────────────────────────
//
// Devices register named one-shot callbacks here at boot. The button type
// "local" dispatches to these by key, so device-specific addons (e.g. BLE
// keyboard) can be triggered from the grid without going through HA.

struct LocalActionControl {
  std::string key;
  std::string label;
  std::function<void()> action;
};

inline std::vector<LocalActionControl> &local_action_registry() {
  static std::vector<LocalActionControl> actions;
  return actions;
}

inline void register_local_action(
    const std::string &key, const std::string &label,
    std::function<void()> action) {
  if (key.empty()) return;
  LocalActionControl a;
  a.key = key;
  a.label = label;
  a.action = action;
  auto &reg = local_action_registry();
  for (auto &existing : reg) {
    if (existing.key == key) {
      existing = a;
      return;
    }
  }
  reg.push_back(a);
}

inline void send_local_action(const std::string &key) {
  for (auto &a : local_action_registry()) {
    if (a.key == key) {
      if (a.action) a.action();
      return;
    }
  }
  ESP_LOGW("espdesktop", "Local action '%s' not registered", key.c_str());
}

#ifdef USE_WEBSERVER
inline std::string local_endpoint_json_escape(const std::string &s) {
  std::string out;
  out.reserve(s.size() + 4);
  for (char c : s) {
    if (c == '"') out += "\\\"";
    else if (c == '\\') out += "\\\\";
    else out += c;
  }
  return out;
}

class LocalActionHandler : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_GET) return false;
    char url_buf[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    esphome::StringRef url = request->url_to(url_buf);
    return strncmp(url.c_str(), "/local_actions", 14) == 0;
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    std::string json;
    json.reserve(256);
    json = "[";
    bool first = true;
    for (auto &a : local_action_registry()) {
      if (!first) json += ",";
      first = false;
      json += "{\"key\":\"" + local_endpoint_json_escape(a.key) +
              "\",\"label\":\"" + local_endpoint_json_escape(a.label) + "\"}";
    }
    json += "]";
    httpd_req_t *req = *request;
    httpd_resp_set_status(req, "200 OK");
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_send(req, json.c_str(), HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) ESP_LOGE("espdesktop", "httpd_resp_send failed: %d", err);
  }
};

inline void register_local_action_endpoint(
    esphome::web_server_idf::AsyncWebServer &server) {
  static bool registered = false;
  if (registered) return;
  server.addHandler(new LocalActionHandler());
  registered = true;
  ESP_LOGI("espdesktop", "Local action endpoint registered");
}

inline void register_local_action_endpoint() {
  auto *server = esphome::web_server_idf::global_async_web_server();
  if (server == nullptr) {
    ESP_LOGW("espdesktop", "register_local_action_endpoint: server not ready");
    return;
  }
  register_local_action_endpoint(*server);
}

#endif  // USE_WEBSERVER
