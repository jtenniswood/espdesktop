#pragma once

// Runtime boundary for Companion cards. The grid knows only opaque action IDs;
// the companion service owns pairing, transport and the Mac app catalogue.

#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

#include "companion_capabilities_generated.h"
#include "companion_runtime_access.h"
#ifdef USE_COMPANION
#include "../companion/app_icon_store.h"
#endif
#include "companion_pairing_policy.h"
#include "companion_timezone.h"
#include "i18n_generated.h"

#ifdef USE_WEBSERVER
#include "esphome/components/web_server_idf/web_server_idf.h"
#include "panel_config_http_context.h"
#endif

#ifdef USE_LVGL
#include "esphome/components/lvgl/lvgl_esphome.h"
#include "display_text.h"
#include "card_availability.h"
#include "card_text_contrast.h"
#endif

inline CompanionPendingActions &companion_pending_actions() {
  return companion_runtime_service().pending_actions;
}

inline void companion_clear_pending_action(CompanionPendingAction &pending) {
  pending.request_id.clear();
  pending.expected_application_id.clear();
  pending.expires_at = 0;
  pending.success = nullptr;
}

inline bool companion_expect_action_result(
    const std::string &request_id, const std::string &expected_application_id,
    CompanionActionResultHandler success, uint32_t expires_at = 0) {
  if (request_id.empty() || !success) return false;
  auto &pending = companion_pending_actions();
  std::lock_guard<std::mutex> lock(pending.mutex);
  auto entry = std::find_if(pending.entries.begin(), pending.entries.end(),
    [&request_id](const CompanionPendingAction &candidate) {
      return candidate.request_id.empty() || candidate.request_id == request_id;
    });
  if (entry == pending.entries.end()) return false;
  entry->request_id = request_id;
  entry->expected_application_id = expected_application_id;
  entry->expires_at = expires_at;
  entry->success = std::move(success);
  return true;
}

inline bool companion_expect_action_result(const std::string &request_id,
                                           CompanionActionResultHandler success,
                                           uint32_t expires_at = 0) {
  return companion_expect_action_result(request_id, "", std::move(success), expires_at);
}

inline void companion_cancel_action_result(const std::string &request_id = "") {
  auto &pending = companion_pending_actions();
  std::lock_guard<std::mutex> lock(pending.mutex);
  for (auto &entry : pending.entries) {
    if (request_id.empty() || entry.request_id == request_id)
      companion_clear_pending_action(entry);
  }
}

inline size_t companion_expire_action_results(uint32_t now) {
  size_t expired = 0;
  auto &pending = companion_pending_actions();
  std::lock_guard<std::mutex> lock(pending.mutex);
  for (auto &entry : pending.entries) {
    if (!entry.request_id.empty() && entry.expires_at != 0 &&
        static_cast<int32_t>(now - entry.expires_at) >= 0) {
      companion_clear_pending_action(entry);
      expired++;
    }
  }
  return expired;
}

inline void companion_deliver_action_result(const std::string &request_id,
                                            const std::string &status) {
  CompanionActionResultHandler success;
  {
    auto &pending = companion_pending_actions();
    std::lock_guard<std::mutex> lock(pending.mutex);
    auto entry = std::find_if(pending.entries.begin(), pending.entries.end(),
      [&request_id](const CompanionPendingAction &candidate) {
        return candidate.request_id == request_id;
      });
    if (entry == pending.entries.end()) return;
    // Only a current Companion build sends "activated" after it has verified
    // that a launched application is frontmost. Older builds report
    // "performed" as soon as launch scheduling succeeds, which is not safe
    // enough to expose keyboard shortcuts.
    if (status == "activated") success = std::move(entry->success);
    companion_clear_pending_action(*entry);
  }
  if (success) success();
}

inline void companion_request_card_refresh();

// Compatibility accessor for card rendering and the existing firmware tests.
// The flag itself is owned by CompanionRuntimeService.
inline std::atomic<bool> &companion_card_refresh_requested() {
  return companion_runtime_service().refresh_flag();
}

inline void companion_request_card_refresh() {
  companion_runtime_service().request_refresh();
}

inline CompanionRuntimeSnapshot companion_runtime_snapshot() {
  return companion_runtime_service().snapshot();
}

inline CompanionNowPlayingHandler &companion_now_playing_handler() {
  return companion_runtime_service().now_playing_handler;
}

inline CompanionConnectionChangedHandler &companion_connection_changed_handler() {
  return companion_runtime_service().connection_changed_handler;
}

inline void register_companion_connection_changed_handler(
    CompanionConnectionChangedHandler handler) {
  companion_connection_changed_handler() = std::move(handler);
}

inline std::vector<CompanionConnectionChangedHandler> &companion_connection_changed_observers() {
  static std::vector<CompanionConnectionChangedHandler> observers;
  return observers;
}

inline void add_companion_connection_changed_observer(
    CompanionConnectionChangedHandler handler) {
  if (handler) companion_connection_changed_observers().push_back(std::move(handler));
}

inline CompanionArtworkHandler &companion_artwork_handler() {
  return companion_runtime_service().artwork_handler;
}

inline void register_companion_now_playing_handlers(CompanionNowPlayingHandler now_playing,
                                                     CompanionArtworkHandler artwork) {
  companion_now_playing_handler() = std::move(now_playing);
  companion_artwork_handler() = std::move(artwork);
}

inline void companion_set_now_playing(CompanionNowPlayingSnapshot snapshot) {
  companion_runtime_service().set_now_playing(snapshot);
  if (companion_now_playing_handler()) companion_now_playing_handler()(snapshot);
}

inline bool companion_metric_key_valid(const std::string &key) {
  return companion_metric_capability(key) != nullptr;
}

inline const char *companion_metric_label_key(const std::string &key) {
  const auto *capability = companion_metric_capability(key);
  return capability ? capability->label_key : "";
}

inline const char *companion_metric_default_unit(const std::string &key) {
  const auto *capability = companion_metric_capability(key);
  return capability ? capability->unit : "";
}

inline const char *companion_metric_icon(const std::string &entity) {
  const std::string key = entity.substr(0, entity.find(':'));
  if (key == "stat.ip_address") return "Laptop";
  if (key == "stat.battery" || key == "stat.battery_used") return "Battery Outline";
  if (key == "stat.memory" || key == "stat.memory_free") return "Memory";
  if (key == "stat.storage" || key == "stat.storage_free") return "Harddisk";
  if (key == "stat.network_throughput") return "LAN";
  return "Gauge";
}

inline const char *companion_metric_suffix_key(const std::string &entity) {
  const std::string key = entity.substr(0, entity.find(':'));
  if (key == "stat.battery_used") return "stat_used";
  if (key == "stat.battery") return "stat_remaining";
  if (key == "stat.memory_free" || key == "stat.storage_free") return "stat_free";
  if (key == "stat.network_throughput") return "";
  return "stat_used";
}

