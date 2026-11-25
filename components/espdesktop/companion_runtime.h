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
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "companion_shortcut_catalogue.h"
#include "companion_capabilities_generated.h"

enum class CompanionAppSubpageMode { FOCUS, CARD, MANUAL };

// Folder focus belongs to Finder; switching directories must keep its subpage open.
inline std::string companion_focus_application_id(const std::string &action_id) {
  if (action_id.rfind("urlcard.", 0) == 0) return "";
  return action_id.rfind("folder.", 0) == 0 ? "com.apple.finder" : action_id;
}

inline bool companion_reported_focus_matches(const std::string &requested,
    const std::string &focused, const std::vector<std::string> &identifiers) {
  return std::find(identifiers.begin(), identifiers.end(), requested) != identifiers.end() ||
      (requested == "com.apple.finder" && companion_focus_application_id(focused) == requested);
}

struct CompanionAction {
  std::string id;
  std::string label;
  OBSCardState obs_state{OBSCardState::unknown};
  std::string obs_detail{};
  std::optional<bool> obs_available{};
  std::optional<uint32_t> shortcut_color{};
  bool operator==(const CompanionAction &other) const {
    return id == other.id && label == other.label && obs_state == other.obs_state && obs_detail == other.obs_detail &&
      obs_available == other.obs_available && shortcut_color == other.shortcut_color;
  }
};

// Keep OBS and input-device entries from displacing existing Mac actions.
class CompanionCatalogueLimits {
 public:
  bool retain(std::string_view id, bool input_device) {
    const bool obs = id.rfind("obs.", 0) == 0;
    const bool obs_source = id == "obs.sources" || id.rfind("obs.source.", 0) == 0;
    auto &count = input_device ? inputs_ : obs_source ? obs_sources_ : obs ? obs_ : mac_;
    // 48 scene items, up to 48 visibility markers, and one list marker.
    const size_t limit = input_device ? 16 : obs_source ? 97 : 256;
    if (count >= limit) return false;
    ++count;
    return true;
  }

 private:
  size_t inputs_{0};
  size_t obs_{0};
  size_t obs_sources_{0};
  size_t mac_{0};
};

struct CompanionValue {
  std::string id;
  int value{0};
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

inline constexpr size_t COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE = 256;

inline bool companion_json_payload_valid(const std::string &value, size_t limit) {
  if (value.size() < 2 || value.size() > limit) return false;
  return std::all_of(value.begin(), value.end(), [](unsigned char byte) {
    return byte >= 0x20;
  });
}

inline bool companion_remote_definition_capacity_available(const std::string &kind,
                                                           size_t application_count) {
  return kind == "application" && application_count < COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE;
}

struct CompanionRuntimeSnapshot {
  std::vector<CompanionAction> actions;
  std::vector<CompanionValue> values;
  std::string focused_action_id;
  std::vector<std::string> focused_action_ids;
  bool keyboard_actions_supported{false};
  bool connected{false};
  CompanionSystemMetricsSnapshot system_metrics;
  std::vector<CompanionURLFocusTarget> url_focus_targets;
  uint32_t url_focus_targets_generation{0};
  bool application_highlight_known{false};
  std::string application_highlight_id;
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

using CompanionActionSender = std::function<bool(const std::string &, const std::string &, const std::string &, const std::string &)>;
using CompanionUrlSender = std::function<bool(const std::string &encoded_url, const std::string &request_id,
                                              bool new_window)>;
using CompanionValueSender = std::function<bool(const std::string &, int, const std::string &)>;
using CompanionActionResultHandler = std::function<void()>;
using CompanionConnectionChangedHandler = std::function<void(bool)>;

enum class CompanionActionSuccess : uint8_t { ACTIVATED, PERFORMED };

struct CompanionPendingAction {
  std::string request_id;
  std::string expected_application_id;
  std::string computer_id;
  uint32_t expires_at{0};
  CompanionActionSuccess expected_success{CompanionActionSuccess::ACTIVATED};
  CompanionActionResultHandler success;
};

struct CompanionPendingActions {
  static constexpr size_t MAX_PENDING = 8;
  std::mutex mutex;
  // A long-running shortcut must leave room for application activation requests.
  std::array<CompanionPendingAction, MAX_PENDING * 2> entries{};
};

inline constexpr size_t COMPANION_PAIRING_CODE_LENGTH = 4;

struct CompanionPairedComputer {
  std::string id;
  std::string name;
  bool connected{false};
};

struct CompanionPairingSnapshot {
  bool available{false};
  bool active{false};
  bool paired{false};
  bool connected{false};
  uint16_t port{8443};
  uint32_t system_metrics_generation{0};
  std::string pairing_code;
  std::string mdns_name;
  bool can_add_computer{true};
  std::vector<CompanionPairedComputer> computers;
  bool windows_companion{false};
};

using CompanionPairingProvider = std::function<CompanionPairingSnapshot()>;


class CompanionRuntimeService {
 public:
  // Wiring callbacks and pending requests share this service's lifetime.
  CompanionPendingActions pending_actions;
  CompanionShortcutCatalogue shortcut_catalogue;
  std::function<bool(uint32_t, const std::string &, uint32_t)> shortcut_catalogue_sender;
  CompanionActionSender action_sender;
  CompanionUrlSender url_sender;
  CompanionValueSender value_sender;
  // The routing target captured by the transport wiring. Empty means "resolve
  // the primary computer at call time".
  std::string sender_target;
  CompanionPairingProvider pairing_provider;
  std::function<void()> begin_pairing;
  std::function<bool()> reset_and_begin_pairing;
  std::function<bool(const std::string &)> revoke_computer;
  std::function<void()> request_pairing_display;
  std::function<bool()> clear_app_icon_cache;
  void (*show_pairing_code_handler)() = nullptr;
  void (*pairing_changed_handler)() = nullptr;
  CompanionConnectionChangedHandler connection_changed_handler;
  std::function<void()> focus_registrations_changed_handler;
  std::atomic<bool> subpage_return_requested{false};
  std::atomic<uint32_t> request_number{0};

