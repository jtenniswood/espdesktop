#include "companion.h"
#include "../espdesktop/screen_lock_state.h"
#include "companion_discovery.h"
#include "../espdesktop/companion_protocol_generated.h"
#include "app_icon_store.h"

#include "esphome/core/application.h"
#include "esphome/core/helpers.h"
#include "esphome/core/log.h"
#include "esphome/components/json/json_util.h"

#include "../espdesktop/companion_controls.h"

#include <esp_random.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>
#include <mbedtls/x509_crt.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <memory>
#include <new>
#include <sys/socket.h>
#include <unistd.h>

namespace esphome::companion {

static const char *const TAG = "companion";
static CompanionService *global_companion_service = nullptr;
static std::mutex app_icon_state_mutex;
static std::vector<std::string> app_icon_requests;
static std::vector<std::string> enabled_app_icons;
static std::vector<std::string> requested_app_icons;
static bool app_icon_catalogue_ready = false;
static constexpr uint32_t PAIRING_WINDOW_MS = COMPANION_PAIRING_WINDOW_SECONDS * 1000;
static constexpr uint32_t RETRY_DELAY_MS = 30 * 1000;
static constexpr size_t MAX_WEBSOCKET_FRAME_BYTES = COMPANION_MAXIMUM_TEXT_FRAME_BYTES;
static constexpr size_t MAX_LEGACY_AUTH_FRAME_BYTES = 512;
static constexpr char LEGACY_PROTOCOL_ROUTE[] = "/companion/v*";
static constexpr size_t MAX_CATALOGUE_ACTIONS = 256;
static constexpr size_t MAX_APP_ICON_CHUNK_BYTES = COMPANION_APP_ICON_CHUNK_BYTES;
static constexpr uint32_t AUTHENTICATION_TIMEOUT_MS = 15 * 1000;
static constexpr char PAIRING_ALPHABET[] = "ABCDEFGHJKLMNPQRSTUVWXYZ";

static bool safe_field(const std::string &value, size_t limit) {
  if (value.empty() || value.size() > limit) return false;
  return std::all_of(value.begin(), value.end(), [](unsigned char byte) {
    return byte >= 0x20 && byte <= 0x7e && byte != '|' && byte != ',';
  });
}

static bool safe_application_id(const std::string &value) {
  return !value.empty() && value.size() <= APP_ICON_MAX_APPLICATION_ID_BYTES &&
      std::all_of(value.begin(), value.end(), [](unsigned char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-';
      });
}

static bool app_icon_is_referenced(const std::string &application_id) {
  std::lock_guard<std::mutex> lock(app_icon_state_mutex);
  return std::find(app_icon_requests.begin(), app_icon_requests.end(), application_id) != app_icon_requests.end();
}

static bool safe_utf8_field(const std::string &value, size_t limit) {
  if (value.empty() || value.size() > limit) return false;
  return std::all_of(value.begin(), value.end(), [](unsigned char byte) {
    return byte >= 0x20 && byte != '|' && byte != ',';
  });
}

static std::string hex(const uint8_t *value, size_t length) {
  static constexpr char digits[] = "0123456789abcdef";
  std::string result;
  result.reserve(length * 2);
  for (size_t i = 0; i < length; i++) {
    result.push_back(digits[value[i] >> 4]);
    result.push_back(digits[value[i] & 15]);
  }
  return result;
}

static bool constant_time_equal(const std::string &left, const std::string &right) {
  if (left.size() != right.size()) return false;
  unsigned char different = 0;
  for (size_t i = 0; i < left.size(); i++) different |= left[i] ^ right[i];
  return different == 0;
}

static bool parse_hex_sha256(const std::string &value, std::array<uint8_t, 32> &result) {
  if (value.size() != 64) return false;
  auto nibble = [](char byte) -> int {
    if (byte >= '0' && byte <= '9') return byte - '0';
    if (byte >= 'a' && byte <= 'f') return byte - 'a' + 10;
    if (byte >= 'A' && byte <= 'F') return byte - 'A' + 10;
    return -1;
  };
  for (size_t i = 0; i < result.size(); i++) {
    const int high = nibble(value[i * 2]);
    const int low = nibble(value[i * 2 + 1]);
    if (high < 0 || low < 0) return false;
    result[i] = static_cast<uint8_t>((high << 4) | low);
  }
  return true;
}

void CompanionService::setup() {
  global_companion_service = this;
  this->preferences_ = global_preferences->make_preference<CompanionIdentityPreference>(fnv1a_hash("companion_identity"));
  this->preferences_.load(&this->identity_);
  if (!this->ensure_identity_()) {
    ESP_LOGE(TAG, "Could not create the panel TLS identity");
    this->mark_failed();
    return;
  }
  this->sequence_preferences_ =
      global_preferences->make_preference<uint32_t>(fnv1a_hash("companion_auth_sequence"));
  this->focus_targets_preferences_ = global_preferences->make_preference<CompanionFocusTargetsPreference>(
      fnv1a_hash("companion_focus_targets"));
  this->restore_focus_targets_();
  companion_runtime_service().focus_registrations_changed_handler = [this] {
    this->save_focus_targets_();
  };
  if (!this->identity_.paired || !this->sequence_preferences_.load(&this->last_sequence_))
    this->last_sequence_ = 0;
  register_companion_action_sender([this](const std::string &action, const std::string &request,
                                          const std::string &folder_open_behavior) {
    return this->invoke_(action, request, folder_open_behavior);
  });
  register_companion_url_sender([this](const std::string &url, const std::string &request, bool new_window) {
    return this->invoke_url_(url, request, new_window);
  });
  register_companion_value_sender([this](const std::string &control, int value,
                                         const std::string &request) {
    return this->invoke_value_(control, value, request);
  });
  companion_runtime_service().begin_pairing = [this] { this->begin_pairing(); };
  companion_runtime_service().revoke_pairing = [this] { return this->revoke_pairing(); };
  companion_runtime_service().reset_and_begin_pairing = [this] { return this->reset_and_begin_pairing(); };
  companion_runtime_service().request_pairing_display = [this] {
    this->defer("show-pairing-code", [] {
      if (auto handler = companion_runtime_service().show_pairing_code_handler) handler();
    });
  };
  companion_runtime_service().clear_app_icon_cache = [] { return clear_companion_app_icon_cache(); };
  register_companion_pairing_provider([this] {
    const auto &runtime = companion_runtime_service();
    std::lock_guard<std::mutex> lock(this->pairing_mutex_);
    const uint32_t now = millis();
    const bool active = this->pairing_active_locked_(now);
    return CompanionPairingSnapshot{
      true,
      active,
      this->identity_.paired != 0,
      this->identity_.paired && runtime.connected(),
      active ? (this->pairing_expires_at_ - now + 999) / 1000 : 0,
      this->port_,
      runtime.system_metrics_generation(),
      active ? this->pairing_code_ : "",
      App.get_name() + ".local",
    };
  });
  register_companion_actions_endpoint();
  if (!this->start_server_()) {
    this->mark_failed();
    return;
  }
  // ESPHome owns mDNS initialization and network-interface lifecycle. It starts
  // later than Companion, so retry registration until that shared responder is ready.
  this->set_interval("discovery", 5000, [this] { this->advertise_discovery_(); });
}

void CompanionService::loop() {
  companion_expire_action_results(millis());
  const auto focus_targets = companion_runtime_service().focus_targets_state();
  if (focus_targets.connected && this->focus_targets_supported_.load() &&
      focus_targets.generation != this->focus_targets_generation_.load())
    this->publish_focus_targets_();
  {
    std::lock_guard<std::mutex> lock(this->pairing_mutex_);
    if (!this->pairing_code_.empty() && static_cast<int32_t>(millis() - this->pairing_expires_at_) >= 0) {
      this->pairing_code_.clear();
      this->pairing_expires_at_ = 0;
      this->next_attempt_at_ = 0;
    }
  }
  const uint32_t authentication_deadline = this->authentication_expires_at_.load();
  if (authentication_deadline != 0 &&
      static_cast<int32_t>(millis() - authentication_deadline) >= 0 &&
      !this->authentication_expiry_queued_.exchange(true)) {
    if (!this->server_ || httpd_queue_work(this->server_, &CompanionService::authentication_expiry_work_, this) != ESP_OK)
      this->authentication_expiry_queued_.store(false);
  }
}

void CompanionService::advertise_discovery_() {
  if (this->discovery_advertised_ || !this->server_) return;
  uint8_t digest[32]{};
  if (mbedtls_sha256(this->identity_.certificate, this->identity_.certificate_len, digest, 0) != 0) return;
  const std::string fingerprint = hex(digest, sizeof(digest));
  const std::string name = App.get_friendly_name().empty() ? App.get_name() : App.get_friendly_name();
  // This adds to the existing responder; never call mdns_init/free or replace
  // ESPHome's hostname, HTTP, or native API announcements.
  if (register_discovery(this->port_, name, fingerprint) == ESP_OK) {
    this->discovery_advertised_ = true;
    this->cancel_interval("discovery");
  }
}

void CompanionService::dump_config() {
  uint8_t fingerprint[32]{};
  mbedtls_sha256(this->identity_.certificate, this->identity_.certificate_len, fingerprint, 0);
  ESP_LOGCONFIG(TAG, "Companion:\n  Secure WebSocket port: %u\n  Device certificate: %s\n  Paired Mac: %s",
                this->port_, hex(fingerprint, sizeof(fingerprint)).c_str(), this->identity_.paired ? "yes" : "no");
}

bool CompanionService::ensure_identity_() {
  if (this->identity_.version == 1 && this->identity_.certificate_len && this->identity_.private_key_len) return true;

  mbedtls_entropy_context entropy;
  mbedtls_ctr_drbg_context drbg;
  mbedtls_pk_context key;
  mbedtls_x509write_cert certificate;
  mbedtls_entropy_init(&entropy);
  mbedtls_ctr_drbg_init(&drbg);
  mbedtls_pk_init(&key);
  mbedtls_x509write_crt_init(&certificate);
  unsigned char personalization[] = "espdesktop-companion";
  bool success = false;
  do {
    if (mbedtls_ctr_drbg_seed(&drbg, mbedtls_entropy_func, &entropy,
                              personalization, sizeof(personalization)) != 0) break;
    if (mbedtls_pk_setup(&key, mbedtls_pk_info_from_type(MBEDTLS_PK_ECKEY)) != 0) break;
    if (mbedtls_ecp_gen_key(MBEDTLS_ECP_DP_SECP256R1, mbedtls_pk_ec(key), mbedtls_ctr_drbg_random, &drbg) != 0) break;
    mbedtls_x509write_crt_set_version(&certificate, MBEDTLS_X509_CRT_VERSION_3);
    mbedtls_x509write_crt_set_md_alg(&certificate, MBEDTLS_MD_SHA256);
    mbedtls_x509write_crt_set_subject_key(&certificate, &key);
    mbedtls_x509write_crt_set_issuer_key(&certificate, &key);
    if (mbedtls_x509write_crt_set_subject_name(&certificate, "CN=EspDesktop") != 0) break;
    if (mbedtls_x509write_crt_set_issuer_name(&certificate, "CN=EspDesktop") != 0) break;
    unsigned char serial[] = {static_cast<unsigned char>(esp_random()), static_cast<unsigned char>(esp_random()),
                              static_cast<unsigned char>(esp_random()), static_cast<unsigned char>(esp_random())};
    if (mbedtls_x509write_crt_set_serial_raw(&certificate, serial, sizeof(serial)) != 0) break;
    if (mbedtls_x509write_crt_set_validity(&certificate, "20260101000000", "20360101000000") != 0) break;
    if (mbedtls_x509write_crt_set_basic_constraints(&certificate, 0, -1) != 0) break;
    if (mbedtls_x509write_crt_set_key_usage(&certificate, MBEDTLS_X509_KU_DIGITAL_SIGNATURE | MBEDTLS_X509_KU_KEY_ENCIPHERMENT) != 0) break;

    std::array<uint8_t, 1024> certificate_buffer{};
    const int certificate_length = mbedtls_x509write_crt_der(&certificate, certificate_buffer.data(), certificate_buffer.size(),
                                                               mbedtls_ctr_drbg_random, &drbg);
    if (certificate_length <= 0 || certificate_length > static_cast<int>(sizeof(this->identity_.certificate))) break;
    std::array<uint8_t, 384> key_buffer{};
    const int key_length = mbedtls_pk_write_key_der(&key, key_buffer.data(), key_buffer.size());
    if (key_length <= 0 || key_length > static_cast<int>(sizeof(this->identity_.private_key))) break;
    this->identity_ = {};
    this->identity_.version = 1;
    this->identity_.certificate_len = certificate_length;
    this->identity_.private_key_len = key_length;
    std::memcpy(this->identity_.certificate, certificate_buffer.data() + certificate_buffer.size() - certificate_length, certificate_length);
    std::memcpy(this->identity_.private_key, key_buffer.data() + key_buffer.size() - key_length, key_length);
    success = this->preferences_.save(&this->identity_);
  } while (false);
  mbedtls_x509write_crt_free(&certificate);
  mbedtls_pk_free(&key);
  mbedtls_ctr_drbg_free(&drbg);
  mbedtls_entropy_free(&entropy);
  return success;
}

bool CompanionService::start_server_() {
  httpd_ssl_config_t config = HTTPD_SSL_CONFIG_DEFAULT();
  config.httpd.max_open_sockets = 2;
  // Detect a Mac that disappears without closing its WebSocket (power or
  // network loss), so connection-driven screensavers can still activate.
  config.httpd.keep_alive_enable = true;
  config.httpd.keep_alive_idle = 5;
  config.httpd.keep_alive_interval = 5;
  config.httpd.keep_alive_count = 3;
  // Never evict an authenticated Companion session just to admit an
  // unauthenticated socket. Excess connections are rejected instead.
  config.httpd.lru_purge_enable = false;
  // The main web UI owns ESP-IDF's default HTTPD control port. Each HTTPD
  // instance needs a distinct internal control socket even when its public
  // listener uses a different port.
  config.httpd.ctrl_port += 1;
  config.httpd.close_fn = &CompanionService::session_close_;
  config.httpd.uri_match_fn = [](const char *route, const char *uri, size_t len) {
    const std::string_view path(uri, len);
    return std::strcmp(route, LEGACY_PROTOCOL_ROUTE) == 0
        ? legacy_protocol_for_path(path, COMPANION_PROTOCOL_VERSION) != 0
        : path == route;
  };
  config.port_secure = this->port_;
  config.httpd.global_user_ctx = this;
  config.servercert = this->identity_.certificate;
  config.servercert_len = this->identity_.certificate_len;
  config.prvtkey_pem = this->identity_.private_key;
  config.prvtkey_len = this->identity_.private_key_len;
  if (httpd_ssl_start(&this->server_, &config) != ESP_OK) return false;
  const httpd_uri_t websocket = {
      .uri = COMPANION_PROTOCOL_PATH, .method = HTTP_GET, .handler = &CompanionService::websocket_handler_, .user_ctx = this,
      .is_websocket = true, .handle_ws_control_frames = false, .ws_post_handshake_cb = &CompanionService::websocket_opened_};
  if (httpd_register_uri_handler(this->server_, &websocket) != ESP_OK) return false;
  const httpd_uri_t legacy_websocket = {
      .uri = LEGACY_PROTOCOL_ROUTE, .method = HTTP_GET, .handler = &CompanionService::legacy_websocket_handler_,
      .user_ctx = this, .is_websocket = true, .handle_ws_control_frames = false,
      .ws_post_handshake_cb = &CompanionService::websocket_opened_};
  return httpd_register_uri_handler(this->server_, &legacy_websocket) == ESP_OK;
}

void CompanionService::session_close_(httpd_handle_t server, int socket_fd) {
  (void) server;
  if (global_companion_service) {
    global_companion_service->forget_unauthenticated_socket_(socket_fd);
    global_companion_service->set_connected_(false, socket_fd);
  }
  shutdown(socket_fd, SHUT_RD);
  close(socket_fd);
}

void CompanionService::authentication_expiry_work_(void *context) {
  auto *service = static_cast<CompanionService *>(context);
  if (!service) return;
  service->authentication_expiry_queued_.store(false);
  const uint32_t now = millis();
  for (auto &session : service->unauthenticated_sessions_) {
    if (session.socket < 0 || static_cast<int32_t>(now - session.expires_at) < 0) continue;
    const int socket_fd = session.socket;
    session = {};
    session.socket = -1;
    httpd_sess_trigger_close(service->server_, socket_fd);
  }
  service->update_authentication_deadline_();
}

esp_err_t CompanionService::websocket_handler_(httpd_req_t *request) {
  auto *service = static_cast<CompanionService *>(request->user_ctx);
  return service ? service->handle_websocket_(request) : ESP_FAIL;
}

esp_err_t CompanionService::legacy_websocket_handler_(httpd_req_t *request) {
  auto *service = static_cast<CompanionService *>(request->user_ctx);
  return service ? service->handle_websocket_(request, true) : ESP_FAIL;
}

esp_err_t CompanionService::websocket_opened_(httpd_req_t *request) {
  auto *service = static_cast<CompanionService *>(request->user_ctx);
  if (!service) return ESP_FAIL;
  const std::string_view uri(request->uri);
  const int legacy_protocol = legacy_protocol_for_path(uri.substr(0, uri.find('?')), COMPANION_PROTOCOL_VERSION);
  const int socket_fd = httpd_req_to_sockfd(request);
  // ESP-IDF calls the route handler for frames and the post-handshake hook
  // for upgrades, where the original URI is still available.
  service->track_unauthenticated_socket_(socket_fd, legacy_protocol);
  return service->send_(socket_fd, "{\"type\":\"hello\",\"protocol\":" +
      std::to_string(legacy_protocol != 0 ? legacy_protocol : COMPANION_PROTOCOL_VERSION) + "}") ? ESP_OK : ESP_FAIL;
}

esp_err_t CompanionService::handle_websocket_(httpd_req_t *request, bool legacy) {
  if (request->method == HTTP_GET) {
    httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Expected a WebSocket upgrade");
    return ESP_FAIL;
  }
  const int socket_fd = httpd_req_to_sockfd(request);
  httpd_ws_frame_t frame{};
  if (httpd_ws_recv_frame(request, &frame, 0) != ESP_OK) return ESP_FAIL;
  const size_t max_frame_bytes = legacy ? MAX_LEGACY_AUTH_FRAME_BYTES
      : (frame.type == HTTPD_WS_TYPE_BINARY ? MAX_APP_ICON_CHUNK_BYTES + 12 : MAX_WEBSOCKET_FRAME_BYTES);
  if (frame.len > max_frame_bytes) {
    ESP_LOGW(TAG, "Rejected oversized Companion frame (%u bytes)", static_cast<unsigned>(frame.len));
    return ESP_FAIL;
  }
  std::vector<uint8_t> payload(frame.len + 1, 0);
  frame.payload = payload.data();
  if (httpd_ws_recv_frame(request, &frame, frame.len) != ESP_OK) return ESP_FAIL;
  if (frame.type == HTTPD_WS_TYPE_CLOSE) {
    this->set_connected_(false, socket_fd);
    return ESP_OK;
  }
  if (legacy) {
    if (frame.type == HTTPD_WS_TYPE_TEXT)
      this->handle_legacy_message_(socket_fd, reinterpret_cast<const char *>(payload.data()));
    this->expire_unauthenticated_socket_(socket_fd);
    return ESP_OK;
  }
  if (frame.type == HTTPD_WS_TYPE_BINARY) {
    if (socket_fd != this->session_.authenticated_socket()) {
      this->send_(socket_fd, "{\"type\":\"error\",\"protocol\":" +
          std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"code\":\"authenticate_first\"}");
      this->expire_unauthenticated_socket_(socket_fd);
      return ESP_OK;
    }
    this->handle_binary_(socket_fd, payload.data(), frame.len);
    return ESP_OK;
  }
  if (frame.type != HTTPD_WS_TYPE_TEXT) return ESP_OK;
  this->handle_message_(socket_fd, reinterpret_cast<const char *>(payload.data()));
  return ESP_OK;
}

void CompanionService::handle_legacy_message_(int socket_fd, const char *message) {
  const auto session = std::find_if(this->unauthenticated_sessions_.begin(), this->unauthenticated_sessions_.end(),
                                    [socket_fd](const auto &entry) { return entry.socket == socket_fd; });
  if (session == this->unauthenticated_sessions_.end() || session->legacy_protocol == 0) return;
  const int protocol = session->legacy_protocol;
  json::parse_json(message, [this, socket_fd, protocol](JsonObject root) -> bool {
    using companion_protocol::number_valid;
    if (!number_valid(root["protocol"], protocol, protocol, true) ||
        std::string_view(root["type"] | "") != "auth.request" ||
        !number_valid(root["sequence"], 1, UINT32_MAX, true)) return false;
    uint32_t last_sequence = 0;
    std::unique_lock<std::mutex> pairing_lock(this->pairing_mutex_);
    const auto result = this->authenticate_locked_(root["sequence"].as<uint32_t>(), root["nonce"] | "",
        root["signature"] | "", last_sequence, /*record_sequence=*/false);
    pairing_lock.unlock();
    const std::string error = "{\"type\":\"error\",\"protocol\":" + std::to_string(protocol);
    if (result == AuthenticationResult::STALE_SEQUENCE) {
      this->send_(socket_fd, error + ",\"code\":\"authentication_sequence\",\"lastSequence\":" +
          std::to_string(last_sequence) + "}");
    } else if (result == AuthenticationResult::AUTHENTICATED) {
      this->send_(socket_fd, error + ",\"code\":\"mac_update_required\"}");
    } else {
      return false;
    }
    return true;
  });
}

CompanionService::AuthenticationResult CompanionService::authenticate_locked_(
    uint32_t sequence, const std::string &nonce, const std::string &signature,
    uint32_t &last_sequence, bool record_sequence) {
  // Sign a stable protocol-v3 authentication payload. The sequence is strictly
  // increasing, so a captured authenticated frame cannot be replayed.
  last_sequence = this->last_sequence_;
  if (!this->identity_.paired || sequence == 0 || !safe_field(nonce, 96) || signature.size() != 64)
    return AuthenticationResult::FAILED;
  const std::string signed_message = "auth.request|" + std::to_string(sequence) + "|" + nonce;
  uint8_t digest[32]{};
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), this->identity_.credential, sizeof(this->identity_.credential),
                  reinterpret_cast<const unsigned char *>(signed_message.data()), signed_message.size(), digest);
  if (!constant_time_equal(hex(digest, sizeof(digest)), signature))
    return AuthenticationResult::FAILED;
  if (sequence <= this->last_sequence_) return AuthenticationResult::STALE_SEQUENCE;
  // A compatibility check proves possession of the pairing without starting
  // a session or changing the counter that the updated app will use.
  if (!record_sequence) {
    if (!this->session_.connected()) companion_runtime_service().set_mac_update_required(true);
    return AuthenticationResult::AUTHENTICATED;
  }
  if (!this->sequence_preferences_.save(&sequence)) {
    ESP_LOGE(TAG, "Could not persist the Companion authentication sequence");
    return AuthenticationResult::STORAGE_FAILED;
  }
  this->last_sequence_ = sequence;
  last_sequence = sequence;
  return AuthenticationResult::AUTHENTICATED;
}