inline bool companion_metric_value(const CompanionRuntimeSnapshot &snapshot,
                                   const std::string &key, float &value) {
  if (!snapshot.connected) return false;
  const auto separator = key.find(':');
  if (separator != std::string::npos) {
    if (!companion_metric_key_valid(key)) return false;
    const auto id = key.substr(separator + 1);
    for (const auto &device : snapshot.system_metrics.storage_devices) {
      if (device.id != id) continue;
      value = key.substr(0, separator) == "stat.storage_free" ? 100.0f - device.usage_percent : device.usage_percent;
      return std::isfinite(value);
    }
    return false;
  }
  if (key == "stat.cpu") value = snapshot.system_metrics.cpu_usage_percent;
  else if (key == "stat.memory") value = snapshot.system_metrics.memory_usage_percent;
  else if (key == "stat.memory_free") value = 100.0f - snapshot.system_metrics.memory_usage_percent;
  else if (key == "stat.storage") value = snapshot.system_metrics.storage_usage_percent;
  else if (key == "stat.storage_free") value = 100.0f - snapshot.system_metrics.storage_usage_percent;
  else if (key == "stat.battery") value = snapshot.system_metrics.battery_percent;
  else if (key == "stat.battery_used") value = 100.0f - snapshot.system_metrics.battery_percent;
  else if (key == "stat.network_throughput") {
    // The Companion protocol remains in KB/s; cards display megabytes per second.
    value = snapshot.system_metrics.network_throughput_kbps / 1024.0f;
  }
  else return false;
  return std::isfinite(value);
}

inline void companion_set_system_metrics(CompanionSystemMetricsSnapshot snapshot) {
  companion_runtime_service().set_system_metrics(std::move(snapshot));
}

inline bool companion_deliver_artwork(uint32_t generation, uint8_t *data, size_t size) {
  return companion_artwork_handler() && companion_artwork_handler()(generation, data, size);
}

inline bool companion_connected() {
  return companion_runtime_service().connected();
}

inline CompanionActionSender &companion_action_sender() {
  return companion_runtime_service().action_sender;
}

inline CompanionUrlSender &companion_url_sender() {
  return companion_runtime_service().url_sender;
}

inline CompanionValueSender &companion_value_sender() {
  return companion_runtime_service().value_sender;
}

inline CompanionPairingProvider &companion_pairing_provider() {
  return companion_runtime_service().pairing_provider;
}

inline void companion_set_remote_definitions(std::vector<CompanionRemoteDefinition> definitions) {
  size_t application_count = 0;
  definitions.erase(std::remove_if(definitions.begin(), definitions.end(),
    [&application_count](const CompanionRemoteDefinition &definition) {
      if (definition.kind != "application" ||
          definition.json.empty() || definition.json.size() > 12000 ||
          !companion_remote_definition_capacity_available(definition.kind, application_count))
        return true;
      ++application_count;
      return false;
    }), definitions.end());
  companion_runtime_service().set_remote_definitions(std::move(definitions));
}

inline std::string companion_url_card_focus_id(const std::string &url_config);

inline std::string companion_encode_url_focus_value(const std::string &url) {
  static constexpr char digits[] = "0123456789ABCDEF";
  std::string encoded;
  encoded.reserve(url.size() * 3);
  for (unsigned char byte : url) {
    const bool safe = (byte >= 'A' && byte <= 'Z') || (byte >= 'a' && byte <= 'z') ||
      (byte >= '0' && byte <= '9') || std::string("-_.!~*'()").find(static_cast<char>(byte)) != std::string::npos;
    if (safe) encoded.push_back(static_cast<char>(byte));
    else { encoded.push_back('%'); encoded.push_back(digits[byte >> 4]); encoded.push_back(digits[byte & 15]); }
  }
  return encoded;
}

inline bool companion_url_focus_target_valid(const std::string &id, const std::string &url) {
  if (id.rfind("urlcard.", 0) != 0 || id.size() != 24 || url.size() < 8 || url.size() > 128 ||
      id != companion_url_card_focus_id("url." + companion_encode_url_focus_value(url))) return false;
  const auto scheme_end = url.find("://");
  if (scheme_end == std::string::npos) return false;
  const std::string scheme = url.substr(0, scheme_end);
  if (scheme != "http" && scheme != "https") return false;
  const auto authority_end = url.find_first_of("/?#", scheme_end + 3);
  const std::string authority = url.substr(scheme_end + 3, authority_end == std::string::npos ? std::string::npos : authority_end - scheme_end - 3);
  return !authority.empty() && authority.find('@') == std::string::npos;
}

inline void companion_set_focus_registrations(std::vector<CompanionURLFocusTarget> targets) {
  targets.erase(std::remove_if(targets.begin(), targets.end(), [](const auto &target) {
    return !companion_url_focus_target_valid(target.id, target.url);
  }), targets.end());
  companion_runtime_service().set_focus_registrations(std::move(targets));
}

inline void companion_set_actions(std::vector<CompanionAction> actions) {
  actions.erase(std::remove_if(actions.begin(), actions.end(),
    [](const CompanionAction &action) {
      return action.id.empty() || action.id.size() > 96 || action.label.size() > 96;
    }), actions.end());
  companion_runtime_service().set_actions(std::move(actions));
}

inline void companion_set_window_actions(std::vector<std::string> actions) {
  companion_runtime_service().set_window_actions(std::move(actions));
}

inline void companion_set_keyboard_actions_supported(bool supported) {
  companion_runtime_service().set_keyboard_actions_supported(supported);
}

inline bool companion_mute_control_valid(const std::string &control_id) {
  return control_id == "media.output_mute" || control_id == "media.input_mute";
}

inline bool companion_volume_control_valid(const std::string &control_id) {
  return control_id == "media.output_volume" || control_id == "media.input_volume" ||
    companion_mute_control_valid(control_id);
}

inline const char *companion_volume_control_label(const std::string &control_id) {
  if (control_id == "media.output_volume") return espdesktop_i18n("Volume");
  if (control_id == "media.input_volume") return espdesktop_i18n("Mic");
  if (companion_mute_control_valid(control_id)) return espdesktop_i18n("Mute");
  return espdesktop_i18n("Volume");
}

inline bool companion_value(const std::string &control_id, int &value) {
  return companion_runtime_service().value(control_id, value);
}

inline void companion_set_value(const std::string &control_id, int value) {
  if (!companion_volume_control_valid(control_id)) return;
  value = std::max(0, std::min(100, value));
  companion_runtime_service().set_value(control_id, value);
}

inline void companion_remove_value(const std::string &control_id) {
  if (!companion_volume_control_valid(control_id)) return;
  companion_runtime_service().remove_value(control_id);
}

inline std::atomic<bool> &companion_subpage_return_requested();

inline void companion_set_focused_action(std::string action_id) {
  if (action_id.size() > 96) action_id.clear();
  const bool should_return_from_subpage =
    companion_runtime_service().set_focused_action(std::move(action_id));
  if (should_return_from_subpage) companion_subpage_return_requested().store(true);
}

inline void companion_set_focused_actions(std::vector<std::string> action_ids) {
  for (auto &action_id : action_ids)
    if (action_id.size() > 96) action_id.clear();
  const bool should_return_from_subpage =
    companion_runtime_service().set_focused_actions(std::move(action_ids));
  if (should_return_from_subpage) companion_subpage_return_requested().store(true);
}

inline std::atomic<bool> &companion_subpage_return_requested() {
  return companion_runtime_service().subpage_return_requested;
}

