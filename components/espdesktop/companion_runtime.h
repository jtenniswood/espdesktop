#pragma once

// Companion-owned runtime state. UI/card code consumes immutable snapshots and
// asks this service to perform state transitions; it never owns connection or
// catalogue state itself.

#include <algorithm>
#include <array>
#include <functional>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

// Folder focus belongs to Finder; switching directories must keep its subpage open.
inline std::string companion_focus_application_id(const std::string &action_id) {
  if (action_id.rfind("urlcard.", 0) == 0) return "";
  return action_id.rfind("folder.", 0) == 0 ? "com.apple.finder" : action_id;
}

struct CompanionAction {
  std::string id;
  std::string label;
};

struct CompanionValue {
  std::string id;
  int value{0};
};

enum class CompanionPlaybackState : uint8_t {
  UNAVAILABLE = 0,
  STOPPED,
  PAUSED,
  PLAYING,
};

struct CompanionNowPlayingSnapshot {
  uint32_t generation{0};
  CompanionPlaybackState playback_state{CompanionPlaybackState::UNAVAILABLE};
  std::string source_application_id;
  std::string source_application_name;
  std::string content_id;
  std::string title;
  std::string artist;
  std::string album;
  float duration{0.0f};
  float position{0.0f};
  float playback_rate{0.0f};
  bool artwork_follows{false};
};

struct CompanionStorageDevice {
  std::string id;
  std::string label;
  float usage_percent{NAN};
};

struct CompanionNetworkInterface {
  std::string id;
  std::string label;
  std::string address;
};

struct CompanionSystemMetricsSnapshot {
  uint32_t generation{0};
  float cpu_usage_percent{NAN};
  float memory_usage_percent{NAN};
  float storage_usage_percent{NAN};
  float battery_percent{NAN};
  float network_throughput_kbps{NAN};
  std::vector<CompanionStorageDevice> storage_devices;
  std::vector<CompanionNetworkInterface> network_interfaces;
};

struct CompanionRemoteDefinition {
  std::string kind;
  std::string id;
  std::string icon_url;
  std::string json;
};

struct CompanionURLFocusTarget {
  std::string id;
  std::string url;
};

struct CompanionFocusTargetsState {
  bool connected{false};
  uint32_t generation{0};
};

inline constexpr size_t COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE = 128;

inline bool companion_remote_definition_capacity_available(const std::string &kind,
                                                           size_t application_count,
                                                           size_t web_app_count) {
  if (application_count + web_app_count >= COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE * 2)
    return false;
  if (kind == "application") return application_count < COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE;
  if (kind == "webapp") return web_app_count < COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE;
  return false;
}

struct CompanionRuntimeSnapshot {
  std::vector<CompanionAction> actions;
  std::vector<CompanionValue> values;
  std::string focused_action_id;
  std::vector<std::string> focused_action_ids;
  bool keyboard_actions_supported{false};
  std::vector<std::string> window_actions;
  bool connected{false};
  CompanionNowPlayingSnapshot now_playing;
  CompanionSystemMetricsSnapshot system_metrics;
  std::vector<CompanionRemoteDefinition> remote_definitions;
  std::vector<CompanionURLFocusTarget> url_focus_targets;
  std::vector<std::string> web_app_focus_ids;
  uint32_t url_focus_targets_generation{0};
};

inline std::string companion_network_address(const CompanionRuntimeSnapshot &snapshot,
                                              const std::string &key) {
  if (!snapshot.connected) return "--";
  const bool automatic = key == "stat.ip_address";
  if (!automatic && key.rfind("stat.ip_address:", 0) != 0) return "--";
  const auto id = automatic ? std::string() : key.substr(16);
  for (const auto &network : snapshot.system_metrics.network_interfaces)
    if ((automatic || network.id == id) && !network.address.empty()) return network.address;
  return "--";
}

using CompanionActionSender = std::function<bool(const std::string &, const std::string &, const std::string &)>;
using CompanionUrlSender = std::function<bool(const std::string &, const std::string &, const std::string &)>;
using CompanionValueSender = std::function<bool(const std::string &, int, const std::string &)>;
using CompanionActionResultHandler = std::function<void()>;
using CompanionConnectionChangedHandler = std::function<void(bool)>;

struct CompanionPendingAction {
  std::string request_id;
  std::string expected_application_id;
  uint32_t expires_at{0};
  CompanionActionResultHandler success;
};