void CompanionService::defer_session_(std::function<void()> callback, const char *label) {
  const uint32_t generation = this->session_.generation();
  const uint32_t queued_at = millis();
  this->defer([this, generation, queued_at, label, callback = std::move(callback)]() {
    if (!this->session_.current(generation)) return;
    const uint32_t started = millis();
    callback();
    const uint32_t finished = millis();
    if (started - queued_at > 100 || finished - started > 40)
      ESP_LOGD(TAG, "Deferred %s waited=%u ran=%u ms at=%u", label,
               unsigned(started - queued_at), unsigned(finished - started), unsigned(finished));
  });
}

void CompanionService::handle_message_(int socket_fd, const std::string &message) {
  if (message.empty() || message.front() != '{') {
    this->send_(socket_fd, "{\"type\":\"error\",\"protocol\":" +
        std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"code\":\"json_required\"}");
    this->expire_unauthenticated_socket_(socket_fd);
    return;
  }
  this->handle_json_(socket_fd, message);
}

void CompanionService::handle_json_(int socket_fd, const std::string &message) {
  bool parsed = json::parse_json(message, [this, socket_fd](JsonObject root) -> bool {
    const auto state = socket_fd == this->session_.authenticated_socket()
      ? companion_protocol::SessionState::CONNECTED
      : (std::string(root["type"] | "") == "pair.request" && this->pairing_active()
        ? companion_protocol::SessionState::PAIRING : companion_protocol::SessionState::AUTHENTICATING);
    const auto decoded = companion_protocol::decode(root, companion_protocol::Direction::MAC_TO_PANEL, state);
    if (!decoded) return false;
    auto send_error = [this, socket_fd](const char *code, uint32_t last_sequence = 0) {
      std::string response = "{\"type\":\"error\",\"protocol\":" +
          std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"code\":\"" + code + "\"";
      if (last_sequence != 0) response += ",\"lastSequence\":" + std::to_string(last_sequence);
      this->send_(socket_fd, response + "}");
    };

    if (const auto *payload = std::get_if<companion_protocol::AuthRequest>(&*decoded)) {
      const uint32_t sequence = payload->sequence;
      const std::string nonce = payload->nonce;
      const std::string signature = payload->signature;
      uint32_t last_sequence = 0;
      std::unique_lock<std::mutex> pairing_lock(this->pairing_mutex_);
      const auto authentication = this->authenticate_locked_(sequence, nonce, signature, last_sequence);
      if (authentication == AuthenticationResult::STALE_SEQUENCE) {
        send_error("authentication_sequence", last_sequence);
        this->expire_unauthenticated_socket_(socket_fd);
        return true;
      }
      if (authentication != AuthenticationResult::AUTHENTICATED) {
        const char *code = this->identity_.paired ? "authentication_failed" : "pairing_reset";
        if (authentication == AuthenticationResult::STORAGE_FAILED) code = "authentication_storage_failed";
        send_error(code);
        this->expire_unauthenticated_socket_(socket_fd);
        return true;
      }
      const int previous_socket = this->session_.authenticate(socket_fd);
      if (previous_socket != -1 && previous_socket != socket_fd)
        httpd_sess_trigger_close(this->server_, previous_socket);
      this->forget_unauthenticated_socket_(socket_fd);
      this->app_icons_supported_.store(false);
      this->set_connected_(true);
      pairing_lock.unlock();
      this->send_(socket_fd, "{\"type\":\"auth.accepted\",\"protocol\":" +
          std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"capabilityVersion\":" +
          std::to_string(COMPANION_CAPABILITY_VERSION) + "}");
      this->publish_catalogue_();
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::PairRequest>(&*decoded)) {
      const std::string code = payload->code;
      const uint32_t now = millis();
      std::unique_lock<std::mutex> pairing_lock(this->pairing_mutex_);
      if (!safe_field(code, 16) || !this->pairing_active_locked_(now)) {
        send_error("pairing_failed");
        this->expire_unauthenticated_socket_(socket_fd);
        return true;
      }
      if (this->next_attempt_at_ != 0 && static_cast<int32_t>(now - this->next_attempt_at_) < 0) {
        send_error("pairing_throttled");
        this->expire_unauthenticated_socket_(socket_fd);
        return true;
      }
      if (!constant_time_equal(code, this->pairing_code_)) {
        this->failed_attempts_++;
        this->next_attempt_at_ = now + RETRY_DELAY_MS;
        send_error("pairing_failed");
        this->expire_unauthenticated_socket_(socket_fd);
        return true;
      }
      const int previous_socket = this->session_.authenticated_socket();
      this->set_connected_(false);
      if (previous_socket >= 0 && previous_socket != socket_fd)
        httpd_sess_trigger_close(this->server_, previous_socket);
      const auto previous_identity = this->identity_;
      const uint32_t previous_sequence = this->last_sequence_;
      for (auto &byte : this->identity_.credential) byte = static_cast<uint8_t>(esp_random());
      this->identity_.paired = 1;
      this->last_sequence_ = 0;
      if (!this->preferences_.save(&this->identity_) ||
          !this->sequence_preferences_.save(&this->last_sequence_)) {
        this->identity_ = previous_identity;
        this->last_sequence_ = previous_sequence;
        this->preferences_.save(&this->identity_);
        this->sequence_preferences_.save(&this->last_sequence_);
        send_error("pairing_storage_failed");
        this->expire_unauthenticated_socket_(socket_fd);
        return true;
      }
      this->pairing_code_.clear();
      this->pairing_expires_at_ = 0;
      this->next_attempt_at_ = 0;
      this->failed_attempts_ = 0;
      const std::string credential = hex(this->identity_.credential, sizeof(this->identity_.credential));
      pairing_lock.unlock();
      companion_runtime_service().set_mac_update_required(false);
      this->defer([] {
        if (auto handler = companion_runtime_service().pairing_changed_handler) handler();
      });
      this->send_(socket_fd, "{\"type\":\"pair.accepted\",\"protocol\":" +
          std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"credential\":\"" + credential + "\"}");
      return true;
    }

    if (socket_fd != this->session_.authenticated_socket()) {
      send_error("authenticate_first");
      this->expire_unauthenticated_socket_(socket_fd);
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::Capabilities>(&*decoded)) {
      bool keyboard_actions = false;
      bool keyboard_actions_capability_received = false;
      bool app_icons_supported = false;
      bool app_icons_alpha_supported = false;
      bool app_icons_high_resolution_supported = false;
      bool focus_targets_supported = false;
      for (const auto &capability : payload->values) {
        if (capability == COMPANION_APP_ICONS_CAPABILITY) {
          app_icons_supported = true;
        } else if (capability == COMPANION_APP_ICONS_ALPHA_CAPABILITY) {
          app_icons_alpha_supported = true;
        } else if (capability == COMPANION_APP_ICONS_HIGH_RESOLUTION_CAPABILITY) {
          app_icons_high_resolution_supported = true;
        } else if (capability == "keyboard_shortcuts") {
          keyboard_actions = true;
          keyboard_actions_capability_received = true;
        } else if (capability == "keyboard_shortcuts_unavailable") {
          keyboard_actions = false;
          keyboard_actions_capability_received = true;
        } else if (capability == "url_card_focus") {
          focus_targets_supported = true;
        }
      }
      this->app_icons_supported_.store(app_icons_supported && app_icons_alpha_supported &&
                                       app_icons_high_resolution_supported);
      std::vector<std::string> configured_icons;
      {
        std::lock_guard<std::mutex> lock(app_icon_state_mutex);
        if (app_icon_catalogue_ready) configured_icons = app_icon_requests;
      }
      for (const auto &id : configured_icons) this->request_app_icon(id);
      this->defer_session_([this, keyboard_actions, keyboard_actions_capability_received, focus_targets_supported]() {
        if (keyboard_actions_capability_received) companion_set_keyboard_actions_supported(keyboard_actions);
        this->focus_targets_supported_.store(focus_targets_supported);
        if (focus_targets_supported) this->focus_targets_generation_.store(0xFFFFFFFFu);
      });
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::CataloguePage>(&*decoded)) {
      const uint32_t catalogue_generation = payload->generation;
      const uint16_t page = payload->page;
      const bool complete = payload->complete;
      if (catalogue_generation == 0 ||
          (page == 0 ? false : catalogue_generation != this->catalogue_generation_) ||
          page != (page == 0 ? 0 : this->catalogue_next_page_)) return false;
      if (page == 0) {
        this->catalogue_actions_.clear();
        this->catalogue_enabled_icons_.clear();
        this->catalogue_generation_ = catalogue_generation;
        this->catalogue_next_page_ = 0;
      }
      for (const auto &item : payload->items) {
        const std::string id = item.id;
        const std::string label = item.label;
        if (!safe_field(id, 96) || !safe_utf8_field(label, 96) || id.rfind("webapp.", 0) == 0) continue;
        const bool retain_action = this->catalogue_actions_.size() < MAX_CATALOGUE_ACTIONS;
        if (retain_action) this->catalogue_actions_.emplace_back(id, label);
        // Keep icon eligibility for configured cards even when their app is
        // outside the bounded browser catalogue. The reference set is bounded
        // by the panel configuration rather than the Mac's installed app count.
        if ((retain_action || app_icon_store().is_referenced(id)) &&
            id.rfind("folder.", 0) != 0 && id.rfind("shortcut.", 0) != 0 &&
            id.rfind("window.", 0) != 0 && id.rfind("metrics.", 0) != 0 &&
            id.rfind("urlcard.", 0) != 0 &&
            std::find(this->catalogue_enabled_icons_.begin(), this->catalogue_enabled_icons_.end(), id) ==
                this->catalogue_enabled_icons_.end())
          this->catalogue_enabled_icons_.push_back(id);
      }
      this->catalogue_next_page_ = page + 1;
      if (complete) {
        std::vector<CompanionAction> actions;
        actions.reserve(this->catalogue_actions_.size());
        for (const auto &item : this->catalogue_actions_) actions.push_back({item.first, item.second});
        this->defer_session_([actions = std::move(actions)]() mutable { companion_set_actions(std::move(actions)); }, "catalogue");
        std::vector<std::string> configured_icons;
        {
          std::lock_guard<std::mutex> lock(app_icon_state_mutex);
          enabled_app_icons = this->catalogue_enabled_icons_;
        }
        std::vector<std::string> enabled_icons;
        {
          std::lock_guard<std::mutex> lock(app_icon_state_mutex);
          app_icon_catalogue_ready = true;
          enabled_icons = enabled_app_icons;
          configured_icons = app_icon_requests;
          requested_app_icons.clear();
        }
        app_icon_store().set_enabled_applications(enabled_icons);
        this->defer_session_([] { companion_app_icon_ready(""); }, "icons");
        for (const auto &id : configured_icons) {
          if (std::find(enabled_icons.begin(), enabled_icons.end(), id) == enabled_icons.end()) continue;
          this->request_app_icon(id);
        }
      }
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::AppIconBegin>(&*decoded)) {
      std::array<uint8_t, 32> expected{};
      if (!app_icon_is_referenced(payload->appId)) {
        if (payload->generation != 0)
          this->send_(socket_fd, "{\"type\":\"app_icon.abort\",\"protocol\":" +
              std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"appId\":\"" + payload->appId +
              "\",\"generation\":" + std::to_string(payload->generation) + "}");
        return true;
      }
      if (payload->byteLength != APP_ICON_PIXEL_BYTES || payload->format != "rgb565a8" ||
          !parse_hex_sha256(payload->sha256, expected) || payload->generation == 0) return false;
      this->reset_app_icon_transfer_();
      this->app_icon_buffer_ = this->app_icon_allocator_.allocate(APP_ICON_PIXEL_BYTES);
      if (!this->app_icon_buffer_) {
        this->send_(socket_fd, "{\"type\":\"app_icon.abort\",\"protocol\":" +
            std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"appId\":\"" + payload->appId +
            "\",\"generation\":" + std::to_string(payload->generation) + "}");
        ESP_LOGW(TAG, "App icon transfer skipped: external memory unavailable");
        return true;
      }
      this->app_icon_application_id_ = payload->appId;
      this->app_icon_sha256_ = expected;
      this->app_icon_generation_ = payload->generation;
      this->app_icon_offset_ = 0;
      if (!this->send_(socket_fd, "{\"type\":\"app_icon.ack\",\"protocol\":" +
          std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"generation\":" +
          std::to_string(payload->generation) + ",\"nextOffset\":0}")) {
        this->set_connected_(false, socket_fd);
        httpd_sess_trigger_close(this->server_, socket_fd);
      }
      return true;
    }
    if (const auto *payload = std::get_if<companion_protocol::AppIconUnchanged>(&*decoded)) {
      if (!app_icon_is_referenced(payload->appId)) return false;
      std::array<uint8_t, 32> hash{};
      if (!parse_hex_sha256(payload->sha256, hash)) return false;
      return true;
    }
    if (const auto *payload = std::get_if<companion_protocol::AppIconUnavailable>(&*decoded)) {
      {
        std::lock_guard<std::mutex> lock(app_icon_state_mutex);
        requested_app_icons.erase(
            std::remove(requested_app_icons.begin(), requested_app_icons.end(), payload->appId),
            requested_app_icons.end());
      }
      if (payload->appId == this->app_icon_application_id_) this->reset_app_icon_transfer_();
      return true;
    }
    if (const auto *payload = std::get_if<companion_protocol::AppIconEnd>(&*decoded)) {
      if (payload->appId != this->app_icon_application_id_ ||
          payload->generation != this->app_icon_generation_ ||
          this->app_icon_offset_ != APP_ICON_PIXEL_BYTES) return false;
      std::array<uint8_t, 32> actual{};
      mbedtls_sha256(this->app_icon_buffer_, APP_ICON_PIXEL_BYTES, actual.data(), 0);
      std::string evicted_application_id;
      if (actual == this->app_icon_sha256_ &&
          app_icon_store().save(payload->appId, actual, this->app_icon_buffer_, APP_ICON_PIXEL_BYTES,
                                &evicted_application_id)) {
        if (!evicted_application_id.empty()) {
          std::lock_guard<std::mutex> lock(app_icon_state_mutex);
          requested_app_icons.erase(
              std::remove(requested_app_icons.begin(), requested_app_icons.end(), evicted_application_id),
              requested_app_icons.end());
        }
        const std::string application_id = payload->appId;
        this->defer_session_([application_id] { companion_app_icon_ready(application_id); }, "icon");
      } else {
        this->send_(socket_fd, "{\"type\":\"app_icon.abort\",\"protocol\":" +
            std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"appId\":\"" + payload->appId +
            "\",\"generation\":" + std::to_string(payload->generation) + "}");
      }
      this->reset_app_icon_transfer_();
      return true;
    }
    if (const auto *payload = std::get_if<companion_protocol::AppIconAbort>(&*decoded)) {
      if (payload->appId == this->app_icon_application_id_ &&
          payload->generation == this->app_icon_generation_) {
        this->reset_app_icon_transfer_();
      }
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::CatalogueDefinitionsPage>(&*decoded)) {
      const uint32_t generation = payload->generation;
      const uint16_t page = payload->page;
      if (generation == 0 || (page != 0 && generation != this->definitions_generation_) ||
          page != (page == 0 ? 0 : this->definitions_next_page_)) return false;
      if (page == 0) {
        this->remote_definitions_.clear();
        this->application_definition_count_ = 0;
        this->definitions_generation_ = generation;
        this->definitions_next_page_ = 0;
      }
      for (const auto &item : payload->items) {
        const std::string kind = item.kind;
        const std::string json = item.json;
        if (companion_remote_definition_capacity_available(kind, this->application_definition_count_) &&
            companion_json_payload_valid(json, 12000)) {
          JsonDocument document;
          const auto error = deserializeJson(document, json);
          const std::string id = document["appId"].as<std::string>();
          if (error || id.empty() || id.size() > 96) {
            continue;
          }
          this->remote_definitions_.push_back({kind, id, json});
          ++this->application_definition_count_;
        }
      }
      this->definitions_next_page_ = page + 1;
      if (payload->complete) {
        auto definitions = std::move(this->remote_definitions_);
        this->remote_definitions_.clear();
        this->defer_session_([definitions = std::move(definitions)]() mutable {
          companion_set_remote_definitions(std::move(definitions));
        }, "definitions");
      }
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::ActionResult>(&*decoded)) {
      const std::string request_id = payload->requestId;
      const std::string status = payload->status;
      if (!safe_field(request_id, 64) || !safe_field(status, 32)) return false;
      this->defer_session_([request_id, status]() { companion_deliver_action_result(request_id, status); });
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::ValueState>(&*decoded)) {
      const std::string control_id = payload->controlId;
      if (!companion_volume_control_valid(control_id)) return false;
      if (!payload->available) {
        this->defer_session_([control_id] { companion_remove_value(control_id); });
        return true;
      }
      const int value = payload->value ? static_cast<int>(*payload->value) : -1;
      if (value < 0 || value > 100) return false;
      this->defer_session_([control_id, value] { companion_set_value(control_id, value); });
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::FocusChanged>(&*decoded)) {
      const std::string action_id = payload->actionId;
      if (!action_id.empty() && !safe_field(action_id, 96)) return false;
      std::vector<std::string> action_ids = payload->actionIds.value_or(std::vector<std::string>{});
      if (action_ids.empty() && !action_id.empty()) action_ids.push_back(action_id);
      if (action_ids.size() > 64 || std::any_of(action_ids.begin(), action_ids.end(),
          [](const std::string &value) { return !safe_field(value, 96); })) return false;
      const bool application_only = payload->applicationOnly.value_or(false);
      const uint32_t received_at = millis();
      this->defer_session_([action_id, application_only, received_at, action_ids = std::move(action_ids)]() mutable {
        if (application_only) {
          companion_runtime_service().set_application_highlight(action_id);
          ESP_LOGD(TAG, "Application focus received: %s at=%u", action_id.c_str(), unsigned(received_at));
        }
        else companion_set_focused_actions(std::move(action_ids));
      });
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::SessionLock>(&*decoded)) {
      // Serialize queueing with explicit pairing revocation so an in-flight
      // message cannot restore the lock after the former Mac loses trust.
      std::lock_guard<std::mutex> lock(this->pairing_mutex_);
      if (!this->identity_.paired || socket_fd != this->session_.authenticated_socket()) return false;
      this->defer_session_([locked = payload->locked, awake = payload->displayAwake]() {
        screen_lock_set_mac_locked(locked, awake);
      });
      return true;
    }

    if (const auto *payload = std::get_if<companion_protocol::TimezoneChanged>(&*decoded)) {
      const std::string timezone = payload->identifier;
      if (!safe_field(timezone, 96)) return false;
      this->defer_session_([timezone]() { companion_set_timezone_id(timezone); });
      return true;
    }

    const uint32_t generation = root["generation"] | 0;
    if (generation == 0) return false;

    if (const auto *payload = std::get_if<companion_protocol::SystemMetrics>(&*decoded)) {
      if (!payload->available.value_or(true)) {
        this->defer_session_([] { companion_set_system_metrics({}); });
        return true;
      }
      CompanionSystemMetricsSnapshot snapshot;
      snapshot.generation = generation;
      snapshot.cpu_usage_percent = payload->cpuUsagePercent.value_or(NAN);
      snapshot.memory_usage_percent = payload->memoryUsagePercent.value_or(NAN);
      snapshot.storage_usage_percent = payload->storageUsagePercent.value_or(NAN);
      if (payload->storageDevices) {
        for (const auto &device : *payload->storageDevices)
          snapshot.storage_devices.push_back({device.id, device.label, static_cast<float>(device.usagePercent)});
      }
      snapshot.battery_percent = payload->batteryPercent.value_or(NAN);
      snapshot.network_throughput_kbps = payload->networkThroughputKBps.value_or(NAN);
      if (payload->networkInterfaces) {
        for (const auto &network : *payload->networkInterfaces)
          snapshot.network_interfaces.push_back({network.id, network.label, network.address});
      }
      const std::array<float, 3> required{{
          snapshot.cpu_usage_percent,
          snapshot.memory_usage_percent,
          snapshot.storage_usage_percent,
      }};
      if (std::any_of(required.begin(), required.end(), [](float value) {
            return !std::isfinite(value) || value < 0.0f || value > 100.0f;
          })) return false;
      if (std::isfinite(snapshot.battery_percent) &&
          (snapshot.battery_percent < 0.0f || snapshot.battery_percent > 100.0f)) return false;
      if (std::isfinite(snapshot.network_throughput_kbps) &&
          (snapshot.network_throughput_kbps < 0.0f || snapshot.network_throughput_kbps > 1.0e9f)) return false;
      this->defer_session_([snapshot]() mutable {
        companion_set_system_metrics(std::move(snapshot));
      });
      return true;
    }

    // Protocol v4 peers may still offer now-playing updates. Decline artwork
    // before the older Mac starts sending binary chunks.
    if (const auto *payload = std::get_if<companion_protocol::ArtworkBegin>(&*decoded)) {
      this->send_(socket_fd, "{\"type\":\"artwork.abort\",\"protocol\":" +
          std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"generation\":" +
          std::to_string(payload->generation) + "}");
      return true;
    }
    if (std::holds_alternative<companion_protocol::NowPlaying>(*decoded) ||
        std::holds_alternative<companion_protocol::ArtworkEnd>(*decoded) ||
        std::holds_alternative<companion_protocol::ArtworkAbort>(*decoded)) return true;
    return false;
  });
  if (!parsed) {
    ESP_LOGW(TAG, "Rejected invalid Companion JSON message");
    this->send_(socket_fd, "{\"type\":\"error\",\"protocol\":" +
        std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"code\":\"invalid_message\"}");
  }
}