inline bool companion_consume_subpage_return_request() {
  return companion_subpage_return_requested().exchange(false);
}

inline void companion_set_auto_open_app_subpages(bool enabled) {
  companion_runtime_service().set_auto_open_app_subpages(enabled);
}

inline void companion_set_return_home_on_app_switch(bool enabled) {
  companion_runtime_service().set_return_home_on_app_switch(enabled);
}

inline bool companion_return_home_on_app_switch() {
  return companion_runtime_service().return_home_on_app_switch();
}

inline bool companion_auto_open_app_subpages() {
  return companion_runtime_service().auto_open_app_subpages();
}

inline std::string companion_pending_auto_subpage_action() {
  return companion_runtime_service().pending_auto_subpage_action();
}

inline bool companion_consume_auto_subpage_action(const std::string &action_id) {
  return companion_runtime_service().consume_auto_subpage_action(action_id);
}

inline bool companion_action_focused(const CompanionRuntimeSnapshot &snapshot,
                                    const std::string &action_id, bool visual_only = false) {
  if (action_id.empty() || action_id.rfind("shortcut.", 0) == 0 ||
      action_id.rfind("media.", 0) == 0) return false;
  if (!snapshot.connected) return false;
  if (visual_only && snapshot.application_highlight_known &&
      action_id.rfind("folder.", 0) != 0 &&
      action_id.rfind("urlcard.", 0) != 0 && action_id.rfind("window.", 0) != 0 &&
      action_id.rfind("stat.", 0) != 0)
    return snapshot.application_highlight_id == action_id;
  if (std::find(snapshot.focused_action_ids.begin(), snapshot.focused_action_ids.end(), action_id) !=
      snapshot.focused_action_ids.end()) return true;
  return action_id == "com.apple.finder" &&
    companion_focus_application_id(snapshot.focused_action_id) == action_id;
}

inline bool companion_action_focused(const std::string &action_id, bool visual_only = false) {
  return companion_action_focused(companion_runtime_snapshot(), action_id, visual_only);
}

inline void companion_set_focused_application(std::string application_id) {
  if (application_id.size() > 96) application_id.clear();
  const std::string focused_application_id = companion_focus_application_id(application_id);
  companion_set_focused_action(std::move(application_id));
  std::vector<CompanionActionResultHandler> successes;
  {
    auto &pending = companion_pending_actions();
    std::lock_guard<std::mutex> lock(pending.mutex);
    for (auto &entry : pending.entries) {
      if (!entry.expected_application_id.empty() &&
          entry.expected_application_id == focused_application_id) {
        successes.push_back(std::move(entry.success));
        companion_clear_pending_action(entry);
      }
    }
  }
  for (auto &success : successes) {
    if (success) success();
  }
  companion_request_card_refresh();
}

inline bool companion_application_focused(const std::string &application_id) {
  return companion_action_focused(application_id);
}

inline bool companion_action_active(const std::string &action_id, bool visual_only = false) {
  return companion_action_focused(action_id, visual_only);
}

inline uint32_t companion_next_request_number() {
  return ++companion_runtime_service().request_number;
}

inline void companion_set_connected(bool connected) {
  companion_runtime_service().set_connected(connected);
  if (!connected) {
    companion_cancel_action_result();
    companion_subpage_return_requested().store(true);
  }
  auto &connection_changed = companion_connection_changed_handler();
  if (connection_changed) connection_changed(connected);
  for (const auto &observer : companion_connection_changed_observers())
    if (observer) observer(connected);
}

inline void register_companion_action_sender(CompanionActionSender sender) {
  companion_action_sender() = std::move(sender);
}

inline void register_companion_url_sender(CompanionUrlSender sender) {
  companion_url_sender() = std::move(sender);
}

inline void register_companion_value_sender(CompanionValueSender sender) {
  companion_value_sender() = std::move(sender);
}

inline void register_companion_pairing_provider(CompanionPairingProvider provider) {
  companion_pairing_provider() = std::move(provider);
}

inline std::vector<std::string> companion_shortcut_parts(const std::string &action_id) {
  static const std::string prefix = "shortcut.";
  if (action_id.rfind(prefix, 0) != 0 || action_id.size() <= prefix.size() || action_id.size() > 96) return {};
  std::vector<std::string> parts;
  size_t start = prefix.size();
  while (start <= action_id.size()) {
    const size_t end = action_id.find('+', start);
    parts.push_back(action_id.substr(start, end == std::string::npos ? std::string::npos : end - start));
    if (end == std::string::npos) break;
    start = end + 1;
  }
  return parts;
}

inline bool companion_shortcut_action_valid(const std::string &action_id) {
  if (action_id == "shortcut.tab" || action_id == "shortcut.escape") return true;
  const auto parts = companion_shortcut_parts(action_id);
  if (parts.size() < 2 || parts.size() > 5) return false;
  bool command = false, control = false, option = false, shift = false;
  for (size_t i = 0; i + 1 < parts.size(); i++) {
    const auto &part = parts[i];
    if (part == "command" && !command) command = true;
    else if (part == "control" && !control) control = true;
    else if (part == "option" && !option) option = true;
    else if (part == "shift" && !shift) shift = true;
    else return false;
  }
  if (!command && !control && !option) return false;
  const auto &key = parts.back();
  if (key.size() == 1 && ((key[0] >= 'a' && key[0] <= 'z') || (key[0] >= '0' && key[0] <= '9'))) return true;
  static const std::vector<std::string> named_keys{
    "space", "enter", "tab", "escape", "delete", "forwarddelete",
    "left", "right", "up", "down", "home", "end", "pageup", "pagedown",
    "keycomma", "keyperiod", "keyslash", "keysemicolon", "keyquote", "keybackslash", "keyminus",
    "keyequal", "keybracketleft", "keybracketright", "keybackquote",
  };
  if (std::find(named_keys.begin(), named_keys.end(), key) != named_keys.end()) return true;
  if (key.size() >= 2 && key[0] == 'f') {
    const int number = std::atoi(key.c_str() + 1);
    return number >= 1 && number <= 20 && key == "f" + std::to_string(number);
  }
  return false;
}

inline std::string companion_shortcut_label(const std::string &action_id) {
  if (!companion_shortcut_action_valid(action_id)) return "";
  const auto parts = companion_shortcut_parts(action_id);
  std::string label;
  for (size_t i = 0; i + 1 < parts.size(); i++) {
    if (parts[i] == "command") label += "\U000F0633";
    else if (parts[i] == "control") label += "\U000F0634";
    else if (parts[i] == "option") label += "\U000F0635";
    else if (parts[i] == "shift") label += "\U000F0636";
  }
  std::string key = parts.back();
  if (key.size() == 1 && key[0] >= 'a' && key[0] <= 'z') key[0] = static_cast<char>(key[0] - 'a' + 'A');
  else if (key == "space") key = espdesktop_i18n("Space");
  else if (key == "tab") key = espdesktop_i18n("Tab");
  else if (key == "delete") key = espdesktop_i18n("Delete");
  else if (key == "home") key = espdesktop_i18n_key("keyboard_home");
  else if (key == "end") key = espdesktop_i18n("End");
  else if (key == "enter") key = espdesktop_i18n("Return");
  else if (key == "escape") key = espdesktop_i18n("Esc");
  else if (key == "forwarddelete") key = espdesktop_i18n("Forward Delete");
  else if (key == "left") key = "\U000F004D";
  else if (key == "right") key = "\U000F0054";
  else if (key == "up") key = "\U000F005D";
  else if (key == "down") key = "\U000F0045";
  else if (key == "pageup") key = espdesktop_i18n("Page Up");
  else if (key == "pagedown") key = espdesktop_i18n("Page Down");
  else if (key == "keycomma") key = ",";
  else if (key == "keyperiod") key = ".";
  else if (key == "keyslash") key = "/";
  else if (key == "keysemicolon") key = ";";
  else if (key == "keyquote") key = "'";
  else if (key == "keybackslash") key = "\\";
  else if (key == "keyminus") key = "-";
  else if (key == "keyequal") key = "=";
  else if (key == "keybracketleft") key = "[";
  else if (key == "keybracketright") key = "]";
  else if (key == "keybackquote") key = "`";
  else if (!key.empty()) key[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(key[0])));
  return label + key;
}