struct CompanionPendingActions {
  static constexpr size_t MAX_PENDING = 8;
  std::mutex mutex;
  std::array<CompanionPendingAction, MAX_PENDING> entries{};
};

struct CompanionPairingSnapshot {
  bool available{false};
  bool active{false};
  bool paired{false};
  bool connected{false};
  uint32_t expires_in_seconds{0};
  uint16_t port{8443};
  uint32_t system_metrics_generation{0};
  std::string pairing_code;
  std::string mdns_name;
};

using CompanionPairingProvider = std::function<CompanionPairingSnapshot()>;

using CompanionNowPlayingHandler = std::function<void(const CompanionNowPlayingSnapshot &)>;
// Ownership of data transfers to the handler only when it returns true.
using CompanionArtworkHandler = std::function<bool(uint32_t generation, uint8_t *data, size_t size)>;

class CompanionRuntimeService {
 public:
  // Wiring callbacks and pending requests share this service's lifetime.
  CompanionPendingActions pending_actions;
  CompanionActionSender action_sender;
  CompanionUrlSender url_sender;
  CompanionValueSender value_sender;
  CompanionPairingProvider pairing_provider;
  std::function<void()> begin_pairing;
  std::function<void()> revoke_pairing;
  CompanionNowPlayingHandler now_playing_handler;
  CompanionConnectionChangedHandler connection_changed_handler;
  CompanionArtworkHandler artwork_handler;
  std::function<void()> focus_registrations_changed_handler;
  std::atomic<bool> subpage_return_requested{false};
  std::atomic<uint32_t> request_number{0};

