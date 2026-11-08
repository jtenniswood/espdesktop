#pragma once
#include "screensaver_pin.h"

#include "media_playback_modes.h"
#include "media_volume_capability.h"
#include "number_slider_policy.h"

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

// ── Home Assistant actions ────────────────────────────────────────────

inline bool is_button_entity(const std::string &entity_id) {
  return entity_id.size() > 7 && entity_id.compare(0, 7, "button.") == 0;
}

// Press HA button entities; toggle other bound entities.
inline void send_toggle_action(const std::string &entity_id) {
  ha_send_entity_action(entity_id,
    is_button_entity(entity_id) ? "button.press" : "homeassistant.toggle");
}

inline void send_turn_off_action(const std::string &entity_id) {
  ha_send_entity_action(entity_id, "homeassistant.turn_off");
}

inline void send_turn_on_action(const std::string &entity_id) {
  ha_send_entity_action(entity_id, "homeassistant.turn_on");
}

// Action cards now invoke only explicitly registered local functions. Legacy
// Home Assistant service names remain readable in saved layouts but inert.
inline void send_action_card_action(const ParsedCfg &config) {
  if (action_card_local_action(config) && !config.entity.empty()) {
    send_local_action(config.entity);
  }
}

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
  WebhookHeaders headers = parse_webhook_headers(webhook_card_headers(p), body);
  WebhookSender &sender = webhook_sender();
  if (!sender) {
    ESP_LOGW("webhook", "Webhook sender is not registered");
    return;
  }
  ESP_LOGI("webhook", "Calling webhook with method %s", method.c_str());
  sender(url, method, body, headers);
}

inline void send_lock_action(const std::string &entity_id, const std::string &state) {
  ha_send_entity_action(entity_id, card_runtime_lock_toggle_service(state));
}

inline void send_lock_action(LockCardCtx *ctx) {
  if (!ctx) return;
  send_lock_action(ctx->entity_id, ctx->state);
}

// ── Slider card helpers ────────────────────────────────────────────────

inline bool is_cover_entity(const std::string &entity_id) {
  return entity_id.size() > 6 && entity_id.compare(0, 6, "cover.") == 0;
}

inline bool is_fan_entity(const std::string &entity_id) {
  return entity_id.size() > 4 && entity_id.compare(0, 4, "fan.") == 0;
}

inline bool cover_tilt_mode(const std::string &sensor) {
  return card_runtime_cover_tilt_mode(sensor);
}

inline const char *cover_command_service(const std::string &sensor) {
  return card_runtime_cover_command_service(sensor);
}

constexpr int COVER_SUPPORT_OPEN = 1;
constexpr int COVER_SUPPORT_CLOSE = 2;
constexpr int COVER_SUPPORT_SET_POSITION = 4;
constexpr int COVER_SUPPORT_STOP = 8;
constexpr int COVER_SUPPORT_OPEN_TILT = 16;
constexpr int COVER_SUPPORT_CLOSE_TILT = 32;
constexpr int COVER_SUPPORT_STOP_TILT = 64;
constexpr int COVER_SUPPORT_SET_TILT_POSITION = 128;

inline const char *cover_tilt_command_service(const std::string &sensor) {
  if (sensor == "open") return "cover.open_cover_tilt";
  if (sensor == "close") return "cover.close_cover_tilt";
  if (sensor == "stop") return "cover.stop_cover_tilt";
  if (sensor == "set_position") return "cover.set_cover_tilt_position";
  return nullptr;
}

inline int cover_command_normal_feature(const std::string &sensor) {
  if (sensor == "open") return COVER_SUPPORT_OPEN;
  if (sensor == "close") return COVER_SUPPORT_CLOSE;
  if (sensor == "stop") return COVER_SUPPORT_STOP;
  if (sensor == "set_position") return COVER_SUPPORT_SET_POSITION;
  return 0;
}

inline int cover_command_tilt_feature(const std::string &sensor) {
  if (sensor == "open") return COVER_SUPPORT_OPEN_TILT;
  if (sensor == "close") return COVER_SUPPORT_CLOSE_TILT;
  if (sensor == "stop") return COVER_SUPPORT_STOP_TILT;
  if (sensor == "set_position") return COVER_SUPPORT_SET_TILT_POSITION;
  return 0;
}

struct CoverCommandCtx {
  ParsedCfg config;
  bool supported_features_known = false;
  int supported_features = 0;
};

inline bool cover_command_use_tilt(const std::string &sensor,
                                   bool supported_features_known,
                                   int supported_features) {
  if (!supported_features_known) return false;
  int normal_feature = cover_command_normal_feature(sensor);
  int tilt_feature = cover_command_tilt_feature(sensor);
  return normal_feature != 0 && tilt_feature != 0 &&
         (supported_features & normal_feature) == 0 &&
         (supported_features & tilt_feature) != 0;
}