inline bool companion_window_action_valid(const std::string &action_id) {
  return companion_window_capability(action_id) != nullptr;
}

inline std::string companion_window_action_label(const std::string &action_id) {
  const auto *capability = companion_window_capability(action_id);
  return capability ? espdesktop_i18n(capability->label) : "";
}

inline bool companion_action_available(const CompanionRuntimeSnapshot &snapshot, const std::string &action_id) {
  if (action_id.empty()) return false;
  if (!snapshot.connected) return false;
  if (companion_shortcut_action_valid(action_id)) return snapshot.keyboard_actions_supported;
  if (companion_window_action_valid(action_id)) {
    return std::find(snapshot.window_actions.begin(), snapshot.window_actions.end(), action_id) !=
           snapshot.window_actions.end();
  }
  return std::any_of(snapshot.actions.begin(), snapshot.actions.end(), [&action_id](const CompanionAction &action) {
    return action.id == action_id;
  });
}

inline bool companion_action_available(const std::string &action_id) {
  return companion_action_available(companion_runtime_snapshot(), action_id);
}

inline std::string companion_encoded_url(const std::string &url_config) {
  static const std::string prefix = "url.";
  if (url_config.rfind(prefix, 0) != 0 || url_config.size() <= prefix.size()) return "";
  const std::string encoded = url_config.substr(prefix.size());
  if (encoded.size() > 128 ||
      (encoded.rfind("http%3A%2F%2F", 0) != 0 && encoded.rfind("https%3A%2F%2F", 0) != 0)) return "";
  if (!std::all_of(encoded.begin(), encoded.end(), [](unsigned char byte) {
        return byte >= 0x21 && byte <= 0x7e && byte != '|' && byte != ',';
      })) return "";
  return encoded;
}

inline std::string companion_default_action_label(const std::string &action_id,
                                                  const std::string &url_config = "",
                                                  const CompanionRuntimeSnapshot *state = nullptr) {
  const std::string shortcut_label = companion_shortcut_label(action_id);
  if (!shortcut_label.empty()) return shortcut_label;
  const std::string window_label = companion_window_action_label(action_id);
  if (!window_label.empty()) return window_label;
  if (!companion_encoded_url(url_config).empty()) return espdesktop_i18n("Open URL");
  const auto owned = state ? CompanionRuntimeSnapshot{} : companion_runtime_snapshot();
  const auto &snapshot = state ? *state : owned;
  const auto action = std::find_if(snapshot.actions.begin(), snapshot.actions.end(),
    [&action_id](const CompanionAction &candidate) { return candidate.id == action_id; });
  if (action != snapshot.actions.end() && !action->label.empty()) return action->label;
  return action_id.empty() ? espdesktop_i18n("Mac App") : action_id;
}

inline std::string companion_default_action_label_with_fallback(
    const std::string &action_id, const std::string &url_config,
    std::string &resolved_label, const CompanionRuntimeSnapshot *snapshot = nullptr) {
  std::string label = companion_default_action_label(action_id, url_config, snapshot);
  if (label == action_id && !resolved_label.empty()) return resolved_label;
  resolved_label = label;
  return label;
}

inline bool companion_metric_card_should_disable(bool connected, bool preserve_navigation) {
  return !connected && !preserve_navigation;
}

inline bool companion_url_available(const std::string &app_id, const std::string &url_config) {
  (void) app_id;  // URL cards use the system default and do not need an approved app.
  return companion_connected() && !companion_encoded_url(url_config).empty();
}

inline std::string companion_url_card_focus_id(const std::string &url_config) {
  const std::string encoded = companion_encoded_url(url_config);
  if (encoded.empty()) return "";
  uint64_t hash = UINT64_C(14695981039346656037);
  for (unsigned char byte : encoded) {
    hash ^= byte;
    hash *= UINT64_C(1099511628211);
  }
  char result[32];
  snprintf(result, sizeof(result), "urlcard.%016llx", static_cast<unsigned long long>(hash));
  return result;
}

inline bool companion_card_focus_allowed(const std::string &url_config) {
  return url_config.empty() || !companion_encoded_url(url_config).empty();
}

#ifdef USE_LVGL
struct CompanionCardRef {
  lv_obj_t *button = nullptr;
  lv_obj_t *text_label = nullptr;
  std::string action_id;
  std::string url_config;
  lv_obj_t *value_label = nullptr;
  lv_obj_t *unit_label = nullptr;
  std::string metric_key;
  std::string metric_unit;
  int precision{0};
  bool metric_description{true};
  bool preserve_navigation{false};
  bool dynamic_default_label{false};
  std::string resolved_default_label;
  bool show_focus = true;
  bool focus_draw_seen = false;
  bool last_drawn_focus = false;
  std::string required_focus_id{};
};

struct CompanionSliderRef {
  lv_obj_t *slider = nullptr;
  lv_obj_t *icon_label = nullptr;
  std::string control_id;
  bool has_icon_on = false;
  const char *icon_off = nullptr;
  const char *icon_on = nullptr;
};

inline void companion_apply_card_focus(lv_obj_t *button, const std::string &action_id,
                                       const std::string &url_config = "",
                                       bool show_focus = true,
                                       const CompanionRuntimeSnapshot *snapshot = nullptr) {
  if (!button) return;
  // A URL card targets a page inside the app, but Companion only reports the
  // frontmost app. Keep URL cards from appearing active for the wrong page.
  bool active = false;
  if (show_focus && companion_card_focus_allowed(url_config)) {
    const std::string focus_id = url_config.empty() ? action_id : companion_url_card_focus_id(url_config);
    active = snapshot ? companion_action_focused(*snapshot, focus_id, true)
                      : companion_action_active(focus_id, true);
  }
  // Focus is a background visual update, never a prerequisite for a touch
  // action. Avoid resyncing descendants/redrawing cards on unchanged snapshots.
  if (lv_obj_has_state(button, LV_STATE_CHECKED) != active) {
    set_card_checked_state(button, active);
    ESP_LOGD("companion_focus", "Card %s highlight=%d at=%u", action_id.c_str(), active, unsigned(esphome::millis()));
  }
}