  bool connected() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connected_;
  }

  std::vector<CompanionAction> actions() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return actions_;
  }

  uint32_t action_catalogue_generation() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return action_catalogue_generation_;
  }

  uint32_t system_metrics_generation() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return system_metrics_.generation;
  }

  CompanionSystemMetricsSnapshot system_metrics() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return system_metrics_;
  }

  std::vector<CompanionRemoteDefinition> remote_definitions_page(
      size_t offset, size_t limit, bool &connected, bool &has_more) const {
    std::lock_guard<std::mutex> lock(mutex_);
    connected = connected_;
    if (!connected_) {
      has_more = false;
      return {};
    }
    const size_t count = remote_definitions_.size();
    const size_t begin = std::min(offset, count);
    const size_t end = std::min(count, begin + limit);
    has_more = end < count;
    return {remote_definitions_.begin() + begin, remote_definitions_.begin() + end};
  }

  bool value(const std::string &id, int &result) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto item = std::find_if(values_.begin(), values_.end(),
      [&id](const CompanionValue &candidate) { return candidate.id == id; });
    if (item == values_.end()) return false;
    result = item->value;
    return true;
  }

  // Touch feedback stays separate from confirmed audio state. Only the latest
  // command for each mute control can settle its preview.
  int displayed_mute_value(const std::string &id, int confirmed) const {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto &pending : pending_mutes_)
      if (!pending.request.empty() && pending.control == id) return pending.value;
    return confirmed;
  }

  void preview_mute(const std::string &control, int value, const std::string &request) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto entry = std::find_if(pending_mutes_.begin(), pending_mutes_.end(),
      [&control](const PendingMute &item) { return item.control == control; });
    if (entry == pending_mutes_.end())
      entry = std::find_if(pending_mutes_.begin(), pending_mutes_.end(),
        [](const PendingMute &item) { return item.request.empty(); });
    if (entry == pending_mutes_.end()) return;
    *entry = {control, request, value, std::nullopt, false};
    request_refresh_();
  }

  void acknowledge_mute(const std::string &request, bool performed) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto &pending : pending_mutes_) {
      if (pending.request != request || request.empty()) continue;
      const bool confirmed = std::any_of(values_.begin(), values_.end(),
        [&pending](const CompanionValue &item) { return item.id == pending.control && item.value == pending.value; });
      if (!performed || confirmed) {
        pending = {};
        request_refresh_();
      } else {
        pending.acknowledged = true;
      }
      break;
    }
  }

  void expire_mute_previews(uint32_t now) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto &pending : pending_mutes_) {
      if (pending.request.empty()) continue;
      if (!pending.expires_at) pending.expires_at = now + 700;
      if (static_cast<int32_t>(now - *pending.expires_at) < 0) continue;
      pending = {};
      request_refresh_();
    }
  }

  CompanionRuntimeSnapshot snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return {actions_, values_, focused_action_id_, focused_action_ids_, keyboard_actions_supported_,
            connected_, system_metrics_, url_focus_targets_,
            url_focus_targets_generation_, application_highlight_known_, application_highlight_id_};
  }

  std::string highlighted_application() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return application_highlight_id_;
  }

  CompanionFocusTargetsState focus_targets_state() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return {connected_, url_focus_targets_generation_};
  }

  void set_focus_registrations(std::vector<CompanionURLFocusTarget> targets) {
    std::function<void()> changed_handler;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (targets.size() > 64) targets.resize(64);
      if (targets.size() == url_focus_targets_.size() && std::equal(targets.begin(), targets.end(), url_focus_targets_.begin(),
          [](const auto &a, const auto &b) { return a.id == b.id && a.url == b.url; })) return;
      url_focus_targets_ = std::move(targets);
      ++url_focus_targets_generation_;
      if (url_focus_targets_generation_ == 0) url_focus_targets_generation_ = 1;
      changed_handler = focus_registrations_changed_handler;
    }
    if (changed_handler) changed_handler();
  }

  void set_remote_definitions(std::vector<CompanionRemoteDefinition> definitions) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (definitions.size() > COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE)
      definitions.resize(COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE);
    remote_definitions_ = std::move(definitions);
    request_refresh_();
  }

  void set_actions(std::vector<CompanionAction> actions) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (actions == actions_) return;
    if (!actions.empty()) ++action_catalogue_generation_;
    actions_ = std::move(actions);
    request_refresh_();
  }

  void set_obs_actions(std::vector<CompanionAction> actions) {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto is_obs = [](const CompanionAction &action) { return action.id.rfind("obs.", 0) == 0; };
    const auto first_obs = std::find_if(actions_.begin(), actions_.end(), is_obs);
    if (std::equal(first_obs, actions_.end(), actions.begin(), actions.end())) return;
    actions_.erase(std::remove_if(first_obs, actions_.end(), is_obs), actions_.end());
    for (auto &action : actions) actions_.push_back(std::move(action));
    if (!actions_.empty()) ++action_catalogue_generation_;
    request_refresh_();
  }

  void set_keyboard_actions_supported(bool supported) {
    std::lock_guard<std::mutex> lock(mutex_);
    keyboard_actions_supported_ = supported;
    request_refresh_();
  }

  void set_windows_shortcuts(bool windows) {
    std::lock_guard<std::mutex> lock(mutex_);
    windows_shortcuts_ = windows;
  }

  bool windows_shortcuts() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connected_ && windows_shortcuts_;
  }

  bool shortcut_page_ready(const std::string &owner) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connected_ && keyboard_actions_supported_ &&
        companion_reported_focus_matches(owner, focused_action_id_, focused_action_ids_);
  }

  void set_value(const std::string &control_id, int value, size_t limit = 0) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto item = std::find_if(values_.begin(), values_.end(),
      [&control_id](const CompanionValue &candidate) { return candidate.id == control_id; });
    if (item == values_.end()) {
      if (limit) {
        const bool obs = control_id.rfind("obs.", 0) == 0;
        const auto used = std::count_if(values_.begin(), values_.end(), [obs](const CompanionValue &candidate) {
          return (candidate.id.rfind("obs.", 0) == 0) == obs;
        });
        if (static_cast<size_t>(used) >= limit) return;
      }
      values_.push_back({control_id, value});
    } else {
      item->value = value;
    }
    for (auto &pending : pending_mutes_)
      if (pending.acknowledged && pending.control == control_id && pending.value == value) pending = {};
    request_refresh_();
  }

  void remove_value(const std::string &control_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto &pending : pending_mutes_)
      if (pending.control == control_id) pending = {};
    values_.erase(std::remove_if(values_.begin(), values_.end(),
      [&control_id](const CompanionValue &candidate) { return candidate.id == control_id; }),
      values_.end());
    request_refresh_();
  }

  void set_system_metrics(CompanionSystemMetricsSnapshot snapshot) {
    std::lock_guard<std::mutex> lock(mutex_);
    system_metrics_ = std::move(snapshot);
    request_refresh_();
  }

  void set_app_subpage_mode(CompanionAppSubpageMode mode) {
    std::lock_guard<std::mutex> lock(mutex_);
    app_subpage_mode_ = mode;
    pending_auto_subpage_action_id_.clear();
    subpage_return_requested.store(false);
  }

  void set_return_home_on_app_switch(bool enabled) {
    std::lock_guard<std::mutex> lock(mutex_);
    return_home_on_app_switch_ = enabled;
  }

  bool return_home_on_app_switch() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return return_home_on_app_switch_;
  }

  CompanionAppSubpageMode app_subpage_mode() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return app_subpage_mode_;
  }

  bool set_focused_action(std::string action_id) {
    std::vector<std::string> identifiers;
    if (!action_id.empty()) identifiers.push_back(std::move(action_id));
    return set_focused_actions(std::move(identifiers));
  }

  void set_application_highlight(std::string application_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (application_highlight_known_ && application_highlight_id_ == application_id) return;
    application_highlight_known_ = true;
    application_highlight_id_ = std::move(application_id);
    // A fast visual report cannot leave the previous app's shortcuts enabled
    // while its replacement's detailed focus query is still pending.
    if (focused_action_id_ != application_highlight_id_) {
      focused_action_id_.clear();
      focused_action_ids_.clear();
      pending_auto_subpage_action_id_.clear();
    }
    focus_refresh_requested_.store(true);
  }

  bool set_focused_actions(std::vector<std::string> identifiers) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> accepted;
    for (auto &identifier : identifiers) {
      if (identifier.empty() || identifier.size() > 96 || identifier.rfind("webapp.", 0) == 0 ||
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
    const std::string &auto_subpage_id = application_id;
    const std::string previous_auto_subpage_id = focused_auto_subpage_id_;
    if (focused_action_ids_ == accepted && previous_auto_subpage_id == auto_subpage_id) return false;
    // The Mac still has this app in front, but its detailed focus report no
    // longer finds a visible window. This also applies to manually opened pages.
    if (connected_ && auto_subpage_id.empty() && !previous_auto_subpage_id.empty() &&
        application_highlight_known_ && application_highlight_id_ == previous_auto_subpage_id) {
      closed_app_subpage_action_id_ = previous_auto_subpage_id;
    } else if (auto_subpage_id == closed_app_subpage_action_id_) {
      closed_app_subpage_action_id_.clear();
    }
    const bool follows_focus = app_subpage_mode_ == CompanionAppSubpageMode::FOCUS;
    const bool should_return = follows_focus && connected_ && !previous_auto_subpage_id.empty() &&
      auto_subpage_id != previous_auto_subpage_id;
    if (!follows_focus || accepted.empty() || !connected_) pending_auto_subpage_action_id_.clear();
    else if (previous_auto_subpage_id != auto_subpage_id) pending_auto_subpage_action_id_ = auto_subpage_id;
    focused_action_ids_ = std::move(accepted);
    focused_action_id_ = parent_id(focused_action_ids_);
    focused_auto_subpage_id_ = auto_subpage_id;
    focus_refresh_requested_.store(true);
    return should_return;
  }

  std::string consume_closed_app_subpage_action() {
    std::lock_guard<std::mutex> lock(mutex_);
    return std::exchange(closed_app_subpage_action_id_, {});
  }

  std::string pending_auto_subpage_action() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return pending_auto_subpage_action_id_;
  }

  std::string take_wake_subpage_action() {
    std::lock_guard<std::mutex> lock(mutex_);
    pending_auto_subpage_action_id_.clear();
    closed_app_subpage_action_id_.clear();
    subpage_return_requested.store(false);
    return connected_ && app_subpage_mode_ == CompanionAppSubpageMode::FOCUS ? focused_auto_subpage_id_ : std::string{};
  }

  bool consume_auto_subpage_action(const std::string &action_id) {
    if (action_id.empty()) return false;
    std::lock_guard<std::mutex> lock(mutex_);
    if (pending_auto_subpage_action_id_ != action_id) return false;
    pending_auto_subpage_action_id_.clear();
    return true;
  }

  bool mac_update_required() const { return mac_update_required_.load(); }
  void set_mac_update_required(bool required) { mac_update_required_.store(required); }

  void set_connected(bool connected) {
    std::lock_guard<std::mutex> lock(mutex_);
    connected_ = connected;
    if (connected_) {
      keyboard_actions_supported_ = true;
      set_mac_update_required(false);
    }
    if (!connected_) {
      values_.clear();
      pending_mutes_ = {};
      focused_action_id_.clear();
      focused_action_ids_.clear();
      application_highlight_known_ = false;
      application_highlight_id_.clear();
      focused_auto_subpage_id_.clear();
      pending_auto_subpage_action_id_.clear();
      closed_app_subpage_action_id_.clear();
      keyboard_actions_supported_ = false;
      windows_shortcuts_ = false;
      system_metrics_ = {};
    }
    request_refresh_();
  }

  void request_refresh() { request_refresh_(); }
  bool consume_refresh_request() { return refresh_requested_.exchange(false); }
  bool consume_focus_refresh_request() { return focus_refresh_requested_.exchange(false); }
  bool focus_refresh_pending() const { return focus_refresh_requested_.load(); }
  std::atomic<bool> &refresh_flag() { return refresh_requested_; }

 private:
  void request_refresh_() { refresh_requested_.store(true); }

  mutable std::mutex mutex_;
  std::vector<CompanionAction> actions_;
  uint32_t action_catalogue_generation_{0};
  bool application_highlight_known_{false};
  std::string application_highlight_id_;
  std::vector<CompanionRemoteDefinition> remote_definitions_;
  std::vector<CompanionURLFocusTarget> url_focus_targets_;
  uint32_t url_focus_targets_generation_{0};
  std::vector<CompanionValue> values_;
  struct PendingMute {
    std::string control;
    std::string request;
    int value{0};
    std::optional<uint32_t> expires_at;
    bool acknowledged{false};
  };
  std::array<PendingMute, 3> pending_mutes_{};
  std::string focused_action_id_;
  std::vector<std::string> focused_action_ids_;
  CompanionAppSubpageMode app_subpage_mode_ = CompanionAppSubpageMode::CARD;
  bool return_home_on_app_switch_ = true;
  std::string focused_auto_subpage_id_;
  std::string pending_auto_subpage_action_id_;
  std::string closed_app_subpage_action_id_;
  bool keyboard_actions_supported_{false};
  bool windows_shortcuts_{false};
  bool connected_{false};
  CompanionSystemMetricsSnapshot system_metrics_;
  std::atomic<bool> mac_update_required_{false};
  std::atomic<bool> refresh_requested_{false};
  std::atomic<bool> focus_refresh_requested_{false};
};

