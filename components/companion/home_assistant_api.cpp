#include "home_assistant_api.h"
#include "../espdesktop/home_assistant_cards.h"
#include "../espdesktop/device_reset.h"
#include "esphome/core/application.h"
#include "esphome/core/hal.h"

#include <esp_random.h>
#include <algorithm>
#include <cstring>
#include <condition_variable>
#include <memory>

namespace esphome::companion {
namespace {
using espdesktop::home_assistant::hooks;

std::string encode(const unsigned char *bytes, size_t count) {
  constexpr char alphabet[] = "0123456789abcdef";
  std::string result;
  result.reserve(count * 2);
  for (size_t i = 0; i < count; ++i) {
    result += alphabet[bytes[i] >> 4];
    result += alphabet[bytes[i] & 15];
  }
  return result;
}

bool equal(const std::string &supplied, const std::string &expected) {
  if (supplied.size() != expected.size()) return false;
  unsigned char difference = 0;
  for (size_t i = 0; i < supplied.size(); ++i) difference |= supplied[i] ^ expected[i];
  return !difference;
}

std::string header(httpd_req_t *request, const char *key) {
  char value[96]{};
  if (httpd_req_get_hdr_value_str(request, key, value, sizeof(value)) != ESP_OK) return {};
  return value;
}

esp_err_t respond(httpd_req_t *request, const char *status, const std::string &body) {
  httpd_resp_set_status(request, status);
  httpd_resp_set_type(request, "application/json");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  httpd_resp_set_hdr(request, "Connection", "close");
  return httpd_resp_send(request, body.data(), body.size());
}

struct MainRequest {
  std::mutex mutex;
  std::condition_variable changed;
  std::string response;
  bool complete{false};
  bool cancelled{false};
};
}  // namespace

bool HomeAssistantApi::start(Component &owner, httpd_handle_t server, const std::string &fingerprint) {
  owner_ = &owner;
  fingerprint_ = fingerprint;
  preferences_ = global_preferences->make_preference<Credential>(0x483a921bu);
  preferences_.load(&credential_);
  const httpd_uri_t routes[] = {
    {.uri = "/home-assistant/v1", .method = HTTP_GET, .handler = handle, .user_ctx = this},
    {.uri = "/home-assistant/v1/pair", .method = HTTP_POST, .handler = handle, .user_ctx = this},
    {.uri = "/home-assistant/v1/press", .method = HTTP_POST, .handler = handle, .user_ctx = this},
  };
  for (const auto &route : routes)
    if (httpd_register_uri_handler(server, &route) != ESP_OK) return false;
  hooks().fingerprint = fingerprint_;
  hooks().paired = [this] {
    std::lock_guard<std::mutex> lock(mutex_);
    return !token().empty();
  };
  hooks().setup = [this](bool disconnect) { return setup(disconnect); };
  return true;
}

std::string HomeAssistantApi::token() const {
  if (credential_ == Credential{}) return {};
  return encode(credential_.data(), credential_.size());
}

bool HomeAssistantApi::setup(bool disconnect) {
  if (espdesktop::reset::pending()) return false;
  if (disconnect) {
    std::lock_guard<std::mutex> lock(mutex_);
    expires_ = 0;
    credential_ = {};
    return preferences_.save(&credential_) && global_preferences->sync();
  }
  if (!hooks().show_code) return false;
  owner_->defer("home-assistant-setup", [this] {
    std::string code;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      esp_fill_random(pairing_.data(), pairing_.size());
      expires_ = millis() + 120000;
      attempts_ = 5;
      code = encode(pairing_.data(), 12);
    }
    hooks().show_code(fingerprint_ + "\n" + code);
  });
  return true;
}

esp_err_t HomeAssistantApi::handle(httpd_req_t *request) {
  // Each request uses a short-lived connection. A Home Assistant client
  // between polls should never hold a slot on the Mac's listener.
  const auto result = static_cast<HomeAssistantApi *>(request->user_ctx)->request(request);
  httpd_sess_trigger_close(request->handle, httpd_req_to_sockfd(request));
  return result;
}

esp_err_t HomeAssistantApi::request(httpd_req_t *request) {
  if (request->content_len || espdesktop::reset::pending())
    return respond(request, "400 Bad Request", "{}");
  const bool pair = std::strcmp(request->uri, "/home-assistant/v1/pair") == 0;
  const auto authorization = header(request, "Authorization");
  std::string bearer;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (pair) {
      if (!attempts_ || !expires_ || static_cast<int32_t>(expires_ - millis()) <= 0)
        return respond(request, "401 Unauthorized", "{}");
      --attempts_;
      if (!equal(authorization, "Pair " + encode(pairing_.data(), 12)))
        return respond(request, "401 Unauthorized", "{}");
      expires_ = 0;
      pairing_ = {};
      Credential next;
      esp_fill_random(next.data(), next.size());
      if (!preferences_.save(&next) || !global_preferences->sync())
        return respond(request, "503 Service Unavailable", "{}");
      credential_ = next;
      return respond(request, "200 OK", "{\"token\":\"" + token() + "\",\"id\":\"" + fingerprint_ + "\"}");
    }
    bearer = token();
    if (bearer.empty() || !equal(authorization, "Bearer " + bearer))
      return respond(request, "401 Unauthorized", "{}");
  }
  const bool press = request->method == HTTP_POST;
  const auto id = press ? header(request, "X-EspDesktop-Card") : std::string{};
  if (press && (id.size() != 32 || id.find_first_not_of("0123456789abcdef") != std::string::npos))
    return respond(request, "400 Bad Request", "{}");
  auto pending = std::make_shared<MainRequest>();
  owner_->defer([this, pending, bearer, press, id] {
    std::lock_guard<std::mutex> lock(pending->mutex);
    if (pending->cancelled) return;
    bool authorized;
    {
      std::lock_guard<std::mutex> credential_lock(mutex_);
      authorized = equal(bearer, token());
    }
    if (authorized && !espdesktop::reset::pending()) {
      if (press && hooks().press && hooks().press(id)) pending->response = "{\"accepted\":true}";
      if (!press && hooks().list) pending->response = hooks().list();
    }
    pending->complete = true;
    pending->changed.notify_one();
  });
  std::unique_lock<std::mutex> lock(pending->mutex);
  if (!pending->changed.wait_for(lock, std::chrono::seconds(2), [&] { return pending->complete; })) {
    pending->cancelled = true;
    return respond(request, "503 Service Unavailable", "{}");
  }
  return pending->response.empty()
      ? respond(request, "409 Conflict", "{}")
      : respond(request, press ? "202 Accepted" : "200 OK", pending->response);
}
}  // namespace esphome::companion