void CompanionService::handle_binary_(int socket_fd, const uint8_t *data, size_t size) {
  if (this->app_icon_generation_ != 0) {
    if (size < 13 || size > MAX_APP_ICON_CHUNK_BYTES + 12 || std::memcmp(data, "ICON", 4) != 0) {
      this->reset_app_icon_transfer_();
      return;
    }
    const uint32_t generation = (static_cast<uint32_t>(data[4]) << 24) |
        (static_cast<uint32_t>(data[5]) << 16) | (static_cast<uint32_t>(data[6]) << 8) | data[7];
    const uint32_t offset = (static_cast<uint32_t>(data[8]) << 24) |
        (static_cast<uint32_t>(data[9]) << 16) | (static_cast<uint32_t>(data[10]) << 8) | data[11];
    const size_t chunk_size = size - 12;
    if (generation != this->app_icon_generation_ || offset != this->app_icon_offset_ ||
        chunk_size == 0 || chunk_size > MAX_APP_ICON_CHUNK_BYTES ||
        this->app_icon_offset_ + chunk_size > APP_ICON_PIXEL_BYTES) {
      this->reset_app_icon_transfer_();
      return;
    }
    if (!this->app_icon_buffer_) {
      this->reset_app_icon_transfer_();
      return;
    }
    std::memcpy(this->app_icon_buffer_ + this->app_icon_offset_, data + 12, chunk_size);
    this->app_icon_offset_ += chunk_size;
    if (!this->send_(socket_fd, "{\"type\":\"app_icon.ack\",\"protocol\":" +
        std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"generation\":" +
        std::to_string(generation) + ",\"nextOffset\":" + std::to_string(this->app_icon_offset_) + "}")) {
      this->set_connected_(false, socket_fd);
      httpd_sess_trigger_close(this->server_, socket_fd);
    }
  }
}