struct CompanionMuteRef {
  lv_obj_t *button = nullptr;
  std::string control_id;
  lv_obj_t *icon_label = nullptr;
  const char *icon_unmuted = nullptr;
  const char *icon_muted = nullptr;
};

struct CompanionViewRegistry {
  std::vector<CompanionCardRef> cards;
  std::vector<CompanionSliderRef> sliders;
  std::vector<CompanionMuteRef> mutes;
  std::string pending_focus_frame;
};

inline CompanionViewRegistry &companion_view_registry() {
  auto *core = espdesktop::active_espdesktop_app_core();
  if (core == nullptr) std::abort();
  return core->companion_view_service<CompanionViewRegistry>();
}

inline std::vector<CompanionCardRef> &companion_card_refs() {
  return companion_view_registry().cards;
}

inline std::vector<CompanionSliderRef> &companion_slider_refs() {
  return companion_view_registry().sliders;
}

inline void companion_forget_card(lv_obj_t *button) {
  auto &refs = companion_card_refs();
  refs.erase(std::remove_if(refs.begin(), refs.end(), [button](const CompanionCardRef &ref) {
    return ref.button == button;
  }), refs.end());
}

inline void companion_card_deleted(lv_event_t *event) {
  companion_forget_card(static_cast<lv_obj_t *>(lv_event_get_target(event)));
}

inline void companion_card_focus_drawn(lv_event_t *event) {
  auto *button = static_cast<lv_obj_t *>(lv_event_get_target(event));
  for (auto &ref : companion_card_refs()) {
    if (ref.button != button || !ref.metric_key.empty()) continue;
    const bool active = lv_obj_has_state(button, LV_STATE_CHECKED);
    if (!ref.focus_draw_seen || ref.last_drawn_focus != active) {
      ref.focus_draw_seen = true;
      ref.last_drawn_focus = active;
      ESP_LOGD("companion_focus", "Card %s drawn=%d at=%u", ref.action_id.c_str(), active, unsigned(esphome::millis()));
      if (active && ref.action_id == companion_runtime_service().highlighted_application())
        companion_view_registry().pending_focus_frame = ref.action_id;
    }
    return;
  }
}

// Called after the display driver confirms its completed frame is on scanout.
inline void companion_focus_frame_presented() {
  auto &pending = companion_view_registry().pending_focus_frame;
  if (pending.empty()) return;
  ESP_LOGD("companion_focus", "Frame %s presented at=%u", pending.c_str(), unsigned(esphome::millis()));
  pending.clear();
}

inline void companion_slider_deleted(lv_event_t *event) {
  lv_obj_t *slider = static_cast<lv_obj_t *>(lv_event_get_target(event));
  auto &refs = companion_slider_refs();
  refs.erase(std::remove_if(refs.begin(), refs.end(), [slider](const CompanionSliderRef &ref) {
    return ref.slider == slider;
  }), refs.end());
}

inline void companion_track_slider(lv_obj_t *slider, const std::string &control_id,
                                   lv_obj_t *icon_label, bool has_icon_on,
                                   const char *icon_off, const char *icon_on) {
  if (!slider || !companion_volume_control_valid(control_id)) return;
  auto &refs = companion_slider_refs();
  auto existing = std::find_if(refs.begin(), refs.end(), [slider](const CompanionSliderRef &ref) {
    return ref.slider == slider;
  });
  if (existing != refs.end()) {
    existing->control_id = control_id;
    existing->icon_label = icon_label;
    existing->has_icon_on = has_icon_on;
    existing->icon_off = icon_off;
    existing->icon_on = icon_on;
  } else {
    refs.push_back({slider, icon_label, control_id, has_icon_on, icon_off, icon_on});
    lv_obj_add_event_cb(slider, companion_slider_deleted, LV_EVENT_DELETE, nullptr);
  }
  companion_request_card_refresh();
}

inline void companion_apply_mute_state(const CompanionMuteRef &ref,
                                       const CompanionRuntimeSnapshot &snapshot) {
  const auto value = std::find_if(snapshot.values.begin(), snapshot.values.end(),
    [&ref](const CompanionValue &candidate) { return candidate.id == ref.control_id; });
  const bool available = snapshot.connected && value != snapshot.values.end();
  const bool muted = available && value->value > 0;
  set_card_disabled_state(ref.button, !available);
  set_card_checked_state(ref.button, muted);
  const char *icon = muted ? ref.icon_muted : ref.icon_unmuted;
  if (icon && ref.icon_label && lv_obj_is_valid(ref.icon_label))
    lv_label_set_text(ref.icon_label, icon);
}

inline bool companion_erase_mute_ref(lv_obj_t *button) {
  auto &refs = companion_view_registry().mutes;
  const auto previous_size = refs.size();
  refs.erase(std::remove_if(refs.begin(), refs.end(), [button](const auto &ref) {
    return ref.button == button;
  }), refs.end());
  return refs.size() != previous_size;
}

inline void companion_mute_deleted(lv_event_t *event) {
  companion_erase_mute_ref(static_cast<lv_obj_t *>(lv_event_get_target(event)));
}

inline bool companion_forget_mute(lv_obj_t *button) {
  if (!companion_erase_mute_ref(button)) return false;
  lv_obj_remove_event_cb(button, companion_mute_deleted);
  return true;
}

inline void companion_track_mute(lv_obj_t *button, const std::string &control_id,
                                  lv_obj_t *icon_label = nullptr,
                                  const char *icon_unmuted = nullptr,
                                  const char *icon_muted = nullptr) {
  if (!button || !companion_mute_control_valid(control_id)) return;
  companion_forget_mute(button);
  companion_view_registry().mutes.push_back(
    {button, control_id, icon_label, icon_unmuted, icon_muted});
  lv_obj_add_event_cb(button, companion_mute_deleted, LV_EVENT_DELETE, nullptr);
  companion_request_card_refresh();
}

inline void companion_track_card(lv_obj_t *button, const std::string &action_id,
                                 const std::string &url_config = "",
                                 lv_obj_t *text_label = nullptr,
                                 bool dynamic_default_label = false,
                                 bool show_focus = true) {
  if (!button) return;
  auto &refs = companion_card_refs();
  auto existing = std::find_if(refs.begin(), refs.end(), [button](const CompanionCardRef &ref) {
    return ref.button == button;
  });
  if (existing != refs.end()) {
    if (companion_metric_key_valid(action_id) && !existing->metric_key.empty()) return;
    if (existing->action_id != action_id || existing->url_config != url_config) {
      existing->resolved_default_label.clear();
      existing->required_focus_id.clear();
    }
    existing->action_id = action_id;
    existing->url_config = url_config;
    existing->dynamic_default_label = dynamic_default_label;
    existing->show_focus = show_focus;
    if (dynamic_default_label) {
      (void) companion_default_action_label_with_fallback(
        action_id, url_config, existing->resolved_default_label);
    }
    // The periodic config tracker does not have the label pointer. Preserve
    // the pointer registered while the card was rendered so state updates can
    // continue replacing the Play/Pause label.
    if (text_label) existing->text_label = text_label;
    existing->metric_key.clear();
    existing->metric_unit.clear();
    existing->value_label = nullptr;
    existing->unit_label = nullptr;
    return;
  }
  std::string resolved_default_label;
  if (dynamic_default_label) {
    (void) companion_default_action_label_with_fallback(
      action_id, url_config, resolved_default_label);
  }
  refs.push_back({button, text_label, action_id, url_config, nullptr, nullptr, "", "", 0, false,
                  false, dynamic_default_label, resolved_default_label, show_focus});
  lv_obj_add_event_cb(button, companion_card_deleted, LV_EVENT_DELETE, nullptr);
  lv_obj_add_event_cb(button, companion_card_focus_drawn, LV_EVENT_DRAW_POST_END, nullptr);
}