// One CompanionRuntimeService per paired computer. Existing cards and the
// display's global surfaces use the primary runtime; cards saved with a
// computer ID use that computer's runtime. "Active" follows the computer whose
// card was touched last so live readouts on shared cards match the input.
inline constexpr size_t COMPANION_MAX_COMPUTER_RUNTIMES = 4;

inline void companion_reset_runtime_state(CompanionRuntimeService &runtime) {
  runtime.set_connected(false);
  runtime.set_actions({});
  runtime.set_obs_actions({});
  runtime.set_remote_definitions({});
  runtime.set_keyboard_actions_supported(false);
  runtime.set_system_metrics({});
  runtime.set_focused_actions({});
  runtime.set_application_highlight({});
  runtime.set_mac_update_required(false);
}

class CompanionRuntimeRegistry {
 public:
  CompanionRuntimeService &primary() { return this->slot_(0); }

  CompanionRuntimeService &for_computer(const std::string &computer_id) {
    if (computer_id.empty()) return this->primary();
    std::lock_guard<std::mutex> lock(this->mutex_);
    const size_t index = this->slot_for_id_locked_(computer_id, true);
    if (index == SIZE_MAX) return this->unknown_runtime_;
    if (this->ids_[index].empty()) {
      this->ids_[index] = computer_id;
      companion_reset_runtime_state(*this->ensure_slot_locked_(index));
    }
    return *this->ensure_slot_locked_(index);
  }