void CompanionService::reset_app_icon_transfer_() {
  if (this->app_icon_buffer_) {
    this->app_icon_allocator_.deallocate(this->app_icon_buffer_, APP_ICON_PIXEL_BYTES);
    this->app_icon_buffer_ = nullptr;
  }
  this->app_icon_application_id_.clear();
  this->app_icon_generation_ = 0;
  this->app_icon_offset_ = 0;
}

bool CompanionService::send_(int socket_fd, const std::string &message) {
  if (!this->server_ || socket_fd < 0) return false;
  httpd_ws_frame_t frame{};
  frame.type = HTTPD_WS_TYPE_TEXT;
  frame.payload = reinterpret_cast<uint8_t *>(const_cast<char *>(message.data()));
  frame.len = message.size();
  const esp_err_t result = httpd_ws_send_frame_async(this->server_, socket_fd, &frame);
  if (result != ESP_OK) {
    ESP_LOGW(TAG, "Failed to queue Companion message: %s", esp_err_to_name(result));
    return false;
  }
  return true;
}

void CompanionService::track_unauthenticated_socket_(int socket_fd, int legacy_protocol) {
  const uint32_t deadline = millis() + AUTHENTICATION_TIMEOUT_MS;
  for (auto &session : this->unauthenticated_sessions_) {
    if (session.socket == socket_fd) {
      session.expires_at = deadline;
      session.legacy_protocol = legacy_protocol;
      this->update_authentication_deadline_();
      return;
    }
  }
  for (auto &session : this->unauthenticated_sessions_) {
    if (session.socket < 0) {
      session = {socket_fd, deadline, legacy_protocol};
      this->update_authentication_deadline_();
      return;
    }
  }
  // LRU purging can replace a socket before its close callback is delivered.
  this->unauthenticated_sessions_[0] = {socket_fd, deadline, legacy_protocol};
  this->update_authentication_deadline_();
}