inline void companion_track_metric_card(lv_obj_t *button, lv_obj_t *value_label,
                                        lv_obj_t *unit_label, const std::string &metric_key,
                                        const std::string &unit, int precision,
                                        bool preserve_navigation = false,
                                        bool metric_description = true) {
  if (!button || !companion_metric_key_valid(metric_key)) return;
  auto &refs = companion_card_refs();
  auto existing = std::find_if(refs.begin(), refs.end(), [button](const CompanionCardRef &ref) {
    return ref.button == button;
  });
  CompanionCardRef value{button, nullptr, "", "", value_label, unit_label, metric_key, unit,
                         std::max(0, std::min(2, precision)), metric_description, preserve_navigation};
  if (existing != refs.end()) {
    *existing = std::move(value);
  } else {
    refs.push_back(std::move(value));
    lv_obj_add_event_cb(button, companion_card_deleted, LV_EVENT_DELETE, nullptr);
  }
  companion_request_card_refresh();
}

inline bool companion_required_focus_ready(const std::string &required,
                                           const CompanionRuntimeSnapshot &snapshot) {
  return required.empty() || companion_action_focused(snapshot, required);
}

inline void companion_require_card_focus(lv_obj_t *button, const std::string &required) {
  for (auto &ref : companion_card_refs()) {
    if (ref.button != button) continue;
    ref.required_focus_id = required;
    const auto snapshot = companion_runtime_snapshot();
    const bool available = companion_action_available(snapshot, ref.action_id) &&
      companion_required_focus_ready(required, snapshot);
    if (lv_obj_has_state(button, LV_STATE_DISABLED) == available)
      set_card_disabled_state(button, !available);
    return;
  }
}

inline void companion_refresh_card_focus(const CompanionRuntimeSnapshot &snapshot) {
  for (auto &ref : companion_card_refs()) {
    if (!ref.button || !lv_obj_is_valid(ref.button) || !ref.metric_key.empty()) continue;
    if (!ref.required_focus_id.empty()) {
      const bool available = companion_action_available(snapshot, ref.action_id) &&
        companion_required_focus_ready(ref.required_focus_id, snapshot);
      if (lv_obj_has_state(ref.button, LV_STATE_DISABLED) == available)
        set_card_disabled_state(ref.button, !available);
    }
    companion_apply_card_focus(ref.button, ref.action_id, ref.url_config, ref.show_focus, &snapshot);
  }
}

inline void companion_refresh_cards_if_requested() {
  const bool full_refresh = companion_card_refresh_requested().exchange(false);
  const bool focus_refresh = companion_runtime_service().consume_focus_refresh_request();
  if (!full_refresh && !focus_refresh) return;
  auto &refs = companion_card_refs();
  const auto snapshot = companion_runtime_snapshot();
  if (!full_refresh) {
    companion_refresh_card_focus(snapshot);
    return;
  }
  for (auto it = refs.begin(); it != refs.end();) {
    if (!it->button || !lv_obj_is_valid(it->button)) {
      it = refs.erase(it);
      continue;
    }
    if (!it->metric_key.empty()) {
      float value = NAN;
      const bool available = companion_metric_value(snapshot, it->metric_key, value);
      if (it->value_label) {
        char buffer[32];
        if (!available) snprintf(buffer, sizeof(buffer), "--");
        else if (it->precision == 2) snprintf(buffer, sizeof(buffer), "%.2f", value);
        else if (it->precision == 1) snprintf(buffer, sizeof(buffer), "%.1f", value);
        else snprintf(buffer, sizeof(buffer), "%.0f", value);
        std::string label = it->metric_key.rfind("stat.ip_address", 0) == 0
          ? companion_network_address(snapshot, it->metric_key) : buffer;
        if (available && !it->unit_label) {
          label += (it->metric_unit == "%" ? "" : " ") + it->metric_unit;
          const char *suffix = it->metric_description ? companion_metric_suffix_key(it->metric_key) : "";
          if (*suffix) label += " " + std::string(espdesktop_i18n_key(suffix));
        }
        if (normalize_display_text(label) != lv_label_get_text(it->value_label))
          lv_label_set_display_text(it->value_label, label.c_str());
      }
      if (it->unit_label) {
        const std::string unit = available ? it->metric_unit : "";
        if (unit != lv_label_get_text(it->unit_label))
          lv_label_set_display_text(it->unit_label, unit.c_str());
      }
      // Match the unavailable state used by other cards when their backing
      // connection is offline. A missing optional metric (for example,
      // battery on a desktop Mac) remains enabled while Companion is online.
      const bool disabled = companion_metric_card_should_disable(snapshot.connected, it->preserve_navigation);
      if (lv_obj_has_state(it->button, LV_STATE_DISABLED) != disabled)
        set_card_disabled_state(it->button, disabled);
      ++it;
      continue;
    }
    if (it->dynamic_default_label && it->text_label && lv_obj_is_valid(it->text_label)) {
      // A disconnected Companion temporarily has no action catalogue. Keep
      // the friendly name seen before the outage instead of showing its ID.
      const std::string label = companion_default_action_label_with_fallback(
        it->action_id, it->url_config, it->resolved_default_label, &snapshot);
      if (normalize_display_text(label) != lv_label_get_text(it->text_label))
        lv_label_set_display_text(it->text_label, label.c_str());
    }
    const bool action_available = it->url_config.empty()
      ? companion_action_available(snapshot, it->action_id)
      : companion_url_available(it->action_id, it->url_config);
    const bool available = action_available && companion_required_focus_ready(it->required_focus_id, snapshot);

    if (lv_obj_has_state(it->button, LV_STATE_DISABLED) == available)
      set_card_disabled_state(it->button, !available);
    companion_apply_card_focus(it->button, it->action_id, it->url_config, it->show_focus, &snapshot);
    ++it;
  }
  for (const auto &ref : companion_view_registry().mutes)
    companion_apply_mute_state(ref, snapshot);
  auto &sliders = companion_slider_refs();
  for (auto it = sliders.begin(); it != sliders.end();) {
    if (!it->slider || !lv_obj_is_valid(it->slider)) {
      it = sliders.erase(it);
      continue;
    }
    const auto value = std::find_if(snapshot.values.begin(), snapshot.values.end(),
      [it](const CompanionValue &candidate) { return candidate.id == it->control_id; });
    const bool available = snapshot.connected && value != snapshot.values.end();
    if (available) {
      lv_slider_set_value(it->slider, value->value, LV_ANIM_OFF);
      lv_obj_send_event(it->slider, LV_EVENT_VALUE_CHANGED, nullptr);
      if (it->has_icon_on && it->icon_label && lv_obj_is_valid(it->icon_label)) {
        lv_label_set_text(
          it->icon_label, value->value > 0 ? it->icon_on : it->icon_off);
      }
      lv_obj_clear_state(it->slider, LV_STATE_DISABLED);
    } else {
      lv_obj_add_state(it->slider, LV_STATE_DISABLED);
    }
    ++it;
  }
}
#else
inline void companion_track_card(void *, const std::string &, const std::string & = "",
                                 void * = nullptr, bool = false, bool = true) {}