  CompanionRuntimeService *find_computer(const std::string &computer_id) {
    if (computer_id.empty()) return nullptr;
    const size_t index = this->slot_for_id_(computer_id, false);
    return index == SIZE_MAX ? nullptr : &this->slot_(index);
  }

  // Card rendering must not allocate a slot for a stale computer ID. Unknown
  // computers read a shared empty runtime so their cards render unavailable
  // instead of borrowing another computer's state.
  CompanionRuntimeService &find_or_primary(const std::string &computer_id) {
    if (computer_id.empty()) return this->primary();
    auto *runtime = this->find_computer(computer_id);
    return runtime ? *runtime : this->unknown_runtime_;
  }

  bool has_computer(const std::string &computer_id) const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return this->slot_for_id_locked_(computer_id, false) != SIZE_MAX;
  }

  void set_primary_computer(const std::string &computer_id) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    if (computer_id.empty()) {
      this->primary_id_.clear();
      return;
    }
    if (this->primary_id_ == computer_id) return;
    const size_t index = this->slot_for_id_locked_(computer_id, false);
    if (index != SIZE_MAX && index != 0) {
      // A runtime already exists for this computer. Promote it by swapping it
      // with slot zero so its state follows the primary designation.
      std::swap(this->runtimes_[0], this->runtimes_[index]);
      std::swap(this->ids_[0], this->ids_[index]);
    } else if (index == SIZE_MAX && this->runtimes_[0] && !this->ids_[0].empty() &&
               this->ids_[0] != computer_id) {
      // The previous primary was revoked and the new one has no runtime yet.
      // Keep the object (service wiring survives) but clear its stale state.
      companion_reset_runtime_state(*this->runtimes_[0]);
      this->ids_[0].clear();
    }
    this->ids_[0] = computer_id;
    this->primary_id_ = computer_id;
  }

  // Free a revoked computer's slot for reuse. The runtime object is kept so
  // UI references stay valid; its state must be reset by the caller first.
  void release_computer(const std::string &computer_id) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    const size_t index = this->slot_for_id_locked_(computer_id, false);
    if (index == SIZE_MAX) return;
    this->ids_[index].clear();
    if (this->primary_id_ == computer_id) this->primary_id_.clear();
    if (this->active_id_ == computer_id) this->active_id_.clear();
  }

  std::string first_connected_computer() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (size_t index = 0; index < this->runtimes_.size(); index++) {
      if (!this->runtimes_[index] || !this->runtimes_[index]->connected()) continue;
      if (this->ids_[index] == this->primary_id_) return this->ids_[index];
    }
    for (size_t index = 0; index < this->runtimes_.size(); index++) {
      if (this->runtimes_[index] && this->runtimes_[index]->connected() &&
          !this->ids_[index].empty())
        return this->ids_[index];
    }
    return {};
  }

  const std::string &primary_computer() const { return this->primary_id_; }

  void set_active_computer(const std::string &computer_id) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    this->active_id_ = computer_id;
  }

  std::string active_computer() const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return this->resolve_active_locked_();
  }

  bool is_active_computer(const std::string &computer_id) const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return this->resolve_active_locked_() == computer_id;
  }

  CompanionRuntimeService &active() {
    const std::string id = this->active_computer();
    return id.empty() ? this->primary() : this->for_computer(id);
  }

  bool any_connected() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (const auto &runtime : this->runtimes_)
      if (runtime && runtime->connected()) return true;
    return false;
  }

  bool consume_refresh_request() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    bool requested = false;
    for (auto &runtime : this->runtimes_)
      if (runtime) requested |= runtime->consume_refresh_request();
    return requested;
  }

  bool focus_refresh_pending() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (const auto &runtime : this->runtimes_)
      if (runtime && runtime->focus_refresh_pending()) return true;
    return false;
  }

  bool consume_focus_refresh_request() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    bool requested = false;
    for (auto &runtime : this->runtimes_)
      if (runtime) requested |= runtime->consume_focus_refresh_request();
    return requested;
  }

  void request_refresh_all() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (auto &runtime : this->runtimes_)
      if (runtime) runtime->request_refresh();
  }

  void set_app_subpage_mode_all(CompanionAppSubpageMode mode) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (auto &runtime : this->runtimes_)
      if (runtime) runtime->set_app_subpage_mode(mode);
    this->app_subpage_mode_ = mode;
  }

  void set_return_home_on_app_switch_all(bool enabled) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (auto &runtime : this->runtimes_)
      if (runtime) runtime->set_return_home_on_app_switch(enabled);
    this->return_home_on_app_switch_ = enabled;
  }

  void reset_computer(const std::string &computer_id) {
    auto *runtime = this->find_computer(computer_id);
    if (runtime) companion_reset_runtime_state(*runtime);
  }

  void reset() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (auto &runtime : this->runtimes_) runtime.reset();
    for (auto &id : this->ids_) id.clear();
    this->primary_id_.clear();
    this->active_id_.clear();
  }

 private:
  CompanionRuntimeService &slot_(size_t index) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return *this->ensure_slot_locked_(index);
  }

  size_t slot_for_id_(const std::string &computer_id, bool allocate) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return this->slot_for_id_locked_(computer_id, allocate);
  }

  size_t slot_for_id_locked_(const std::string &computer_id, bool allocate) const {
    if (computer_id.empty()) return 0;
    if (computer_id == this->primary_id_) return 0;
    // Slot zero may still hold a computer that is no longer primary while its
    // revocation is being completed.
    if (!this->ids_[0].empty() && this->ids_[0] == computer_id) return 0;
    for (size_t index = 0; index < this->ids_.size(); index++)
      if (this->runtimes_[index] && this->ids_[index] == computer_id) return index;
    if (!allocate) return SIZE_MAX;
    for (size_t index = 1; index < this->ids_.size(); index++)
      if (this->ids_[index].empty()) return index;
    return SIZE_MAX;
  }

  CompanionRuntimeService *ensure_slot_locked_(size_t index) {
    if (index >= this->runtimes_.size() || index == SIZE_MAX) index = 0;
    if (!this->runtimes_[index]) {
      this->runtimes_[index] = std::make_unique<CompanionRuntimeService>();
      if (this->has_app_subpage_mode_)
        this->runtimes_[index]->set_app_subpage_mode(this->app_subpage_mode_);
      if (this->has_return_home_)
        this->runtimes_[index]->set_return_home_on_app_switch(this->return_home_on_app_switch_);
    }
    return this->runtimes_[index].get();
  }

  std::string resolve_active_locked_() const {
    if (this->active_id_.empty()) return this->primary_id_;
    if (this->active_id_ == this->primary_id_) return this->active_id_;
    for (size_t index = 1; index < this->ids_.size(); index++)
      if (this->runtimes_[index] && this->ids_[index] == this->active_id_)
        return this->active_id_;
    return this->primary_id_;
  }

  mutable std::mutex mutex_;
  std::array<std::unique_ptr<CompanionRuntimeService>, COMPANION_MAX_COMPUTER_RUNTIMES> runtimes_{};
  std::array<std::string, COMPANION_MAX_COMPUTER_RUNTIMES> ids_{};
  CompanionRuntimeService unknown_runtime_;
  std::string primary_id_;
  std::string active_id_;
  bool has_app_subpage_mode_{false};
  CompanionAppSubpageMode app_subpage_mode_{CompanionAppSubpageMode::CARD};
  bool has_return_home_{false};
  bool return_home_on_app_switch_{true};
};