void CompanionService::forget_unauthenticated_socket_(int socket_fd) {
  for (auto &session : this->unauthenticated_sessions_) {
    if (session.socket == socket_fd) {
      session = {};
    }
  }
  this->update_authentication_deadline_();
}

void CompanionService::expire_unauthenticated_socket_(int socket_fd) {
  for (auto &session : this->unauthenticated_sessions_) {
    if (session.socket == socket_fd) session.expires_at = millis();
  }
  this->update_authentication_deadline_();
}

void CompanionService::update_authentication_deadline_() {
  uint32_t earliest = 0;
  const uint32_t now = millis();
  for (const auto &session : this->unauthenticated_sessions_) {
    if (session.socket < 0) continue;
    if (earliest == 0 || static_cast<int32_t>(session.expires_at - earliest) < 0)
      earliest = session.expires_at;
  }
  // Preserve an already-expired deadline so loop() queues cleanup immediately.
  this->authentication_expires_at_.store(earliest == 0 ? 0 :
      (static_cast<int32_t>(now - earliest) >= 0 ? now : earliest));
}

void CompanionService::set_connected_(bool connected, int closing_socket) {
  if (!connected) {
    if (closing_socket >= 0) {
      if (!this->session_.disconnect_socket(closing_socket)) return;
    } else {
      this->session_.disconnect();
    }
  }
  if (connected) {
    this->focus_targets_generation_ = 0xFFFFFFFFu;
    this->focus_targets_supported_ = false;
  } else {
    this->focus_targets_supported_ = false;
    this->reset_app_icon_transfer_();
  }
  this->defer_session_([connected]() {
    // Discard a stale awake state, but keep a sleeping panel dark until the
    // Mac reconnects and reports that its display woke or the session unlocked.
    if (screen_lock_mac_display_awake() == true) screen_lock_mac_display_awake().reset();
    if (connected) {
      companion_cancel_action_result();
      companion_runtime_service().set_connected(false);
    }
    companion_set_connected(connected);
    if (!connected) {
      companion_set_actions({});
      companion_set_timezone_id("");
    }
  }, "connection");
}

