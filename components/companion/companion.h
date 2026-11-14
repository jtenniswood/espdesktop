#pragma once

#include "esphome/core/component.h"
#include "esphome/core/helpers.h"
#include "esphome/core/preferences.h"
#include "session_state.h"
#include "../espdesktop/companion_runtime.h"

#include <esp_https_server.h>

#include <atomic>
#include <array>
#include <mutex>
#include <optional>
#include <string>
#include <utility>
#include <vector>
#include "app_icon_store.h"

namespace esphome::companion {

/** Persistent device identity and paired-Mac credential.
 *
 * The certificate is made on the panel's first boot and stored in ESPHome's
 * preference store.  The Mac pins its SHA-256 fingerprint after pairing, so a
 * later connection cannot silently move to another panel.
 */
struct CompanionIdentityPreference {
  uint32_t version{1};
  uint16_t certificate_len{0};
  uint16_t private_key_len{0};
  uint8_t certificate[1024]{};
  uint8_t private_key[384]{};
  uint8_t credential[32]{};
  uint8_t paired{0};
};

struct CompanionFocusTargetsPreference {
  uint32_t version{1};
  uint8_t url_count{0};
  uint8_t web_app_count{0};
  char urls[64][129]{};
  char web_app_ids[64][65]{};
};

class CompanionService final : public Component {
 public:
  void set_port(uint16_t port) { this->port_ = port; }
  // The Companion bridge registers callbacks owned by EspDesktopApp during
  // setup, so it must run after that app starts at AFTER_WIFI.
  float get_setup_priority() const override { return setup_priority::AFTER_WIFI - 1.0f; }
  void setup() override;
  void loop() override;
  void dump_config() override;

  // The panel and its web setup page share an active pairing code.
  void begin_pairing();
  std::string pairing_code() const;
  bool pairing_active() const;
  bool revoke_pairing();
  bool reset_and_begin_pairing();
  void request_app_icon(const std::string &application_id);
  void refresh_app_icons_after_cache_clear();

 protected:
  void advertise_discovery_();
  bool discovery_advertised_{false};
  enum class AuthenticationResult : uint8_t { FAILED, STORAGE_FAILED, STALE_SEQUENCE, AUTHENTICATED };

  static esp_err_t websocket_handler_(httpd_req_t *request);
  static esp_err_t legacy_websocket_handler_(httpd_req_t *request);
  static esp_err_t websocket_opened_(httpd_req_t *request);
  static void session_close_(httpd_handle_t server, int socket_fd);
  static void authentication_expiry_work_(void *context);
  esp_err_t handle_websocket_(httpd_req_t *request, bool legacy = false);
  void handle_legacy_message_(int socket_fd, const char *message);
  bool start_server_();
  bool ensure_identity_();
  AuthenticationResult authenticate_locked_(uint32_t sequence, const std::string &nonce,
                                            const std::string &signature, uint32_t &last_sequence,
                                            bool record_sequence = true);
  void defer_session_(std::function<void()> callback, const char *label = "update");
  void handle_message_(int socket_fd, const std::string &message);
  void handle_json_(int socket_fd, const std::string &message);
  void handle_binary_(int socket_fd, const uint8_t *data, size_t size);
  void reset_app_icon_transfer_();
  bool send_(int socket_fd, const std::string &message);
  void track_unauthenticated_socket_(int socket_fd, int legacy_protocol);
  void forget_unauthenticated_socket_(int socket_fd);
  void expire_unauthenticated_socket_(int socket_fd);
  void update_authentication_deadline_();
  void set_connected_(bool connected, int closing_socket = -1);
  void publish_catalogue_();
  void publish_focus_targets_();
  void restore_focus_targets_();
  void save_focus_targets_();
  bool invoke_(const std::string &action_id, const std::string &request_id,
               const std::string &folder_open_behavior, const std::string &shortcut_app_id);
  bool invoke_url_(const std::string &encoded_url, const std::string &request_id, bool new_window);
  bool invoke_value_(const std::string &control_id, int value,
                     const std::string &request_id);
  using PairingCode = std::array<char, COMPANION_PAIRING_CODE_LENGTH>;
  bool begin_pairing_locked_(bool reset, bool show_on_display = false);
  bool revoke_pairing_locked_(const PairingCode *code = nullptr, bool show_on_display = false);
  bool pairing_active_locked_() const;
  static PairingCode generate_pairing_code_();

  ESPPreferenceObject preferences_;
  ESPPreferenceObject sequence_preferences_;
  ESPPreferenceObject pairing_code_preferences_;
  ESPPreferenceObject focus_targets_preferences_;
  CompanionIdentityPreference identity_{};
  httpd_handle_t server_{nullptr};
  uint16_t port_{8443};
  CompanionSessionState session_{};
  uint32_t last_sequence_{0};
  std::optional<uint32_t> last_failed_pairing_at_;
  mutable std::mutex pairing_mutex_;
  std::string pairing_code_;
  std::atomic<uint32_t> focus_targets_generation_{0};
  std::atomic<bool> focus_targets_supported_{false};
  std::vector<std::pair<std::string, std::string>> catalogue_actions_;
  std::vector<std::string> catalogue_enabled_icons_;
  std::vector<CompanionRemoteDefinition> remote_definitions_;
  uint16_t application_definition_count_{0};
  uint16_t web_app_definition_count_{0};
  uint32_t catalogue_generation_{0};
  uint16_t catalogue_next_page_{0};
  uint32_t definitions_generation_{0};
  uint16_t definitions_next_page_{0};
  struct UnauthenticatedSession {
    int socket{-1};
    uint32_t expires_at{0};
    int legacy_protocol{0};
  };
  std::array<UnauthenticatedSession, 2> unauthenticated_sessions_{};
  RAMAllocator<uint8_t> app_icon_allocator_{RAMAllocator<uint8_t>::ALLOC_EXTERNAL};
  uint8_t *app_icon_buffer_{nullptr};
  std::string app_icon_application_id_;
  std::array<uint8_t, 32> app_icon_sha256_{};
  uint32_t app_icon_generation_{0};
  size_t app_icon_offset_{0};
  std::atomic<bool> app_icons_supported_{false};
  std::atomic<uint32_t> authentication_expires_at_{0};
  std::atomic<bool> authentication_expiry_queued_{false};
};

// The display owns the interaction. These narrow helpers avoid exposing the
// WebSocket service to the generic grid code.
void begin_companion_pairing();
std::string companion_pairing_code();
bool companion_pairing_active();
void revoke_companion_pairing();
void request_app_icon(const std::string &application_id);
void sync_app_icon_references(const std::vector<std::string> &application_ids);
bool clear_companion_app_icon_cache();
void companion_app_icon_ready(const std::string &application_id);

}  // namespace esphome::companion