inline bool cover_command_supported(const std::string &sensor,
                                    bool supported_features_known,
                                    int supported_features) {
  if (!supported_features_known) return true;
  int normal_feature = cover_command_normal_feature(sensor);
  int tilt_feature = cover_command_tilt_feature(sensor);
  return (normal_feature != 0 && (supported_features & normal_feature) != 0) ||
         (tilt_feature != 0 && (supported_features & tilt_feature) != 0);
}

inline int cover_position_value(const std::string &value) {
  char *end = nullptr;
  long pos = std::strtol(value.c_str(), &end, 10);
  if (end == value.c_str()) pos = 50;
  if (pos < 0) pos = 0;
  if (pos > 100) pos = 100;
  return static_cast<int>(pos);
}

inline uint32_t next_cover_stop_call_id() {
  static uint32_t call_id = 200000;
  return call_id++;
}

inline uint32_t &cover_stop_pending_call_id() {
  static uint32_t call_id = 0;
  return call_id;
}

inline void cover_stop_clear_pending(uint32_t call_id) {
  if (cover_stop_pending_call_id() == call_id) cover_stop_pending_call_id() = 0;
}

inline bool cover_stop_track_pending(uint32_t call_id) {
  if (call_id == 0 || cover_stop_pending_call_id() != 0) return false;
  cover_stop_pending_call_id() = call_id;
  return true;
}

inline void cover_stop_cancel_pending_request() {
  uint32_t call_id = cover_stop_pending_call_id();
  if (call_id == 0) return;
  cover_stop_pending_call_id() = 0;
  ha_cancel_action_response_callback(call_id, "api disconnected");
}

inline void send_cover_command_action(const ParsedCfg &p, bool tilt_command = false) {
  const char *service = tilt_command
    ? cover_tilt_command_service(p.sensor)
    : cover_command_service(p.sensor);
  if (p.entity.empty() || service == nullptr) return;

  bool has_position = p.sensor == "set_position";
  bool wants_stop_response = p.sensor == "stop" && !tilt_command;
  esphome::api::HomeassistantActionRequest req;
  uint32_t call_id = wants_stop_response ? next_cover_stop_call_id() : 0;
  if (!ha_action_begin(req, service, false, has_position ? 2 : 1, call_id)) return;
  if (wants_stop_response) {
    req.call_id = call_id;
  }
  ha_action_add_entity(req, p.entity);
  if (has_position) {
    char buf[8];
    snprintf(buf, sizeof(buf), "%d", cover_position_value(p.unit));
    ha_action_add_data(req, tilt_command ? "tilt_position" : "position", buf);
  }
  bool cover_stop_tracked = false;
  if (wants_stop_response) {
    std::string entity_id = p.entity;
    const uint32_t generation = ha_subscription_generation();
    cover_stop_tracked = cover_stop_track_pending(req.call_id);
    if (cover_stop_tracked) {
      if (!ha_register_action_response_callback(
        req.call_id,
        [entity_id, generation, call_id = req.call_id](const esphome::api::ActionResponse &response) {
          cover_stop_clear_pending(call_id);
          if (generation != ha_subscription_generation()) return;
          if (response.is_success()) return;
          ESP_LOGW("cover", "cover.stop_cover failed for %s: %s",
                   entity_id.c_str(), response.get_error_message().c_str());
        })) {
        cover_stop_clear_pending(req.call_id);
        cover_stop_tracked = false;
      }
    }
  }
  if (!ha_action_send(req) && cover_stop_tracked) {
    cover_stop_clear_pending(req.call_id);
    ha_cancel_action_response_callback(req.call_id, "send failed");
  }
}

inline void send_cover_command_action(const std::string &entity_id,
                                      const std::string &mode,
                                      bool tilt_command = false) {
  ParsedCfg p;
  p.entity = entity_id;
  p.sensor = mode;
  send_cover_command_action(p, tilt_command);
}

inline void send_cover_command_action(const CoverCommandCtx &ctx) {
  const ParsedCfg &p = ctx.config;
  if (!cover_command_supported(p.sensor, ctx.supported_features_known, ctx.supported_features)) {
    ESP_LOGW("cover", "Cover command %s is not supported for %s",
             p.sensor.c_str(), p.entity.c_str());
    return;
  }
  send_cover_command_action(
    p,
    cover_command_use_tilt(p.sensor, ctx.supported_features_known, ctx.supported_features));
}