void CompanionService::publish_catalogue_() {
  this->send_(this->session_.authenticated_socket(),
              "{\"type\":\"catalogue.request\",\"protocol\":" +
              std::to_string(COMPANION_PROTOCOL_VERSION) + "}");
}

void CompanionService::publish_focus_targets_() {
  if (!this->focus_targets_supported_.load()) return;
  const int socket_fd = this->session_.authenticated_socket();
  if (socket_fd < 0) return;
  const auto snapshot = companion_runtime_snapshot();
  companion_protocol::FocusTargets payload;
  for (const auto &target : snapshot.url_focus_targets) {
    if (!safe_field(target.id, 96) || target.url.size() < 8 || target.url.size() > 128) continue;
    payload.items.push_back({target.id, target.url});
  }
  if (this->send_(socket_fd, json::build_json([&payload](JsonObject root) {
        companion_protocol::encode(root, payload);
      }))) {
    this->focus_targets_generation_.store(snapshot.url_focus_targets_generation);
  }
}

void CompanionService::restore_focus_targets_() {
  auto stored = std::unique_ptr<CompanionFocusTargetsPreference>(
      new (std::nothrow) CompanionFocusTargetsPreference{});
  if (!stored || !this->focus_targets_preferences_.load(stored.get()) || stored->version != 1 ||
      stored->url_count > 64) return;
  std::vector<CompanionURLFocusTarget> targets;
  targets.reserve(stored->url_count);
  for (size_t i = 0; i < stored->url_count; ++i) {
    const char *value = stored->urls[i];
    const auto *end = static_cast<const char *>(std::memchr(value, '\0', sizeof(stored->urls[i])));
    if (!end) continue;
    const std::string url(value, static_cast<size_t>(end - value));
    const std::string id = companion_url_card_focus_id(
        "url." + companion_encode_url_focus_value(url));
    if (companion_url_focus_target_valid(id, url)) targets.push_back({id, url});
  }
  companion_set_focus_registrations(std::move(targets));
}

