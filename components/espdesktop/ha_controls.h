#pragma once

// Small Home Assistant bridge for the panel's light and media controls.
// It keeps only the state needed by the cards: one subscription per entity,
// an attribute subscription for brightness/volume, and service calls for the
// user's taps and slider releases.

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "lvgl.h"
#include "ha_control_entities.h"

#ifdef USE_API_HOMEASSISTANT_STATES
#include "esphome/components/api/api_server.h"
#endif
#ifdef USE_API_HOMEASSISTANT_SERVICES
#include "esphome/components/api/api_pb2.h"
#endif

namespace espdesktop::ha_controls {

inline std::mutex &state_mutex() {
  static std::mutex mutex;
  return mutex;
}

inline std::map<std::string, std::string> &states() {
  static std::map<std::string, std::string> values;
  return values;
}

inline std::set<std::string> &subscriptions() {
  static std::set<std::string> keys;
  return keys;
}

inline std::atomic<uint32_t> &revision() {
  static std::atomic<uint32_t> value{0};
  return value;
}

inline uint32_t state_revision() { return revision().load(std::memory_order_relaxed); }

inline std::string state_key(const std::string &entity_id, const std::string &attribute) {
  return attribute.empty() ? entity_id : entity_id + "\n" + attribute;
}

inline std::string state(const std::string &entity_id, const std::string &attribute = "") {
  std::lock_guard<std::mutex> lock(state_mutex());
  const auto &values = states();
  auto found = values.find(state_key(entity_id, attribute));
  return found == values.end() ? std::string{} : found->second;
}

inline bool api_available() {
#ifdef USE_API_HOMEASSISTANT_SERVICES
  return esphome::api::global_api_server != nullptr;
#else
  return false;
#endif
}

inline bool state_subscription_ready() {
#ifdef USE_API_HOMEASSISTANT_STATES
  return esphome::api::global_api_server != nullptr &&
      esphome::api::global_api_server->is_connected_with_state_subscription();
#else
  return false;
#endif
}

inline void subscribe_state(const std::string &entity_id, const std::string &attribute = "") {
#ifdef USE_API_HOMEASSISTANT_STATES
  if (entity_id.empty() || esphome::api::global_api_server == nullptr) return;
  const auto key = state_key(entity_id, attribute);
  if (!subscriptions().insert(key).second) return;
  std::optional<std::string> attribute_value;
  if (!attribute.empty()) attribute_value = attribute;
  esphome::api::global_api_server->subscribe_home_assistant_state(
      entity_id, attribute_value,
      [key](esphome::StringRef value) {
        std::lock_guard<std::mutex> lock(state_mutex());
        states()[key] = value.str();
        revision().fetch_add(1, std::memory_order_relaxed);
      });
#else
  (void) entity_id;
  (void) attribute;
#endif
}

inline void subscribe_slider_state(const std::string &entity_id) {
  subscribe_state(entity_id);
  const auto attribute = slider_attribute(entity_id);
  if (!attribute.empty()) subscribe_state(entity_id, attribute);
}

// Returns 0-100, or -1 when the entity has not reported a usable value yet.
inline int slider_percent(const std::string &entity_id) {
  const auto domain = domain_of(entity_id);
  const auto current = state(entity_id);
  if (domain == "light") {
    if (!state_is_on(entity_id, current)) return 0;
    double brightness = 0;
    if (parse_number(state(entity_id, "brightness"), brightness))
      return static_cast<int>(std::lround(std::max(0.0, std::min(255.0, brightness)) * 100.0 / 255.0));
    return 100;
  }
  if (domain == "media_player") {
    double level = 0;
    if (parse_number(state(entity_id, "volume_level"), level))
      return static_cast<int>(std::lround(std::max(0.0, std::min(1.0, level)) * 100.0));
    return -1;
  }
  if (domain == "fan") {
    double percentage = 0;
    if (parse_number(state(entity_id, "percentage"), percentage))
      return static_cast<int>(std::lround(std::max(0.0, std::min(100.0, percentage))));
    return -1;
  }
  double numeric = 0;
  if (parse_number(current, numeric))
    return static_cast<int>(std::lround(std::max(0.0, std::min(100.0, numeric))));
  return -1;
}

#ifdef USE_API_HOMEASSISTANT_SERVICES
inline bool action_send(const char *service, const std::string &entity_id,
                        const char *data_key = nullptr, const char *data_value = nullptr) {
  if (service == nullptr || service[0] == '\0' || entity_id.empty() ||
      esphome::api::global_api_server == nullptr ||
      !esphome::api::global_api_server->is_connected()) return false;
  esphome::api::HomeassistantActionRequest request;
  request.service = decltype(request.service)(esphome::StringRef(service));
  request.is_event = false;
  request.data.init(data_key != nullptr && data_value != nullptr ? 2 : 1);
  auto &entity = request.data.emplace_back();
  entity.key = decltype(entity.key)(esphome::StringRef("entity_id"));
  entity.value = decltype(entity.value)(esphome::StringRef(entity_id));
  if (data_key != nullptr && data_value != nullptr) {
    auto &data = request.data.emplace_back();
    data.key = decltype(data.key)(esphome::StringRef(data_key));
    data.value = decltype(data.value)(esphome::StringRef(data_value));
  }
  esphome::api::global_api_server->send_homeassistant_action(request);
  return true;
}
#else
inline bool action_send(const char *, const std::string &, const char * = nullptr,
                        const char * = nullptr) {
  return false;
}
#endif

inline bool toggle_entity(const std::string &entity_id) {
  const auto domain = domain_of(entity_id);
  if (domain == "button") return action_send("button.press", entity_id);
  if (domain == "input_button") return action_send("input_button.press", entity_id);
  return action_send("homeassistant.toggle", entity_id);
}

inline bool set_slider_percent(const std::string &entity_id, int percent) {
  percent = std::max(0, std::min(100, percent));
  char buffer[16];
  const auto domain = domain_of(entity_id);
  if (domain == "light") {
    if (percent == 0) return action_send("light.turn_off", entity_id);
    std::snprintf(buffer, sizeof(buffer), "%d", percent);
    return action_send("light.turn_on", entity_id, "brightness_pct", buffer);
  }
  if (domain == "media_player") {
    std::snprintf(buffer, sizeof(buffer), "%.2f", percent / 100.0);
    return action_send("media_player.volume_set", entity_id, "volume_level", buffer);
  }
  if (domain == "fan") {
    if (percent == 0) return action_send("fan.turn_off", entity_id);
    std::snprintf(buffer, sizeof(buffer), "%d", percent);
    return action_send("fan.turn_on", entity_id, "percentage", buffer);
  }
  if (domain == "number") {
    std::snprintf(buffer, sizeof(buffer), "%d", percent);
    return action_send("number.set_value", entity_id, "value", buffer);
  }
  if (domain == "input_number") {
    std::snprintf(buffer, sizeof(buffer), "%d", percent);
    return action_send("input_number.set_value", entity_id, "value", buffer);
  }
  return false;
}

struct RefreshBinding {
  lv_obj_t *owner{nullptr};
  std::function<bool()> refresh;
};

inline std::map<int, RefreshBinding> &refresh_bindings() {
  static std::map<int, RefreshBinding> bindings;
  return bindings;
}

inline int &next_refresh_id() {
  static int next = 1;
  return next;
}

inline void refresh_timer_cb(lv_timer_t *);

inline void ensure_refresh_timer() {
  static lv_timer_t *timer = nullptr;
  if (timer == nullptr) timer = lv_timer_create(refresh_timer_cb, 500, nullptr);
}

inline void unregister_refresh(int id) { refresh_bindings().erase(id); }

inline void unregister_widget(lv_obj_t *owner) {
  auto &bindings = refresh_bindings();
  for (auto it = bindings.begin(); it != bindings.end();) {
    if (it->second.owner == owner) it = bindings.erase(it);
    else ++it;
  }
}

inline int register_refresh(lv_obj_t *owner, std::function<bool()> refresh) {
  if (owner == nullptr) return 0;
  ensure_refresh_timer();
  const int id = next_refresh_id()++;
  refresh_bindings()[id] = {owner, std::move(refresh)};
  auto *token = new int(id);
  lv_obj_add_event_cb(owner, [](lv_event_t *event) {
    auto *value = static_cast<int *>(lv_event_get_user_data(event));
    if (value != nullptr) {
      unregister_refresh(*value);
      delete value;
    }
  }, LV_EVENT_DELETE, token);
  return id;
}

inline void refresh_timer_cb(lv_timer_t *) {
  static uint32_t last_revision = 0;
  const uint32_t current = state_revision();
  if (current == last_revision) return;
  last_revision = current;
  auto &bindings = refresh_bindings();
  for (auto it = bindings.begin(); it != bindings.end();) {
    if (!it->second.refresh()) it = bindings.erase(it);
    else ++it;
  }
}

}  // namespace espdesktop::ha_controls