inline bool send_numeric_slider_action(const std::string &entity_id, double value,
                                       const espdesktop::number_slider::Metadata &metadata) {
  const char *service = espdesktop::number_slider::service_for_entity(entity_id);
  if (!service) {
    ESP_LOGW("slider", "Ignoring numeric slider command for unsupported entity %s",
             entity_id.c_str());
    return false;
  }
  esphome::api::HomeassistantActionRequest req;
  if (!ha_action_begin(req, service, false, 2)) return false;
  ha_action_add_entity(req, entity_id);
  const std::string formatted = espdesktop::number_slider::format_value(value, metadata);
  ha_action_add_data(req, "value", formatted.c_str());
  return ha_action_send(req);
}

// Send HA action for a percentage slider change or its on-card toggle.
inline bool send_slider_action(const std::string &entity_id, int value, bool /* legacy_cover_tilt */ = false) {
  if (!companion_volume_control_valid(entity_id)) return false;
  char request_id[24];
  snprintf(request_id, sizeof(request_id), "volume-%08lx",
           static_cast<unsigned long>(companion_next_request_number()));
  return invoke_companion_value(entity_id, value, request_id);
}

// Parse "min-max" kelvin range from the unit config field (e.g. "2000-6500").
inline void parse_kelvin_range(const std::string &unit, int &min_k, int &max_k) {
  min_k = 2000; max_k = 6500;
  if (unit.empty()) return;
  auto dash = unit.find('-');
  if (dash == std::string::npos || dash == 0) return;
  int a = atoi(unit.substr(0, dash).c_str());
  int b = atoi(unit.substr(dash + 1).c_str());
  if (a >= 1000 && b > a) { min_k = a; max_k = b; }
}

// Map a kelvin value to an lv_color_t by lerping between warm amber (low K) and
// cool blue-white (high K). Used when "Show light colour on card" is enabled.
//
// The interpolation is anchored to an absolute reference range
// (KELVIN_REF_MIN..KELVIN_REF_MAX) rather than the user's configured slider
// range. That way a narrow range (e.g. 5000-6000K) shows the actual subtle
// shift between two cool-white shades — instead of stretching the full
// amber-to-blue gradient across two values that should both look cool.
inline lv_color_t kelvin_to_fill_color(int k, int /*min_k*/, int /*max_k*/) {
  constexpr int KELVIN_REF_MIN = 2000;
  constexpr int KELVIN_REF_MAX = 6500;
  float t = (float)(k - KELVIN_REF_MIN) /
            (float)(KELVIN_REF_MAX - KELVIN_REF_MIN);
  if (t < 0.0f) t = 0.0f;
  if (t > 1.0f) t = 1.0f;
  // warm = 0xFF8012, cool = 0xB8CCFF
  uint8_t r = (uint8_t)(0xFF + t * (float)(0xB8 - 0xFF) + 0.5f);
  uint8_t g = (uint8_t)(0x80 + t * (float)(0xCC - 0x80) + 0.5f);
  uint8_t b = (uint8_t)(0x12 + t * (float)(0xFF - 0x12) + 0.5f);
  return lv_color_make(r, g, b);
}

// Send light.turn_on with color_temp_kelvin mapped from 0-100 pct over [min_k, max_k].

inline const char *light_temp_icon(const std::string &icon) {
  return (!icon.empty() && icon != "Auto") ? find_icon(icon.c_str()) : find_icon("Lightbulb");
}

inline std::string media_card_mode(const std::string &sensor) {
  return card_runtime_media_mode(sensor);
}

inline const char *media_service_for_mode(const std::string &mode) {
  return card_runtime_media_playback_service(mode);
}

inline void send_media_player_action(const std::string &entity_id,
                                     const char *service,
                                     const char *value_key = nullptr,
                                     const char *value = nullptr) {
  if (entity_id.empty() || service == nullptr || service[0] == '\0') return;
  esphome::api::HomeassistantActionRequest req;
  if (!ha_action_begin(req, service, false, value_key && value ? 2 : 1)) return;
  ha_action_add_entity(req, entity_id);
  if (value_key && value) {
    ha_action_add_data(req, value_key, value);
  }
  ha_action_send(req);
}

inline void send_media_shuffle_action(const std::string &entity_id,
                                      bool enabled) {
  send_media_player_action(
    entity_id, "media_player.shuffle_set", "shuffle",
    enabled ? "true" : "false");
}

inline void send_media_repeat_action(
    const std::string &entity_id,
    espdesktop::media::RepeatMode mode) {
  const char *value = espdesktop::media::repeat_mode_value(mode);
  if (!value) return;
  send_media_player_action(
    entity_id, "media_player.repeat_set", "repeat", value);
}

inline void send_media_volume_action(const std::string &entity_id, int value) {
  if (value < 0) value = 0;
  if (value > 100) value = 100;
  char buf[12];
  snprintf(buf, sizeof(buf), "%d.%02d", value / 100, value % 100);
  send_media_player_action(entity_id, "media_player.volume_set", "volume_level", buf);
}

