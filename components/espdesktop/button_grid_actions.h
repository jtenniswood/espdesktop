#pragma once

using WebhookHeaders = std::vector<esphome::http_request::Header>;
using WebhookSender = std::function<bool(const std::string &, const std::string &,
                                         const std::string &, const WebhookHeaders &)>;

inline WebhookSender &webhook_sender() {
  static WebhookSender sender;
  return sender;
}

inline void register_webhook_sender(WebhookSender sender) {
  webhook_sender() = sender;
}

inline std::string trim_webhook_text(const std::string &value) {
  size_t start = 0;
  while (start < value.size() &&
         std::isspace(static_cast<unsigned char>(value[start]))) {
    start++;
  }
  size_t end = value.size();
  while (end > start &&
         std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    end--;
  }
  return value.substr(start, end - start);
}

inline bool webhook_header_name_valid(const std::string &name) {
  if (name.empty() || name.size() > 64) return false;
  for (char ch : name) {
    unsigned char c = static_cast<unsigned char>(ch);
    if (c <= 32 || c >= 127 || ch == ':') return false;
  }
  return true;
}

inline void webhook_add_header(WebhookHeaders &headers,
                               const std::string &name,
                               const std::string &value) {
  std::string trimmed_name = trim_webhook_text(name);
  std::string trimmed_value = trim_webhook_text(value);
  if (!webhook_header_name_valid(trimmed_name) || trimmed_value.size() > 256) return;
  esphome::http_request::Header header;
  header.name = trimmed_name;
  header.value = trimmed_value;
  headers.push_back(header);
}

inline bool webhook_has_header(const WebhookHeaders &headers, const char *name) {
  if (!name) return false;
  std::string wanted = name;
  for (char &ch : wanted) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  for (const auto &header : headers) {
    std::string actual = header.name;
    for (char &ch : actual) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    if (actual == wanted) return true;
  }
  return false;
}

inline bool webhook_body_looks_json(const std::string &body) {
  for (char ch : body) {
    if (std::isspace(static_cast<unsigned char>(ch))) continue;
    return ch == '{' || ch == '[';
  }
  return false;
}

inline WebhookHeaders parse_webhook_headers(const std::string &value,
                                            const std::string &body) {
  WebhookHeaders headers;
  size_t start = 0;
  while (start <= value.size() && headers.size() < 8) {
    size_t end = value.find(';', start);
    if (end == std::string::npos) end = value.size();
    std::string part = trim_webhook_text(value.substr(start, end - start));
    size_t colon = part.find(':');
    if (colon != std::string::npos) {
      webhook_add_header(headers, part.substr(0, colon), part.substr(colon + 1));
    }
    start = end + 1;
  }
  if (!body.empty() && !webhook_has_header(headers, "Content-Type")) {
    webhook_add_header(headers, "Content-Type",
                       webhook_body_looks_json(body) ? "application/json" : "text/plain");
  }
  return headers;
}

inline void send_webhook_action(const ParsedCfg &p) {
  std::string url = trim_webhook_text(p.entity);
  if (url.empty()) {
    ESP_LOGW("webhook", "Webhook card has no URL");
    return;
  }
  std::string method = normalize_webhook_method(p.sensor);
  std::string body = (method == "GET" || method == "DELETE") ? "" : p.unit;
  WebhookHeaders headers = parse_webhook_headers(cfg_option_value(p.options, "webhook_headers"), body);
  WebhookSender &sender = webhook_sender();
  if (!sender) {
    ESP_LOGW("webhook", "Webhook sender is not registered");
    return;
  }
  ESP_LOGI("webhook", "Calling webhook with method %s", method.c_str());
  sender(url, method, body, headers);
}

namespace espdesktop::cards {
inline bool basic_action_driver_handle_main_click(const Context &, const ParsedCfg &, int, lv_obj_t *);
inline bool navigation_driver_handle_main_click(const Context &, const ParsedCfg &, lv_obj_t *);
}
inline void handle_button_click(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj) {
  (void) btn_obj;
  ParsedCfg p = parse_cfg(cfg);
  const auto context = card_runtime_context(p);
  ESP_LOGI("button", "Main button %d clicked: type=%s entity=%s mode=%s label=%s",
           slot_num, p.type.c_str(), p.entity.c_str(), p.sensor.c_str(), p.label.c_str());
  if (card_runtime_passive(context)) return;
  if (espdesktop::cards::basic_action_driver_handle_main_click(
        context, p, slot_num, btn_obj)) return;
  if (espdesktop::cards::navigation_driver_handle_main_click(
        context, p, btn_obj)) return;
  ESP_LOGE("card_runtime", "Card has no main-grid action driver: type=%s",
           p.type.c_str());
}