inline void companion_track_metric_card(void *, void *, void *, const std::string &,
                                        const std::string &, int) {}
inline void companion_apply_card_focus(void *, const std::string &, const std::string & = "", bool = true) {}
inline bool companion_forget_mute(void *) { return false; }
inline void companion_track_mute(void *, const std::string &, void * = nullptr,
                                 const char * = nullptr, const char * = nullptr) {}
inline void companion_track_slider(void *, const std::string &, void *, bool,
                                   const char *, const char *) {}
inline void companion_refresh_cards_if_requested() {}
inline void companion_require_card_focus(void *, const std::string &) {}
#endif

inline bool companion_toggle_mute(const std::string &control_id) {
  int value = 0;
  if (!companion_mute_control_valid(control_id) || !companion_connected() ||
      !companion_value(control_id, value) || !companion_value_sender()) return false;
  return companion_value_sender()(control_id, value > 0 ? 0 : 100,
                                  "mute-" + std::to_string(companion_next_request_number()));
}

inline bool invoke_companion_action(const std::string &action_id,
                                    const std::string &request_id,
                                    const std::string &folder_open_behavior = "new_window") {
  if (!companion_action_available(action_id) || !companion_action_sender()) return false;
  return companion_action_sender()(action_id, request_id, folder_open_behavior);
}

inline bool invoke_companion_action_for_app(const std::string &action_id,
                                             const std::string &request_id,
                                             const std::string &required_focus_id,
                                             const std::string &folder_open_behavior = "new_window") {
  // Never use the early visual highlight to authorize app-specific keys.
  if (!required_focus_id.empty() && !companion_action_focused(required_focus_id)) return false;
  return invoke_companion_action(action_id, request_id, folder_open_behavior);
}

inline bool invoke_companion_url(const std::string &url_config,
                                 const std::string &request_id,
                                 bool new_window = false) {
  const std::string encoded_url = companion_encoded_url(url_config);
  if (encoded_url.empty() || !companion_connected() || !companion_url_sender()) return false;
  return companion_url_sender()(encoded_url, request_id, new_window);
}

inline bool invoke_companion_value(const std::string &control_id, int value,
                                   const std::string &request_id) {
  if (!companion_connected() || !companion_volume_control_valid(control_id) ||
      value < 0 || value > 100 || !companion_value_sender() ||
      (companion_mute_control_valid(control_id) && value != 0 && value != 100)) return false;
  return companion_value_sender()(control_id, value, request_id);
}

#ifdef USE_WEBSERVER
inline bool companion_authorize_web_request(
    esphome::web_server_idf::AsyncWebServerRequest *request) {
#ifdef USE_WEBSERVER_AUTH
  auto &context = espdesktop::configuration::panel_config_http_context();
  if (!espdesktop::configuration::panel_config_http_context_ready()) {
    httpd_req_t *raw_request = *request;
    httpd_resp_set_status(raw_request, "503 Service Unavailable");
    httpd_resp_set_type(raw_request, "text/plain");
    httpd_resp_send(raw_request, "Web authentication is starting",
                    HTTPD_RESP_USE_STRLEN);
    return false;
  }
  if (!request->authenticate(context.username, context.password)) {
    request->requestAuthentication();
    return false;
  }
#endif
  return true;
}

inline std::string companion_json_escape(const std::string &value) {
  std::string result;
  result.reserve(value.size() + 8);
  for (char ch : value) {
    switch (ch) {
      case '\\': result += "\\\\"; break;
      case '\"': result += "\\\""; break;
      case '\n': result += "\\n"; break;
      case '\r': result += "\\r"; break;
      case '\t': result += "\\t"; break;
      default:
        if (static_cast<unsigned char>(ch) >= 0x20) result.push_back(ch);
    }
  }
  return result;
}

class CompanionActionsHandler : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_GET) return false;
    char url_buf[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    const auto url = request->url_to(url_buf);
    return url == "/companion/actions" || url == "/companion/networks" ||
           url == "/companion/definitions";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    if (!companion_authorize_web_request(request)) return;
    std::string json = "[";
    bool first = true;
    char url_buf[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    const std::string requested_url = request->url_to(url_buf);
    const bool networks = requested_url == "/companion/networks";
    const bool definitions = requested_url == "/companion/definitions";
    auto &runtime = companion_runtime_service();
    const bool connected = runtime.connected();
    if (definitions) {
      constexpr size_t page_size = 4;
      constexpr size_t maximum_pages = 64;
      size_t page = 0;
      httpd_req_t *req = *request;
      char query[64] = {};
      char page_text[16] = {};
      if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK &&
          httpd_query_key_value(query, "page", page_text, sizeof(page_text)) == ESP_OK) {
        if (page_text[0] == '\0') {
          httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid catalogue page");
          return;
        }
        for (const char *digit = page_text; *digit; ++digit) {
          if (*digit < '0' || *digit > '9' || page >= maximum_pages) {
            httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid catalogue page");
            return;
          }
          page = page * 10 + static_cast<size_t>(*digit - '0');
        }
      }
      if (page >= maximum_pages) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid catalogue page");
        return;
      }
      bool definitions_connected = false;
      bool has_more = false;
      const auto entries = runtime.remote_definitions_page(page * page_size, page_size,
                                                           definitions_connected, has_more);
      json = "{\"page\":" + std::to_string(page) + ",\"hasMore\":" +
        (has_more ? "true" : "false") + ",\"definitions\":[";
      if (definitions_connected) {
        for (const auto &definition : entries) {
          if (!first) json += ",";
          first = false;
          json += "{\"kind\":\"" + companion_json_escape(definition.kind) +
            "\",\"definition\":" + definition.json + "}";
        }
      }
      json += "]}";
    } else if (connected && networks) {
      const auto metrics = runtime.system_metrics();
      for (const auto &network : metrics.network_interfaces) {
        if (!first) json += ",";
        first = false;
        json += "{\"id\":\"" + companion_json_escape(network.id) +
          "\",\"label\":\"" + companion_json_escape(network.label) + "\"}";
      }
    }
    if (connected && !networks && !definitions) {
      for (const auto &action : runtime.actions()) {
        if (!first) json += ",";
        first = false;
        json += "{\"id\":\"" + companion_json_escape(action.id) +
          "\",\"label\":\"" + companion_json_escape(action.label) + "\"";
#ifdef USE_COMPANION
        // The browser already polls this catalogue. Include cache freshness so
        // updated icons refresh open previews without downloading unchanged pixels.
        std::array<uint8_t, 32> icon_hash{};
        if (esphome::companion::app_icon_store().hash_for(action.id, &icon_hash)) {
          static constexpr char digits[] = "0123456789abcdef";
          std::string encoded_hash;
          encoded_hash.reserve(icon_hash.size() * 2);
          for (const uint8_t byte : icon_hash) {
            encoded_hash += digits[byte >> 4];
            encoded_hash += digits[byte & 0x0F];
          }
          json += ",\"iconHash\":\"" + encoded_hash + "\"";
        }
#endif
        json += "}";
      }
    }
    if (!definitions) json += "]";
    httpd_req_t *req = *request;
    httpd_resp_set_status(req, "200 OK");
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_send(req, json.c_str(), HTTPD_RESP_USE_STRLEN);
  }
};

