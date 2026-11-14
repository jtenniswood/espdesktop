#pragma once

#include <memory>
#include <new>
#include <string>
#include <utility>
#include <vector>

#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esphome/components/http_request/http_request.h"
#include "esphome/core/log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

namespace espdesktop {

struct WebhookRequest {
  std::string url, method, body;
  std::vector<esphome::http_request::Header> headers;
};

inline esp_http_client_method_t webhook_http_method(const std::string &method) {
  if (method == "POST") return HTTP_METHOD_POST;
  if (method == "PUT") return HTTP_METHOD_PUT;
  if (method == "PATCH") return HTTP_METHOD_PATCH;
  if (method == "DELETE") return HTTP_METHOD_DELETE;
  return HTTP_METHOD_GET;
}

inline void perform_webhook_request(const WebhookRequest &request) {
  esp_http_client_config_t config{};
  config.url = request.url.c_str();
  config.method = webhook_http_method(request.method);
  config.timeout_ms = 10000;
  config.max_redirection_count = 3;
  config.auth_type = HTTP_AUTH_TYPE_BASIC;
  config.crt_bundle_attach = esp_crt_bundle_attach;
  auto client = esp_http_client_init(&config);
  if (!client) {
    ESP_LOGW("webhook", "Webhook %s request failed to start", request.method.c_str());
    return;
  }
  for (const auto &header : request.headers)
    esp_http_client_set_header(client, header.name.c_str(), header.value.c_str());
  if (!request.body.empty())
    esp_http_client_set_post_field(client, request.body.data(), request.body.size());
  const auto result = esp_http_client_perform(client);
  const int status = esp_http_client_get_status_code(client);
  esp_http_client_cleanup(client);
  if (result != ESP_OK) {
    ESP_LOGW("webhook", "Webhook %s request failed (%s)", request.method.c_str(), esp_err_to_name(result));
  } else if (!esphome::http_request::is_success(status)) {
    ESP_LOGW("webhook", "Webhook %s returned HTTP %d", request.method.c_str(), status);
  } else {
    ESP_LOGI("webhook", "Webhook %s returned HTTP %d", request.method.c_str(), status);
  }
}

inline void run_webhook_requests(void *argument) {
  const auto queue = static_cast<QueueHandle_t>(argument);
  for (;;) {
    WebhookRequest *pending = nullptr;
    if (xQueueReceive(queue, &pending, portMAX_DELAY) != pdTRUE) continue;
    std::unique_ptr<WebhookRequest> request(pending);
    perform_webhook_request(*request);
  }
}

// Called from the display event loop. Instances of the HTTP client belong to the
// worker so slow endpoints never hold the UI or share ESPHome component state.
inline bool enqueue_webhook_request(std::string url, std::string method, std::string body,
                                    std::vector<esphome::http_request::Header> headers) {
  static QueueHandle_t queue = nullptr;
  if (!queue) {
    queue = xQueueCreate(4, sizeof(WebhookRequest *));
    if (!queue) return false;
    if (xTaskCreate(run_webhook_requests, "webhook", 8192, queue, tskIDLE_PRIORITY + 1, nullptr) != pdPASS) {
      vQueueDelete(queue);
      queue = nullptr;
      return false;
    }
  }
  auto *request = new (std::nothrow) WebhookRequest{
      std::move(url), std::move(method), std::move(body), std::move(headers)};
  if (!request) return false;
  if (xQueueSend(queue, &request, 0) == pdTRUE) return true;
  delete request;
  return false;
}

}  // namespace espdesktop