inline void send_media_volume_command(
    const std::string &entity_id,
    const espdesktop::media::VolumeCommand &command) {
  using espdesktop::media::VolumeCommandKind;
  if (command.kind == VolumeCommandKind::SET_ABSOLUTE) {
    send_media_volume_action(entity_id, command.value);
  } else if (command.kind == VolumeCommandKind::STEP_DOWN) {
    send_media_player_action(entity_id, "media_player.volume_down");
  } else if (command.kind == VolumeCommandKind::STEP_UP) {
    send_media_player_action(entity_id, "media_player.volume_up");
  }
}

inline void send_media_seek_action(const std::string &entity_id, int value, float duration) {
  if (duration <= 0.0f) return;
  if (value < 0) value = 0;
  if (value > 100) value = 100;
  int seconds = (int)((duration * value / 100.0f) + 0.5f);
  char buf[16];
  snprintf(buf, sizeof(buf), "%d", seconds);
  send_media_player_action(entity_id, "media_player.media_seek", "seek_position", buf);
}

inline void send_media_playback_action(const std::string &entity_id,
                                       const std::string &mode) {
  if (entity_id.empty()) return;
  send_media_player_action(entity_id, media_service_for_mode(mode));
}

inline uint32_t next_media_playlist_call_id() {
  static uint32_t call_id = 400000;
  return call_id++;
}

inline bool navigation_handle_button_press(const ParsedCfg &config, int slot_num,
                                          lv_obj_t *button);
inline void handle_button_click(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj);

inline void handle_button_press(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj) {
  if (espdesktop::screensaver_pin().locked()) return;
  if (slot_num <= 0 || slot_num > MAX_GRID_SLOTS) return;
  ParsedCfg p = parse_cfg(cfg);
  if (navigation_handle_button_press(p, slot_num, btn_obj)) return;
  consume_button_touch_press(btn_obj);
  handle_button_click(cfg, slot_num, btn_obj);
}

// ── Button click dispatch ─────────────────────────────────────────────

struct MediaVolumeCtx;
inline void media_volume_open_modal(MediaVolumeCtx *ctx);
struct MediaControlCtx;
inline void media_control_open_modal(MediaControlCtx *ctx);
struct ClimateControlCtx;
inline void climate_control_open_modal(ClimateControlCtx *ctx);
struct ImageCardCtx;
inline void image_card_open_modal(ImageCardCtx *ctx);
inline void switch_confirmation_open_modal(const ParsedCfg &p, lv_obj_t *btn_obj, bool turn_on);
struct OptionSelectCtx;
inline void option_select_open_modal(OptionSelectCtx *ctx);
struct FanCardCtx;
inline bool fan_non_speed_card_type(const std::string &type);
inline void fan_card_handle_click(FanCardCtx *ctx);
inline void fan_control_open_modal(FanCardCtx *ctx);
struct CoverControlCtx;
inline void cover_control_open_modal(CoverControlCtx *ctx);
struct LightControlCtx;
inline void light_control_open_modal(LightControlCtx *ctx);

namespace espdesktop::cards {
inline bool basic_action_driver_handle_main_click(
    const Context &context, const ParsedCfg &config,
    int slot_number, lv_obj_t *button);
inline bool numeric_selectable_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *button);
inline bool navigation_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *button);
inline bool wifi_qr_driver_handle_main_click(
    const Context &context, const ParsedCfg &config, lv_obj_t *button);
}

// Handle a main-grid button press: dispatch push event, subpage nav,
// slider toggle, or entity toggle based on the config string.
inline void handle_button_click(const std::string &cfg, int slot_num,
                                lv_obj_t *btn_obj) {
  if (espdesktop::screensaver_pin().locked()) return;
  (void) btn_obj;
  ParsedCfg p = parse_cfg(cfg);
  if (retired_home_assistant_card(p)) return;
  const auto context = card_runtime_context(p);
  ESP_LOGI("button", "Main button %d clicked: type=%s entity=%s mode=%s label=%s",
           slot_num, p.type.c_str(), p.entity.c_str(), p.sensor.c_str(), p.label.c_str());
  if (card_runtime_passive(context)) return;
  if (espdesktop::cards::basic_action_driver_handle_main_click(
        context, p, slot_num, btn_obj)) return;
  if (espdesktop::cards::numeric_selectable_driver_handle_main_click(
        context, p, btn_obj)) return;
  if (espdesktop::cards::navigation_driver_handle_main_click(
        context, p, btn_obj)) return;
  if (espdesktop::cards::wifi_qr_driver_handle_main_click(
        context, p, btn_obj)) return;
  ESP_LOGE("card_runtime", "Card has no main-grid action driver: type=%s",
           p.type.c_str());
}