class CompanionFocusTargetsHandler final : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_POST) return false;
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->url_to(path) == "/companion/focus-targets";
  }
  size_t maximumBodySize() const override { return body_.size(); }
  bool canReceiveBody(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    received_ = expected_ = 0;
    valid_ = companion_authorize_web_request(request);
    return valid_;
  }
  void handleBody(esphome::web_server_idf::AsyncWebServerRequest *, uint8_t *data,
                  size_t len, size_t index, size_t total) override {
    if (index == 0) { received_ = 0; expected_ = total; valid_ = total > 0 && total <= body_.size(); }
    if (!valid_ || data == nullptr || index != received_ || len > body_.size() - received_) { valid_ = false; return; }
    std::memcpy(body_.data() + received_, data, len);
    received_ += len;
  }
  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    if (!companion_authorize_web_request(request)) return;
    const auto content_type = request->get_header("Content-Type");
    std::vector<CompanionURLFocusTarget> targets;
    const bool parsed = content_type.has_value() && *content_type == "application/json" &&
      valid_ && received_ == expected_ && esphome::json::parse_json(body_.data(), received_, [&](JsonObject root) {
        if (!root["targets"].is<JsonArrayConst>()) return false;
        const JsonArrayConst items = root["targets"].as<JsonArrayConst>();
        if (items.size() > 64) return false;
        for (JsonVariantConst value : items) {
          if (!value.is<JsonObjectConst>()) return false;
          const JsonObjectConst item = value.as<JsonObjectConst>();
          if (!item["id"].is<const char *>() || !item["url"].is<const char *>()) return false;
          const std::string id = item["id"].as<const char *>();
          const std::string url = item["url"].as<const char *>();
          if (!companion_url_focus_target_valid(id, url)) return false;
          targets.push_back({id, url});
        }
        return true;
      });
    valid_ = false;
    httpd_req_t *raw = *request;
    if (!parsed) { httpd_resp_send_err(raw, HTTPD_400_BAD_REQUEST, "Invalid Companion focus targets"); return; }
    companion_set_focus_registrations(std::move(targets));
    httpd_resp_set_type(raw, "application/json");
    httpd_resp_set_hdr(raw, "Cache-Control", "no-store");
    httpd_resp_send(raw, "{\"saved\":true}", HTTPD_RESP_USE_STRLEN);
  }
 private:
  std::array<uint8_t, 16384> body_{};
  size_t received_{0}, expected_{0};
  bool valid_{false};
};

inline std::string companion_pairing_json(const CompanionPairingSnapshot &snapshot) {
  const std::string pairing_code = !snapshot.paired && snapshot.active
      ? snapshot.pairing_code : "";
  return std::string("{\"available\":") + (snapshot.available ? "true" : "false") +
    ",\"active\":" + (snapshot.active ? "true" : "false") +
    ",\"paired\":" + (snapshot.paired ? "true" : "false") +
    ",\"connected\":" + (snapshot.connected ? "true" : "false") +
    ",\"expires_in_seconds\":" + std::to_string(snapshot.expires_in_seconds) +
    ",\"port\":" + std::to_string(snapshot.port) +
    ",\"system_metrics_generation\":" + std::to_string(snapshot.system_metrics_generation) +
    ",\"pairing_code\":\"" + companion_json_escape(pairing_code) + "\",\"mdns_name\":\"" +
    companion_json_escape(snapshot.mdns_name) + "\"}";
}

class CompanionPairingHandler : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_GET) return false;
    char url_buf[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->url_to(url_buf) == "/companion/pairing";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    const auto result = companion_pairing_status(
      companion_authorize_web_request(request),
      [] { return companion_pairing_provider() ? companion_pairing_provider()() : CompanionPairingSnapshot{}; },
      [] {
        auto &begin = companion_runtime_service().begin_pairing;
        if (begin) begin();
      });
    if (!result) return;
    const auto &snapshot = *result;
    const std::string json = companion_pairing_json(snapshot);
    httpd_req_t *req = *request;
    httpd_resp_set_status(req, snapshot.available ? "200 OK" : "404 Not Found");
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_send(req, json.c_str(), HTTPD_RESP_USE_STRLEN);
  }
};

class CompanionPairingResetHandler : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_POST) return false;
    char url_buf[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->url_to(url_buf) == "/companion/pairing/reset";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    if (!companion_authorize_web_request(request)) return;
    auto &revoke = companion_runtime_service().revoke_pairing;
    if (!revoke || !companion_pairing_provider() || !companion_pairing_provider()().available) {
      httpd_req_t *raw_request = *request;
      httpd_resp_set_status(raw_request, "404 Not Found");
      httpd_resp_set_type(raw_request, "text/plain");
      httpd_resp_send(raw_request, "Companion pairing is unavailable", HTTPD_RESP_USE_STRLEN);
      return;
    }
    revoke();
    httpd_req_t *raw_request = *request;
    httpd_resp_set_status(raw_request, "200 OK");
    httpd_resp_set_type(raw_request, "application/json");
    httpd_resp_set_hdr(raw_request, "Cache-Control", "no-store");
    httpd_resp_send(raw_request, "{\"reset\":true}", HTTPD_RESP_USE_STRLEN);
  }
};

class CompanionAppIconCacheClearHandler : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_POST) return false;
    char url_buf[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->url_to(url_buf) == "/companion/app-icons/clear";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    if (!companion_authorize_web_request(request)) return;
    auto &clear_cache = companion_runtime_service().clear_app_icon_cache;
    const bool cleared = clear_cache && clear_cache();
    httpd_req_t *raw_request = *request;
    httpd_resp_set_status(raw_request, cleared ? "200 OK" : "503 Service Unavailable");
    httpd_resp_set_type(raw_request, "application/json");
    httpd_resp_set_hdr(raw_request, "Cache-Control", "no-store");
    const char *body = cleared ? "{\"cleared\":true}" : "{\"cleared\":false}";
    httpd_resp_send(raw_request, body, HTTPD_RESP_USE_STRLEN);
  }
};

inline void register_companion_actions_endpoint(
    esphome::web_server_idf::AsyncWebServer &server) {
  static bool registered = false;
  if (registered) return;
  server.addHandler(new CompanionActionsHandler());
  server.addHandler(new CompanionFocusTargetsHandler());
  server.addHandler(new CompanionPairingHandler());
  server.addHandler(new CompanionPairingResetHandler());
  server.addHandler(new CompanionAppIconCacheClearHandler());
  registered = true;
}

inline void register_companion_actions_endpoint() {
  auto *server = esphome::web_server_idf::global_async_web_server();
  if (server) register_companion_actions_endpoint(*server);
}
#else
inline void register_companion_actions_endpoint() {}
#endif