  bool connected() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connected_;
  }

  CompanionNowPlayingSnapshot now_playing() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return now_playing_;
  }

  bool value(const std::string &id, int &result) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto item = std::find_if(values_.begin(), values_.end(),
      [&id](const CompanionValue &candidate) { return candidate.id == id; });
    if (item == values_.end()) return false;
    result = item->value;
    return true;
  }

  CompanionRuntimeSnapshot snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return {actions_, values_, focused_action_id_, focused_action_ids_, keyboard_actions_supported_, window_actions_,
            connected_, now_playing_, system_metrics_, remote_definitions_, url_focus_targets_,
            web_app_focus_ids_, url_focus_targets_generation_};
  }

  CompanionFocusTargetsState focus_targets_state() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return {connected_, url_focus_targets_generation_};
  }

  void set_focus_registrations(std::vector<CompanionURLFocusTarget> targets, std::vector<std::string> web_app_ids) {
    std::function<void()> changed_handler;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (targets.size() > 64) targets.resize(64);
      if (web_app_ids.size() > 64) web_app_ids.resize(64);
      if (targets.size() == url_focus_targets_.size() && web_app_ids == web_app_focus_ids_ && std::equal(targets.begin(), targets.end(), url_focus_targets_.begin(),
          [](const auto &a, const auto &b) { return a.id == b.id && a.url == b.url; })) return;
      url_focus_targets_ = std::move(targets);
      web_app_focus_ids_ = std::move(web_app_ids);
      ++url_focus_targets_generation_;
      if (url_focus_targets_generation_ == 0) url_focus_targets_generation_ = 1;
      changed_handler = focus_registrations_changed_handler;
    }
    if (changed_handler) changed_handler();
  }

  void set_remote_definitions(std::vector<CompanionRemoteDefinition> definitions) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (definitions.size() > 128) definitions.resize(128);
    remote_definitions_ = std::move(definitions);
    request_refresh_();
  }

  void set_actions(std::vector<CompanionAction> actions) {
    std::lock_guard<std::mutex> lock(mutex_);
    actions_ = std::move(actions);
    request_refresh_();
  }

  void set_window_actions(std::vector<std::string> actions) {
    std::lock_guard<std::mutex> lock(mutex_);
    window_actions_ = std::move(actions);
    request_refresh_();
  }

  void set_keyboard_actions_supported(bool supported) {
    std::lock_guard<std::mutex> lock(mutex_);
    keyboard_actions_supported_ = supported;
    request_refresh_();
  }

  void set_value(const std::string &control_id, int value) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto item = std::find_if(values_.begin(), values_.end(),
      [&control_id](const CompanionValue &candidate) { return candidate.id == control_id; });
    if (item == values_.end()) values_.push_back({control_id, value});
    else item->value = value;
    request_refresh_();
  }

  void remove_value(const std::string &control_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    values_.erase(std::remove_if(values_.begin(), values_.end(),
      [&control_id](const CompanionValue &candidate) { return candidate.id == control_id; }),
      values_.end());
    request_refresh_();
  }

  void set_now_playing(CompanionNowPlayingSnapshot snapshot) {
    std::lock_guard<std::mutex> lock(mutex_);
    now_playing_ = std::move(snapshot);
    request_refresh_();
  }

  void set_system_metrics(CompanionSystemMetricsSnapshot snapshot) {
    std::lock_guard<std::mutex> lock(mutex_);
    system_metrics_ = std::move(snapshot);
    request_refresh_();
  }

  bool set_focused_action(std::string action_id) {
    std::vector<std::string> identifiers;
    if (!action_id.empty()) identifiers.push_back(std::move(action_id));
    return set_focused_actions(std::move(identifiers));
  }

  bool set_focused_actions(std::vector<std::string> identifiers) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> accepted;
    for (auto &identifier : identifiers) {
      if (identifier.empty() || identifier.size() > 96 ||
          std::find(accepted.begin(), accepted.end(), identifier) != accepted.end()) continue;
      accepted.push_back(std::move(identifier));
    }
    const auto parent_id = [](const std::vector<std::string> &values) {
      for (const auto &value : values) {
        const std::string parent = companion_focus_application_id(value);
        if (!parent.empty()) return parent;
      }
      return std::string();
    };
    const std::string application_id = parent_id(accepted);
    const std::string auto_subpage_id = [&accepted, &application_id]() {
      for (const auto &value : accepted)
        if (value.rfind("webapp.", 0) == 0) return value;
      return application_id;
    }();
    const std::string previous_auto_subpage_id = focused_auto_subpage_id_;
    const bool should_return = connected_ && !previous_auto_subpage_id.empty() &&
      auto_subpage_id != previous_auto_subpage_id;
    if (accepted.empty() || !connected_) pending_auto_subpage_action_id_.clear();
    else if (previous_auto_subpage_id != auto_subpage_id) pending_auto_subpage_action_id_ = auto_subpage_id;
    focused_action_ids_ = std::move(accepted);
    focused_action_id_ = parent_id(focused_action_ids_);
    focused_auto_subpage_id_ = auto_subpage_id;
    request_refresh_();
    return should_return;
  }

  std::string pending_auto_subpage_action() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return pending_auto_subpage_action_id_;
  }

  bool consume_auto_subpage_action(const std::string &action_id) {
    if (action_id.empty()) return false;
    std::lock_guard<std::mutex> lock(mutex_);
    if (pending_auto_subpage_action_id_ != action_id) return false;
    pending_auto_subpage_action_id_.clear();
    return true;
  }

  void set_connected(bool connected) {
    std::lock_guard<std::mutex> lock(mutex_);
    connected_ = connected;
    if (connected_) keyboard_actions_supported_ = true;
    if (!connected_) {
      values_.clear();
      focused_action_id_.clear();
      focused_action_ids_.clear();
      focused_auto_subpage_id_.clear();
      pending_auto_subpage_action_id_.clear();
      keyboard_actions_supported_ = false;
      window_actions_.clear();
      now_playing_ = {};
      system_metrics_ = {};
    }
    request_refresh_();
  }

  void request_refresh() { request_refresh_(); }
  bool consume_refresh_request() { return refresh_requested_.exchange(false); }
  std::atomic<bool> &refresh_flag() { return refresh_requested_; }

 private:
  void request_refresh_() { refresh_requested_.store(true); }

  mutable std::mutex mutex_;
  std::vector<CompanionAction> actions_;
  std::vector<CompanionRemoteDefinition> remote_definitions_;
  std::vector<CompanionURLFocusTarget> url_focus_targets_;
  std::vector<std::string> web_app_focus_ids_;
  uint32_t url_focus_targets_generation_{0};
  std::vector<CompanionValue> values_;
  std::string focused_action_id_;
  std::vector<std::string> focused_action_ids_;
  std::string focused_auto_subpage_id_;
  std::string pending_auto_subpage_action_id_;
  bool keyboard_actions_supported_{false};
  std::vector<std::string> window_actions_;
  bool connected_{false};
  CompanionNowPlayingSnapshot now_playing_;
  CompanionSystemMetricsSnapshot system_metrics_;
  std::atomic<bool> refresh_requested_{false};
};