void CompanionService::save_focus_targets_() {
  const auto snapshot = companion_runtime_snapshot();
  auto stored = std::unique_ptr<CompanionFocusTargetsPreference>(
      new (std::nothrow) CompanionFocusTargetsPreference{});
  if (!stored) {
    ESP_LOGW(TAG, "Could not allocate Companion browser focus registration storage");
    return;
  }
  size_t url_count = 0;
  for (const auto &target : snapshot.url_focus_targets) {
    if (url_count >= 64 || !companion_url_focus_target_valid(target.id, target.url)) continue;
    std::memcpy(stored->urls[url_count], target.url.c_str(), target.url.size() + 1);
    ++url_count;
  }
  stored->url_count = static_cast<uint8_t>(url_count);
  if (!this->focus_targets_preferences_.save(stored.get()))
    ESP_LOGW(TAG, "Could not persist Companion browser focus registrations");
}

bool CompanionService::invoke_(const std::string &action_id, const std::string &request_id,
                               const std::string &folder_open_behavior) {
  const int socket_fd = this->session_.authenticated_socket();
  if (socket_fd < 0 || !safe_field(action_id, 96) || !safe_field(request_id, 64) ||
      (folder_open_behavior != "new_window" && folder_open_behavior != "same_window")) return false;
  companion_protocol::ActionInvoke payload;
  payload.requestId = request_id;
  payload.kind = "action";
  payload.actionId = action_id;
  if (action_id.rfind("folder.", 0) == 0) payload.folderOpenBehavior = folder_open_behavior;
  return this->send_(socket_fd, json::build_json([&payload](JsonObject root) {
    companion_protocol::encode(root, payload);
  }));
}

bool CompanionService::invoke_url_(const std::string &encoded_url, const std::string &request_id,
                                   bool new_window) {
  const int socket_fd = this->session_.authenticated_socket();
  if (socket_fd < 0 || !safe_field(encoded_url, 128) || !safe_field(request_id, 64)) return false;
  companion_protocol::ActionInvoke payload;
  payload.requestId = request_id;
  payload.kind = "url";
  payload.appId = "system.default_browser";  // Required by older Companion versions.
  payload.encodedUrl = encoded_url;
  if (new_window) payload.urlOpenBehavior = "new_window";
  return this->send_(socket_fd, json::build_json([&payload](JsonObject root) {
    companion_protocol::encode(root, payload);
  }));
}

bool CompanionService::invoke_value_(const std::string &control_id, int value,
                                     const std::string &request_id) {
  const int socket_fd = this->session_.authenticated_socket();
  if (socket_fd < 0 || !companion_volume_control_valid(control_id) ||
      value < 0 || value > 100 || !safe_field(request_id, 64)) return false;
  const companion_protocol::ValueSet payload{request_id, control_id, static_cast<uint32_t>(value)};
  return this->send_(socket_fd, json::build_json([&payload](JsonObject root) {
    companion_protocol::encode(root, payload);
  }));
}

void CompanionService::begin_pairing() {
  std::lock_guard<std::mutex> lock(this->pairing_mutex_);
  this->begin_pairing_locked_();
}

void CompanionService::begin_pairing_locked_() {
  const uint32_t now = millis();
  // The web page and the display share the same code for this window.
  if (this->identity_.paired || this->pairing_active_locked_(now)) return;
  this->pairing_code_.clear();
  for (size_t i = 0; i < 8; i++) {
    if (i == 4) this->pairing_code_ += '-';
    this->pairing_code_ += PAIRING_ALPHABET[esp_random() % (sizeof(PAIRING_ALPHABET) - 1)];
  }
  this->pairing_expires_at_ = now + PAIRING_WINDOW_MS;
  this->next_attempt_at_ = 0;
}

bool CompanionService::pairing_active() const {
  std::lock_guard<std::mutex> lock(this->pairing_mutex_);
  return this->pairing_active_locked_(millis());
}

bool CompanionService::pairing_active_locked_(uint32_t now) const {
  return !this->pairing_code_.empty() &&
    static_cast<int32_t>(now - this->pairing_expires_at_) < 0;
}

std::string CompanionService::pairing_code() const {
  std::lock_guard<std::mutex> lock(this->pairing_mutex_);
  return this->pairing_code_;
}

void CompanionService::request_app_icon(const std::string &application_id) {
  const int socket_fd = this->session_.authenticated_socket();
  if (socket_fd < 0 || !this->app_icons_supported_.load() ||
      !safe_application_id(application_id)) return;
  {
    std::lock_guard<std::mutex> lock(app_icon_state_mutex);
    if (app_icon_catalogue_ready &&
        std::find(enabled_app_icons.begin(), enabled_app_icons.end(), application_id) == enabled_app_icons.end()) return;
    if (std::find(requested_app_icons.begin(), requested_app_icons.end(), application_id) != requested_app_icons.end()) return;
    requested_app_icons.push_back(application_id);
  }
  std::array<uint8_t, 32> hash{};
  const bool has_hash = app_icon_store().hash_for(application_id, &hash);
  const bool sent = this->send_(socket_fd, "{\"type\":\"app_icon.request\",\"protocol\":" +
      std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"appId\":\"" + application_id + "\"" +
      (has_hash ? ",\"sha256\":\"" + hex(hash.data(), hash.size()) + "\"" : "") + "}");
  if (!sent) {
    std::lock_guard<std::mutex> lock(app_icon_state_mutex);
    requested_app_icons.erase(std::remove(requested_app_icons.begin(), requested_app_icons.end(), application_id),
                              requested_app_icons.end());
  }
}

void CompanionService::refresh_app_icons_after_cache_clear() {
  this->defer_session_([] { companion_app_icon_ready(""); });
}

bool CompanionService::revoke_pairing() {
  std::lock_guard<std::mutex> lock(this->pairing_mutex_);
  return this->revoke_pairing_locked_();
}

bool CompanionService::reset_and_begin_pairing() {
  std::lock_guard<std::mutex> lock(this->pairing_mutex_);
  if (this->identity_.paired && !this->revoke_pairing_locked_()) return false;
  this->begin_pairing_locked_();
  return true;
}

bool CompanionService::revoke_pairing_locked_() {
  auto unpaired_identity = this->identity_;
  unpaired_identity.paired = 0;
  std::fill(std::begin(unpaired_identity.credential), std::end(unpaired_identity.credential), 0);
  // Unpaired identities ignore the stored sequence. The next successful
  // pairing persists its own sequence before accepting the new credential.
  if (!this->preferences_.save(&unpaired_identity)) return false;

  const int previous_socket = this->session_.authenticated_socket();
  if (previous_socket >= 0) {
    this->send_(previous_socket, "{\"type\":\"error\",\"protocol\":" +
        std::to_string(COMPANION_PROTOCOL_VERSION) + ",\"code\":\"pairing_reset\"}");
  }
  this->identity_ = unpaired_identity;
  this->last_sequence_ = 0;
  this->pairing_code_.clear();
  this->pairing_expires_at_ = 0;
  this->next_attempt_at_ = 0;
  companion_runtime_service().set_mac_update_required(false);
  this->set_connected_(false);
  // Revoking trust also clears the Mac's lock. Ordinary disconnects retain it.
  this->defer([] {
    screen_lock_set_mac_locked(false);
    if (auto handler = companion_runtime_service().pairing_changed_handler) handler();
  });
  if (previous_socket >= 0) httpd_sess_trigger_close(this->server_, previous_socket);
  return true;
}

void begin_companion_pairing() { if (global_companion_service) global_companion_service->begin_pairing(); }
std::string companion_pairing_code() { return global_companion_service ? global_companion_service->pairing_code() : ""; }
bool companion_pairing_active() { return global_companion_service && global_companion_service->pairing_active(); }
void revoke_companion_pairing() { if (global_companion_service) global_companion_service->revoke_pairing(); }
void request_app_icon(const std::string &application_id) {
  if (!safe_application_id(application_id)) return;
  {
    std::lock_guard<std::mutex> lock(app_icon_state_mutex);
    if (std::find(app_icon_requests.begin(), app_icon_requests.end(), application_id) == app_icon_requests.end())
      app_icon_requests.push_back(application_id);
  }
  app_icon_store().begin();
  app_icon_store().add_reference(application_id);
  if (global_companion_service) global_companion_service->request_app_icon(application_id);
}
void sync_app_icon_references(const std::vector<std::string> &application_ids) {
  std::vector<std::string> references;
  for (const auto &id : application_ids) {
    if (!safe_application_id(id)) continue;
    if (std::find(references.begin(), references.end(), id) == references.end()) references.push_back(id);
  }
  {
    std::lock_guard<std::mutex> lock(app_icon_state_mutex);
    app_icon_requests = references;
    requested_app_icons.clear();
  }
  app_icon_store().begin();
  app_icon_store().set_references(references);
  if (global_companion_service) for (const auto &id : references)
    global_companion_service->request_app_icon(id);
}
bool clear_companion_app_icon_cache() {
  auto &store = app_icon_store();
  if (!store.begin() || !store.clear_cache()) return false;
  if (global_companion_service) global_companion_service->refresh_app_icons_after_cache_clear();
  std::vector<std::string> references;
  {
    std::lock_guard<std::mutex> lock(app_icon_state_mutex);
    references = app_icon_requests;
  }
  sync_app_icon_references(references);
  return true;
}

}  // namespace esphome::companion
