#pragma once

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <string>
#include <vector>

#include "button_grid_card_runtime.h"
#include "media_control_tabs.h"
#include "button_grid_string.h"
#include "config_field_decode.h"
#include "display_utf8_case.h"
#include "ha_state_limits.h"
#include "camera_refresh_policy.h"
#include "companion_capabilities_generated.h"
#include "companion_shortcut_page.h"
#include "app_shortcuts_generated.h"
#include "button_grid_saved_config_access_generated.h"
#include "button_grid_saved_config_security_generated.h"
#include "button_grid_saved_config_weather_generated.h"
#include "button_grid_saved_config_image_generated.h"
#include "button_grid_saved_config_climate_generated.h"
#include "button_grid_saved_config_light_control_generated.h"
#include "button_grid_saved_config_subpage_generated.h"
#include "button_grid_saved_config_switch_generated.h"
#include "button_grid_saved_config_fan_generated.h"
#include "button_grid_saved_config_media_generated.h"
#include "button_grid_saved_config_mower_generated.h"
#include "button_grid_saved_config_occupancy_generated.h"
#include "button_grid_saved_config_static_generated.h"
#include "button_grid_saved_config_vacuum_generated.h"

constexpr const char *IMAGE_LABEL_OPTION = card_runtime_option_name_image_label();
constexpr const char *IMAGE_ICON_OPTION = card_runtime_option_name_image_icon();
constexpr const char *IMAGE_MODAL_MODE_OPTION = card_runtime_option_name_image_modal_mode();
constexpr const char *MEDIA_COVER_ART_OPTION = card_runtime_option_name_media_cover_art();
constexpr const char *MEDIA_COVER_ART_DETAILS_OPTION = card_runtime_option_name_cover_art_details();
constexpr const char *MEDIA_COVER_ART_SECONDARY_ENTITY_OPTION = card_runtime_option_name_cover_art_secondary_entity();
constexpr const char *LIGHT_CONTROL_TABS_OPTION = card_runtime_option_name_light_tabs();
constexpr const char *LIGHT_CONTROL_DEFAULT_TABS_VALUE = "power|brightness|temperature|color";
constexpr const char *COVER_CONTROL_TABS_OPTION = card_runtime_option_name_cover_tabs();
constexpr const char *CLIMATE_CONTROL_TABS_OPTION = "climate_tabs";
constexpr const char *CLIMATE_CONTROL_DEFAULT_TABS_VALUE =
  "temperature|mode|preset|fan|swing|horizontal_swing";
constexpr const char *FAN_CONTROL_TABS_OPTION = card_runtime_option_name_fan_tabs();
constexpr const char *FAN_LIGHT_ENTITY_OPTION = card_runtime_option_name_fan_light_entity();
constexpr const char *FAN_CONTROL_DEFAULT_TABS_VALUE = "power|speed|preset|oscillation|direction";
constexpr const char *LABEL_DISPLAY_OPTION = card_runtime_option_name_label_display();
constexpr const char *NUMBER_DISPLAY_OPTION = card_runtime_option_name_number_display();
constexpr const char *TEMPERATURE_STEP_OPTION = card_runtime_option_name_temperature_step();
constexpr const char *VOLUME_MAX_OPTION = card_runtime_option_name_volume_max();
constexpr const char *MEDIA_CONTROL_TABS_OPTION = card_runtime_option_name_media_tabs();
constexpr const char *MEDIA_POWER_ENTITY_OPTION = card_runtime_option_name_power_entity();
constexpr const char *MEDIA_SPEAKER_GROUP_ENTITY_OPTION = card_runtime_option_name_speaker_group_entity();
constexpr const char *MEDIA_PLAYLIST_CONTENT_ID_OPTION = card_runtime_option_name_playlist_content_id();
constexpr const char *MEDIA_PLAYLIST_CONTENT_TYPE_OPTION = card_runtime_option_name_playlist_content_type();
constexpr const char *MEDIA_PLAYLIST_PLAYER_SOURCE_OPTION = card_runtime_option_name_playlist_player_source();
constexpr const char *SUBPAGE_CONNECTOR_OPTION = card_runtime_option_name_subpage_connector();
// Extract the Nth semicolon-delimited field from a config string
inline std::string cfg_field(const std::string &cfg, int idx) {
  size_t start = 0;
  for (int i = 0; i < idx; i++) {
    size_t pos = cfg.find(';', start);
    if (pos == std::string::npos) return "";
    start = pos + 1;
  }
  size_t end = cfg.find(';', start);
  return (end == std::string::npos) ? cfg.substr(start) : cfg.substr(start, end - start);
}

inline std::vector<std::string> split_config_fields(const std::string &value, char delim) {
  std::vector<std::string> out;
  size_t start = 0;
  while (start <= value.length()) {
    size_t end = value.find(delim, start);
    if (end == std::string::npos) end = value.length();
    out.push_back(value.substr(start, end - start));
    start = end + 1;
  }
  return out;
}

inline char compact_hex_char(uint8_t value) {
  return value < 10 ? static_cast<char>('0' + value)
                    : static_cast<char>('A' + value - 10);
}

inline std::string encode_compact_field(const std::string &value) {
  std::string out;
  out.reserve(value.size());
  for (unsigned char ch : value) {
    if (ch == '%' || ch == ',' || ch == ';' || ch == '|' || ch == ':') {
      out.push_back('%');
      out.push_back(compact_hex_char((ch >> 4) & 0x0F));
      out.push_back(compact_hex_char(ch & 0x0F));
    } else {
      out.push_back(static_cast<char>(ch));
    }
  }
  return out;
}

// Structured view of a button config string: entity;label;icon;icon_on;sensor;unit;type;precision;options
struct ParsedCfg {
  std::string entity;      // 0  HA entity_id
  std::string label;       // 1  display name (blank = use HA friendly_name)
  std::string icon;        // 2  icon name for off/default state
  std::string icon_on;     // 3  icon name for on state (blank = no swap)
  std::string sensor;      // 4  sensor entity, cover mode, or action name for Action cards
  std::string unit;        // 5  unit suffix for sensor display
  std::string type;        // 6  button type: "" (toggle), action, weather_forecast, slider, light_brightness, light_switch, fan_*, cover, garage, gate, lock, alarm, alarm_action, media, climate, push, subpage
  std::string precision;   // 7  decimal places for sensors; "text" = text sensor mode
  std::string options;     // 8  comma-delimited card options
};

inline bool brightness_slider_type(const std::string &type) {
  return card_runtime_brightness_slider_type(type);
}

inline bool fan_card_type(const std::string &type) {
  return card_runtime_fan_card_type(type);
}

inline const char *fan_card_default_icon_name(const std::string &type) {
  return card_runtime_fan_default_icon_name(type);
}

inline bool action_card_option_select_action(const std::string &action) {
  return card_runtime_option_select_action(action);
}

inline bool action_card_option_select(const ParsedCfg &p) {
  return p.type == "action" && action_card_option_select_action(p.sensor);
}

inline bool action_card_local_action(const ParsedCfg &p) {
  return p.type == "action" && p.sensor == "local";
}


inline bool cfg_option_token_present(const std::string &options, const char *name) {
  if (!name || !*name || options.empty()) return false;
  size_t start = 0;
  while (start <= options.length()) {
    size_t end = options.find(',', start);
    if (end == std::string::npos) end = options.length();
    if (options.compare(start, end - start, name) == 0) return true;
    start = end + 1;
  }
  return false;
}

inline std::string cfg_option_value(const std::string &options, const char *name) {
  if (!name || !*name || options.empty()) return "";
  std::string prefix = std::string(name) + "=";
  size_t start = 0;
  while (start <= options.length()) {
    size_t end = options.find(',', start);
    if (end == std::string::npos) end = options.length();
    if (options.compare(start, prefix.length(), prefix) == 0) {
      return decode_compact_field(options.substr(start + prefix.length(), end - start - prefix.length()));
    }
    start = end + 1;
  }
  return "";
}

inline std::string normalize_card_color_value(std::string value) {
  if (!value.empty() && value[0] == '#') value.erase(0, 1);
  if (value.size() != 6) return "";
  for (char &ch : value) {
    if (!std::isxdigit(static_cast<unsigned char>(ch))) return "";
    ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
  }
  return value;
}

inline std::string card_color_options_normalized(const std::string &options) {
  const std::string mode = cfg_option_value(options, "card_active_color");
  const bool explicit_mode = mode == "theme" || mode == "custom";
  const std::string on = normalize_card_color_value(cfg_option_value(options, "card_on_color"));
  std::string off = normalize_card_color_value(cfg_option_value(options, "card_off_color"));
  if (off.empty() && !explicit_mode) off = on;
  std::string out = off.empty() ? "" : "card_off_color=" + off;
  if (explicit_mode) {
    if (!out.empty()) out += ",";
    out += "card_active_color=" + mode;
  }
  if (mode == "custom" && !on.empty()) out += ",card_on_color=" + on;
  return out;
}

inline std::string options_without_card_colors(const std::string &options) {
  std::string out;
  size_t start = 0;
  while (start < options.size()) {
    size_t end = options.find(',', start);
    if (end == std::string::npos) end = options.size();
    const std::string token = options.substr(start, end - start);
    if (token.compare(0, 14, "card_on_color=") != 0 &&
        token.compare(0, 15, "card_off_color=") != 0 &&
        token.compare(0, 18, "card_active_color=") != 0) {
      if (!token.empty()) {
        if (!out.empty()) out += ",";
        out += token;
      }
    }
    start = end + 1;
  }
  return out;
}

inline bool large_numbers_explicitly_disabled(const std::string &options) {
  return cfg_option_value(options, "large_numbers") == "off";
}

inline void append_large_numbers_option(std::string &out, const std::string &options) {
  std::string value;
  if (large_numbers_explicitly_disabled(options)) {
    value = "large_numbers=off";
  } else if (cfg_option_token_present(options, "large_numbers")) {
    value = "large_numbers";
  }
  if (value.empty()) return;
  if (!out.empty()) out += ",";
  out += value;
}

inline void append_confirm_options(std::string &out, const std::string &options,
                                   const std::string &default_off_message,
                                   const std::string &default_on_message,
                                   const std::string &default_both_message,
                                   const std::string &requested_mode = "") {
  std::string stored_mode;
  if (cfg_option_token_present(options, "confirm_off") &&
      cfg_option_token_present(options, "confirm_on")) {
    stored_mode = "both";
  } else if (cfg_option_token_present(options, "confirm_on")) {
    stored_mode = "on";
  } else if (cfg_option_token_present(options, "confirm_off")) {
    stored_mode = "off";
  }
  if (stored_mode.empty()) return;
  std::string mode = requested_mode == "on" || requested_mode == "off"
    ? requested_mode
    : stored_mode;
  if (mode == "off" || mode == "both") {
    if (!out.empty()) out += ",";
    out += "confirm_off";
  }
  if (mode == "on" || mode == "both") {
    if (!out.empty()) out += ",";
    out += "confirm_on";
  }
  std::string message = cfg_option_value(options, "confirm_message");
  std::string yes = cfg_option_value(options, "confirm_yes");
  std::string no = cfg_option_value(options, "confirm_no");
  std::string default_message = mode == "on" ? default_on_message
    : mode == "both" ? default_both_message
    : default_off_message;
  std::string stored_default_message = stored_mode == "on" ? default_on_message
    : stored_mode == "both" ? default_both_message
    : default_off_message;
  if (!message.empty() && message != default_message && message != stored_default_message) {
    if (!out.empty()) out += ",";
    out += "confirm_message=" + encode_compact_field(message);
  }
  if (!yes.empty() && yes != "Yes") {
    if (!out.empty()) out += ",";
    out += "confirm_yes=" + encode_compact_field(yes);
  }
  if (!no.empty() && no != "No") {
    if (!out.empty()) out += ",";
    out += "confirm_no=" + encode_compact_field(no);
  }
}

inline int normalize_media_volume_max_percent(const std::string &value) {
  if (value.empty()) return card_runtime_media_volume_max_default();
  char *end = nullptr;
  long parsed = std::strtol(value.c_str(), &end, 10);
  if (end == value.c_str()) return card_runtime_media_volume_max_default();
  if (parsed < card_runtime_media_volume_max_min()) return card_runtime_media_volume_max_min();
  if (parsed > card_runtime_media_volume_max_max()) return card_runtime_media_volume_max_max();
  return static_cast<int>(parsed);
}

inline std::string trim_saved_option_value(const std::string &value) {
  const size_t first = value.find_first_not_of(" \t\r\n");
  if (first == std::string::npos) return "";
  return value.substr(first, value.find_last_not_of(" \t\r\n") - first + 1);
}

#include "button_grid_media_config.h"

inline void append_media_control_tabs_option(std::string &out, const std::string &options) {
  const bool power_available = !trim_saved_option_value(cfg_option_value(options, MEDIA_POWER_ENTITY_OPTION)).empty();
  const std::string tabs = espdesktop::media::normalize_control_tabs_value(
    cfg_option_value(options, MEDIA_CONTROL_TABS_OPTION), power_available);
  if (tabs == espdesktop::media::normalize_control_tabs_value("", power_available)) return;
  if (!out.empty()) out += ",";
  out += std::string(MEDIA_CONTROL_TABS_OPTION) + "=" + encode_compact_field(tabs);
}

inline std::string media_card_options_normalized(const std::string &options,
                                                 const std::string &mode) {
  if (mode == "control_modal") {
    std::string out;
    const std::string power_entity = trim_saved_option_value(
      cfg_option_value(options, MEDIA_POWER_ENTITY_OPTION));
    if (!power_entity.empty()) {
      out = std::string(MEDIA_POWER_ENTITY_OPTION) + "=" + encode_compact_field(power_entity);
    }
    append_media_control_tabs_option(out, options);
    std::string speaker_group_entity = trim_saved_option_value(
      cfg_option_value(options, MEDIA_SPEAKER_GROUP_ENTITY_OPTION));
    if (!speaker_group_entity.empty()) {
      if (!out.empty()) out += ",";
      out += std::string(MEDIA_SPEAKER_GROUP_ENTITY_OPTION) + "=" +
        encode_compact_field(speaker_group_entity);
    }
    if (cfg_option_value(options, "label_display") == "label") {
      if (!out.empty()) out += ",";
      out += "label_display=label";
    }
    if (cfg_option_value(options, "number_display") == "volume") {
      if (!out.empty()) out += ",";
      out += "number_display=volume";
    }
    int max_pct = normalize_media_volume_max_percent(
      cfg_option_value(options, VOLUME_MAX_OPTION));
    if (max_pct < card_runtime_media_volume_max_default()) {
      if (!out.empty()) out += ",";
      out += std::string(VOLUME_MAX_OPTION) + "=" + std::to_string(max_pct);
    }
    return out;
  }
  if (mode == "speaker_group") {
    std::string out;
    std::string speaker_group_entity = trim_saved_option_value(
      cfg_option_value(options, MEDIA_SPEAKER_GROUP_ENTITY_OPTION));
    if (!speaker_group_entity.empty()) {
      out = std::string(MEDIA_SPEAKER_GROUP_ENTITY_OPTION) + "=" +
        encode_compact_field(speaker_group_entity);
    }
    int max_pct = normalize_media_volume_max_percent(
      cfg_option_value(options, VOLUME_MAX_OPTION));
    if (max_pct < card_runtime_media_volume_max_default()) {
      if (!out.empty()) out += ",";
      out += std::string(VOLUME_MAX_OPTION) + "=" + std::to_string(max_pct);
    }
    return out;
  }
  if (mode == "playlist") {
    std::string out;
    std::string content_id = trim_saved_option_value(cfg_option_value(options, MEDIA_PLAYLIST_CONTENT_ID_OPTION));
    if (!content_id.empty()) {
      out = std::string(MEDIA_PLAYLIST_CONTENT_ID_OPTION) + "=" + encode_compact_field(content_id);
    }
    std::string content_type = trim_saved_option_value(cfg_option_value(options, MEDIA_PLAYLIST_CONTENT_TYPE_OPTION));
    if (content_type.empty()) content_type = "playlist";
    if (content_type != "playlist") {
      if (!out.empty()) out += ",";
      out += std::string(MEDIA_PLAYLIST_CONTENT_TYPE_OPTION) + "=" + encode_compact_field(content_type);
    }
    std::string player_source = trim_saved_option_value(cfg_option_value(options, MEDIA_PLAYLIST_PLAYER_SOURCE_OPTION));
    if (!player_source.empty()) {
      if (!out.empty()) out += ",";
      out += std::string(MEDIA_PLAYLIST_PLAYER_SOURCE_OPTION) + "=" + encode_compact_field(player_source);
    }
    return out;
  }
  if (mode == "now_playing") {
    return cfg_option_token_present(options, MEDIA_COVER_ART_OPTION)
      ? std::string(MEDIA_COVER_ART_OPTION)
      : "";
  }
  if (mode == "cover_art") {
    std::string out;
    if (cfg_option_token_present(options, MEDIA_COVER_ART_DETAILS_OPTION)) {
      if (!out.empty()) out += ",";
      out += MEDIA_COVER_ART_DETAILS_OPTION;
    }
    std::string secondary_entity = trim_saved_option_value(
      cfg_option_value(options, MEDIA_COVER_ART_SECONDARY_ENTITY_OPTION));
    if (!secondary_entity.empty()) {
      if (!out.empty()) out += ",";
      out += std::string(MEDIA_COVER_ART_SECONDARY_ENTITY_OPTION) + "=" +
             encode_compact_field(secondary_entity);
    }
    std::string speaker_group_entity = trim_saved_option_value(
      cfg_option_value(options, MEDIA_SPEAKER_GROUP_ENTITY_OPTION));
    if (!speaker_group_entity.empty()) {
      if (!out.empty()) out += ",";
      out += std::string(MEDIA_SPEAKER_GROUP_ENTITY_OPTION) + "=" +
             encode_compact_field(speaker_group_entity);
    }
    int max_pct = normalize_media_volume_max_percent(
      cfg_option_value(options, VOLUME_MAX_OPTION));
    if (max_pct < card_runtime_media_volume_max_default()) {
      if (!out.empty()) out += ",";
      out += std::string(VOLUME_MAX_OPTION) + "=" + std::to_string(max_pct);
    }
    const std::string power_entity = trim_saved_option_value(cfg_option_value(options, MEDIA_POWER_ENTITY_OPTION));
    if (!power_entity.empty()) {
      if (!out.empty()) out += ",";
      out += std::string(MEDIA_POWER_ENTITY_OPTION) + "=" + encode_compact_field(power_entity);
    }
    append_media_control_tabs_option(out, options);
    return out;
  }
  if (mode != "volume" && mode != "position") return "";
  std::string out;
  int max_pct = normalize_media_volume_max_percent(
    cfg_option_value(options, VOLUME_MAX_OPTION));
  if (mode == "volume" && max_pct < card_runtime_media_volume_max_default()) {
    out = std::string(VOLUME_MAX_OPTION) + "=" + std::to_string(max_pct);
  }
  append_large_numbers_option(out, options);
  return out;
}

inline void normalize_saved_config_media_fields(ParsedCfg &p) {
  const std::string raw_mode = p.sensor;
  if (raw_mode == "controls" && (p.icon.empty() || p.icon == "Speaker")) p.icon = "Auto";
  p.sensor = card_runtime_media_mode(p.sensor);
  if (p.sensor == "now_playing" && cfg_option_token_present(p.options, MEDIA_COVER_ART_OPTION)) {
    p.sensor = "cover_art";
  }
  if (p.sensor == "previous" && p.label == "Skip Previous") p.label = espdesktop_i18n("Previous");
  if (p.sensor == "next" && p.label == "Skip Next") p.label = espdesktop_i18n("Next");
  if (p.sensor == "volume") {
    if (p.label.empty() || p.label == "Media") p.label = espdesktop_i18n("Volume");
    p.icon = "Auto";
  }
  if (p.sensor == "playlist") {
    if (p.label.empty() || p.label == "Media") p.label = espdesktop_i18n("Playlist");
    if (p.icon.empty() || p.icon == "Auto") p.icon = "Music";
  }
  if (p.sensor == "position" && (p.label.empty() || p.label == "Track")) p.label = espdesktop_i18n("Position");
  if (p.sensor == "now_playing") {
    p.precision = card_runtime_media_now_playing_control(p.precision) ? p.precision : "";
  } else if (p.sensor == "cover_art") {
    p.precision.clear();
  } else if (card_runtime_media_state_display_mode(p.sensor) && p.precision == "state") {
    p.precision = "state";
  } else {
    p.precision.clear();
  }
}

inline bool weather_wind_uses_sensors(const ParsedCfg &config) {
  return config.precision == "wind" && cfg_option_value(config.options, "wind_source") == "sensors";
}
inline bool rainfall_uses_forecast(const ParsedCfg &config) {
  return config.precision == "rainfall" && card_runtime_weather_forecast_supported() &&
    cfg_option_value(config.options, "rainfall_source") == "forecast";
}
inline std::string weather_card_options_normalized(const std::string &options, const ParsedCfg &config) {
  if (config.precision == "wind" && cfg_option_value(options, "wind_source") == "sensors") return "wind_source=sensors";
  return config.precision == "rainfall" && card_runtime_weather_forecast_supported() &&
    cfg_option_value(options, "rainfall_source") == "forecast" ? "rainfall_source=forecast" : "";
}

inline std::string normalize_image_modal_mode(const std::string &value) {
  return card_runtime_image_modal_mode(value);
}

inline std::string image_card_options_normalized(const std::string &options,
                                                 const std::string &entity = "") {
  std::string out;
  if (cfg_option_token_present(options, IMAGE_LABEL_OPTION)) {
    out = IMAGE_LABEL_OPTION;
  }
  if (cfg_option_token_present(options, IMAGE_ICON_OPTION)) {
    if (!out.empty()) out += ",";
    out += IMAGE_ICON_OPTION;
  }
  std::string modal_mode = normalize_image_modal_mode(
    cfg_option_value(options, IMAGE_MODAL_MODE_OPTION));
  if (modal_mode != card_runtime_image_modal_mode_default()) {
    if (!out.empty()) out += ",";
    out += std::string(IMAGE_MODAL_MODE_OPTION) + "=" + modal_mode;
  }
  if (entity.empty() || entity.rfind("camera.", 0) == 0) {
    const auto mode = espdesktop::camera::refresh_mode(cfg_option_value(options, "image_modal_refresh_mode"));
    const std::string trigger = cfg_option_value(options, "image_modal_refresh_trigger");
    auto append = [&out](const char *key, const std::string &value) {
      if (!out.empty()) out += ",";
      out += std::string(key) + "=" + value;
    };
    if (mode == espdesktop::camera::RefreshMode::PERIODIC) {
      append("image_modal_refresh_mode", "periodic");
      const uint32_t interval = espdesktop::camera::refresh_interval_ms(
          cfg_option_value(options, "image_modal_refresh_interval"));
      if (interval != 10000) append("image_modal_refresh_interval", std::to_string(interval / 1000));
    } else if (mode == espdesktop::camera::RefreshMode::ACTIVITY && espdesktop::camera::valid_trigger(trigger)) {
      append("image_modal_refresh_mode", "activity");
      append("image_modal_refresh_trigger", trigger);
    }
  }
  return out;
}

inline bool light_control_tab_token_valid(const std::string &value) {
  return card_runtime_light_control_tab_valid(value);
}

inline std::string normalize_light_control_tabs_value(const std::string &value) {
  std::vector<std::string> parts = split_config_fields(
    value.empty() ? std::string(card_runtime_light_control_tabs_default()) : value, '|');
  std::vector<std::string> tabs;
  for (const auto &part : parts) {
    if (!light_control_tab_token_valid(part)) continue;
    if (std::find(tabs.begin(), tabs.end(), part) == tabs.end()) {
      tabs.push_back(part);
    }
  }
  if (tabs.empty()) tabs.push_back("power");
  std::string out;
  for (const auto &tab : tabs) {
    if (!out.empty()) out += "|";
    out += tab;
  }
  return out;
}

inline std::string light_control_card_options_normalized(const std::string &options) {
  std::string tabs = normalize_light_control_tabs_value(
    cfg_option_value(options, LIGHT_CONTROL_TABS_OPTION));
  if (tabs == card_runtime_light_control_tabs_default()) return "";
  return std::string(LIGHT_CONTROL_TABS_OPTION) + "=" + encode_compact_field(tabs);
}

inline bool cover_control_tab_token_valid(const std::string &value) {
  return card_runtime_cover_control_tab_valid(value);
}

inline std::string normalize_cover_control_tabs_value(const std::string &value) {
  std::vector<std::string> parts = split_config_fields(
    value.empty() ? std::string(card_runtime_cover_control_tabs_default()) : value, '|');
  std::vector<std::string> tabs;
  for (const auto &part : parts) {
    if (!cover_control_tab_token_valid(part)) continue;
    if (std::find(tabs.begin(), tabs.end(), part) == tabs.end()) {
      tabs.push_back(part);
    }
  }
  if (tabs.empty()) tabs.push_back("position");
  std::string out;
  for (const auto &tab : tabs) {
    if (!out.empty()) out += "|";
    out += tab;
  }
  return out;
}

inline std::string cover_card_options_normalized(const std::string &options,
                                                 const std::string &mode) {
  if (!card_runtime_cover_modal_mode(mode)) return "";
  std::string tabs = normalize_cover_control_tabs_value(
    cfg_option_value(options, COVER_CONTROL_TABS_OPTION));
  if (tabs == card_runtime_cover_control_tabs_default()) return "";
  return std::string(COVER_CONTROL_TABS_OPTION) + "=" + encode_compact_field(tabs);
}

inline bool climate_control_tab_token_valid(const std::string &value) {
  return value == "temperature" || value == "mode" || value == "preset" ||
         value == "fan" || value == "swing" || value == "horizontal_swing";
}

inline std::string normalize_climate_control_tabs_value(const std::string &value) {
  std::vector<std::string> parts = split_config_fields(
    value.empty() ? std::string(CLIMATE_CONTROL_DEFAULT_TABS_VALUE) : value, '|');
  std::vector<std::string> tabs;
  for (const auto &part : parts) {
    if (!climate_control_tab_token_valid(part)) continue;
    if (std::find(tabs.begin(), tabs.end(), part) == tabs.end()) {
      tabs.push_back(part);
    }
  }
  if (tabs.empty()) tabs.push_back("temperature");
  std::string out;
  for (const auto &tab : tabs) {
    if (!out.empty()) out += "|";
    out += tab;
  }
  return out;
}

inline bool fan_control_tab_token_valid(const std::string &value) {
  return value == "power" || value == "speed" || value == "preset" ||
         value == "oscillation" || value == "direction" || value == "light";
}

inline std::string normalize_fan_control_tabs_value(const std::string &value) {
  std::vector<std::string> parts = split_config_fields(
    value.empty() ? std::string(FAN_CONTROL_DEFAULT_TABS_VALUE) : value, '|');
  std::vector<std::string> tabs;
  for (const auto &part : parts) {
    if (!fan_control_tab_token_valid(part)) continue;
    if (std::find(tabs.begin(), tabs.end(), part) == tabs.end()) {
      tabs.push_back(part);
    }
  }
  if (tabs.empty()) tabs.push_back("power");
  std::string out;
  for (const auto &tab : tabs) {
    if (!out.empty()) out += "|";
    out += tab;
  }
  return out;
}

inline std::string fan_control_card_options_normalized(const std::string &options) {
  std::string light_entity = cfg_option_value(options, FAN_LIGHT_ENTITY_OPTION);
  std::string tabs_value = cfg_option_value(options, FAN_CONTROL_TABS_OPTION);
  std::string tabs = normalize_fan_control_tabs_value(tabs_value);
  if (light_entity.empty()) {
    std::vector<std::string> filtered;
    for (const auto &tab : split_config_fields(tabs, '|')) {
      if (tab != "light") filtered.push_back(tab);
    }
    tabs.clear();
    for (const auto &tab : filtered) {
      if (!tabs.empty()) tabs += "|";
      tabs += tab;
    }
    if (tabs.empty()) tabs = "power";
  }
  std::string default_tabs = FAN_CONTROL_DEFAULT_TABS_VALUE;
  if (!light_entity.empty()) default_tabs += "|light";
  if (tabs_value.empty()) tabs = default_tabs;
  std::string out;
  if (!light_entity.empty()) {
    out = std::string(FAN_LIGHT_ENTITY_OPTION) + "=" + encode_compact_field(light_entity);
  }
  if (tabs != default_tabs) {
    if (!out.empty()) out += ",";
    out += std::string(FAN_CONTROL_TABS_OPTION) + "=" + encode_compact_field(tabs);
  }
  return out;
}

inline bool image_card_label_enabled(const ParsedCfg &p) {
  return cfg_option_token_present(p.options, IMAGE_LABEL_OPTION);
}

inline bool image_card_icon_enabled(const ParsedCfg &p) {
  return cfg_option_token_present(p.options, IMAGE_ICON_OPTION);
}

inline void normalize_image_card_overlay_fields(std::string &icon,
                                                const std::string &options) {
  icon = cfg_option_token_present(options, IMAGE_ICON_OPTION)
    ? (icon.empty() || icon == "Auto" ? "Camera" : icon)
    : "Auto";
}

inline bool image_card_modal_fit_enabled(const ParsedCfg &p) {
  return normalize_image_modal_mode(
    cfg_option_value(p.options, IMAGE_MODAL_MODE_OPTION)) == "fit";
}

inline bool media_cover_art_enabled(const ParsedCfg &p) {
  return espdesktop::media::decode_config_v1(p).mode == espdesktop::media::Mode::COVER_ART;
}

inline bool media_cover_art_details_enabled(const ParsedCfg &p) {
  return espdesktop::media::decode_config_v1(p).show_track_details;
}

inline std::string media_cover_art_secondary_entity(const ParsedCfg &p) {
  return espdesktop::media::decode_config_v1(p).secondary_entity;
}



inline std::string normalize_subpage_kind(const std::string &value) {
  return value == "lights" || value == "media" ||
    value == "climate" || value == "presence" ||
    value == "switch" || value == "alarm" ||
    value == "cover" || value == "garage" || value == "gate" ||
    value == "lock" || value == "vacuum" ||
    value == "lawn_mower" ||
    value == "weather" || value == "sensor" ||
    value == "image" || value == "companion_stat" ? value : "";
}

inline std::string subpage_card_options_normalized(const std::string &options,
                                                   const std::string &sensor,
                                                   const std::string &precision) {
  std::string out;
  std::string connector = cfg_option_value(options, SUBPAGE_CONNECTOR_OPTION);
  if (connector == "mac_companion") out = std::string(SUBPAGE_CONNECTOR_OPTION) + "=" + connector;
  std::string kind = normalize_subpage_kind(cfg_option_value(options, "subpage_kind"));
  if (!kind.empty()) {
    if (!out.empty()) out += ",";
    out += "subpage_kind=" + kind;
  }
  if (!sensor.empty() && sensor != "indicator" && precision != "text" &&
      (cfg_option_token_present(options, "large_numbers") ||
       large_numbers_explicitly_disabled(options))) {
    append_large_numbers_option(out, options);
  }
  return out;
}

inline std::string normalize_door_window_subtype(const std::string &value) {
  return value == "window" ? "window" : "door";
}

inline const char *door_window_closed_icon_name(const std::string &subtype) {
  return normalize_door_window_subtype(subtype) == "window" ? "Window Closed" : "Door";
}

inline const char *door_window_open_icon_name(const std::string &subtype) {
  return normalize_door_window_subtype(subtype) == "window" ? "Window Open" : "Door Open";
}

inline std::string door_window_card_options_normalized(const std::string &options) {
  return cfg_option_token_present(options, "active_color") ? "active_color" : "";
}

inline std::string presence_card_options_normalized(const std::string &options) {
  return cfg_option_token_present(options, "active_color") ? "active_color" : "";
}

inline std::string normalize_climate_label_display(const std::string &value) {
  return card_runtime_climate_label_display(value);
}

inline std::string normalize_climate_number_display(const std::string &value) {
  return card_runtime_climate_number_display(value);
}

inline std::string normalize_climate_temperature_step(const std::string &value) {
  return card_runtime_climate_temperature_step(value);
}

inline bool climate_card_type(const std::string &type) {
  return type == "climate" || type == "climate_control";
}

inline std::string sanitize_climate_range_value(const std::string &value) {
  const char *start = value.c_str();
  char *end = nullptr;
  double parsed = std::strtod(start, &end);
  if (end == start) return "";
  while (*end != '\0') {
    if (!std::isspace(static_cast<unsigned char>(*end))) return "";
    end++;
  }
  double rounded = std::floor(parsed * 10.0 + 0.5) / 10.0;
  char buffer[24];
  std::snprintf(buffer, sizeof(buffer), "%.1f", rounded);
  std::string out(buffer);
  if (out.size() > 2 && out.substr(out.size() - 2) == ".0") {
    out.erase(out.size() - 2);
  }
  return out;
}

inline std::string normalize_climate_precision_config(const std::string &value) {
  std::vector<std::string> parts = split_config_fields(value, ':');
  std::string precision = parts.empty() ? "" : parts[0];
  if (precision == "0") precision.clear();
  if (!card_runtime_climate_precision_valid(precision)) precision.clear();
  std::string min = parts.size() > 1 ? sanitize_climate_range_value(parts[1]) : "";
  std::string max = parts.size() > 2 ? sanitize_climate_range_value(parts[2]) : "";
  if (min.empty() && max.empty()) return precision;
  return (precision.empty() ? std::string("0") : precision) + ":" + min + ":" + max;
}

inline std::string climate_card_options_normalized(const std::string &options,
                                                   bool include_control_tabs = false) {
  std::string label_display = normalize_climate_label_display(cfg_option_value(options, LABEL_DISPLAY_OPTION));
  std::string number_display = normalize_climate_number_display(cfg_option_value(options, NUMBER_DISPLAY_OPTION));
  std::string temperature_step = normalize_climate_temperature_step(cfg_option_value(options, TEMPERATURE_STEP_OPTION));
  std::string out;
  if (label_display != card_runtime_climate_label_display_default()) {
    out += std::string(LABEL_DISPLAY_OPTION) + "=" + label_display;
  }
  if (number_display != card_runtime_climate_number_display_default()) {
    if (!out.empty()) out += ",";
    out += std::string(NUMBER_DISPLAY_OPTION) + "=" + number_display;
  }
  if (temperature_step != card_runtime_climate_temperature_step_default()) {
    if (!out.empty()) out += ",";
    out += std::string(TEMPERATURE_STEP_OPTION) + "=" + temperature_step;
  }
  if (number_display != "icon" &&
      (cfg_option_token_present(options, "large_numbers") ||
       large_numbers_explicitly_disabled(options))) {
    append_large_numbers_option(out, options);
  }
  if (include_control_tabs) {
    std::string tabs = normalize_climate_control_tabs_value(
      cfg_option_value(options, CLIMATE_CONTROL_TABS_OPTION));
    if (tabs != CLIMATE_CONTROL_DEFAULT_TABS_VALUE) {
      if (!out.empty()) out += ",";
      out += std::string(CLIMATE_CONTROL_TABS_OPTION) + "=" + encode_compact_field(tabs);
    }
  }
  return out;
}

inline bool action_card_large_numbers_supported(const ParsedCfg &p) {
  if (p.type != "action" || action_card_local_action(p)) return false;
  std::string precision = cfg_option_value(p.options, "state_precision");
  return precision == "0" || precision == "1" || precision == "2" ||
         !cfg_option_value(p.options, "state_unit").empty();
}

inline bool card_large_numbers_supported(const ParsedCfg &p) {
  if (p.type.empty()) return !p.sensor.empty() && p.precision != "text";
  if (p.type == "action") return action_card_large_numbers_supported(p);
  if (p.type == "media") return p.sensor == "volume" || p.sensor == "position";
  if (climate_card_type(p.type)) {
    return normalize_climate_number_display(cfg_option_value(p.options, "number_display")) != "icon";
  }
  if (p.type == "subpage") return !p.sensor.empty() && p.sensor != "indicator" && p.precision != "text";
  return card_runtime_large_numbers_supported(p.type, p.precision);
}

inline bool companion_system_metric_config(const ParsedCfg &p) {
  return p.type == "companion" && companion_metric_capability(p.entity) != nullptr;
}

inline bool subpage_companion_stat_entity_valid(const std::string &entity) {
  return companion_metric_capability(entity) != nullptr;
}

inline bool subpage_companion_stat_config(const ParsedCfg &p) {
  return p.type == "subpage" &&
         cfg_option_value(p.options, "subpage_kind") == "companion_stat" &&
         subpage_companion_stat_entity_valid(p.entity);
}

inline const char *subpage_companion_stat_default_label(const std::string &entity) {
  const auto *capability = companion_metric_capability(entity);
  return capability ? capability->label : "Processor";
}

inline const char *subpage_companion_stat_default_unit(const std::string &entity) {
  const auto *capability = companion_metric_capability(entity);
  return capability ? capability->unit : "%";
}

inline std::string companion_metric_options_normalized(const std::string &options) {
  return cfg_option_token_present(options, "stat_labels_off") ? "stat_labels_off" : "";
}

inline std::string normalize_garage_label_display(const std::string &value) {
  return card_runtime_garage_label_display(value);
}

inline std::string garage_card_options_normalized(const std::string &options,
                                                  const std::string &sensor) {
  std::string out = normalize_garage_label_display(cfg_option_value(options, LABEL_DISPLAY_OPTION)) == "status"
    ? std::string(LABEL_DISPLAY_OPTION) + "=status"
    : "";
  std::string confirmation_mode = sensor == "open" ? "on" : sensor == "close" ? "off" : "";
  append_confirm_options(out, options, "Close the garage door?", "Open the garage door?",
                         "Open or close the garage door?", confirmation_mode);
  return out;
}

inline std::string normalize_gate_label_display(const std::string &value) {
  return card_runtime_gate_label_display(value);
}

inline std::string gate_card_options_normalized(const std::string &options,
                                                 const std::string &sensor) {
  (void)sensor;
  return normalize_gate_label_display(cfg_option_value(options, LABEL_DISPLAY_OPTION)) == "status"
    ? std::string(LABEL_DISPLAY_OPTION) + "=status"
    : "";
}

inline bool alarm_action_mode_valid(const std::string &mode) {
  return card_runtime_alarm_action_mode_valid(mode);
}

inline const char *alarm_action_icon_name(const std::string &mode) {
  return card_runtime_alarm_action_icon_name(mode);
}

inline bool alarm_action_legacy_icon_name(const std::string &mode, const std::string &icon) {
  return card_runtime_alarm_action_legacy_icon_name(mode, icon);
}

inline std::string normalize_alarm_icon_display(const std::string &value) {
  return card_runtime_alarm_icon_display(value);
}

inline std::string normalize_alarm_label_display(const std::string &value) {
  return card_runtime_alarm_label_display(value);
}

inline bool alarm_action_list_is_default(const std::vector<std::string> &actions) {
  if (actions.size() != card_runtime_alarm_default_action_count()) return false;
  for (size_t i = 0; i < actions.size(); i++) {
    if (actions[i] != card_runtime_alarm_default_action_at(i)) return false;
  }
  return true;
}

inline std::string alarm_card_options_normalized(const std::string &options) {
  std::string out;
  if (cfg_option_value(options, "pin_arm") == "0") out = "pin_arm=0";
  if (cfg_option_value(options, "pin_disarm") == "0") {
    if (!out.empty()) out += ",";
    out += "pin_disarm=0";
  }
  std::string actions = cfg_option_value(options, "actions");
  if (!actions.empty()) {
    std::vector<std::string> filtered;
    size_t start = 0;
    while (start <= actions.length()) {
      size_t end = actions.find('|', start);
      if (end == std::string::npos) end = actions.length();
      std::string action = actions.substr(start, end - start);
      if (alarm_action_mode_valid(action) &&
          std::find(filtered.begin(), filtered.end(), action) == filtered.end()) {
        filtered.push_back(action);
        if (filtered.size() >= card_runtime_alarm_max_visible_actions()) break;
      }
      start = end + 1;
    }
    if (!filtered.empty() && !alarm_action_list_is_default(filtered)) {
      std::string joined;
      for (const auto &action : filtered) {
        if (!joined.empty()) joined += "|";
        joined += action;
      }
      if (!out.empty()) out += ",";
      out += "actions=" + encode_compact_field(joined);
    }
  }
  std::string icon_display = normalize_alarm_icon_display(
    cfg_option_value(options, "icon_display"));
  if (icon_display != "status") {
    if (!out.empty()) out += ",";
    out += "icon_display=" + icon_display;
  }
  std::string label_display = normalize_alarm_label_display(
    cfg_option_value(options, "label_display"));
  if (label_display != "status") {
    if (!out.empty()) out += ",";
    out += "label_display=" + label_display;
  }
  return out;
}

inline std::string normalize_card_on_pattern(const std::string &value) {
  return value == "stripes" ? std::string("stripes") : std::string();
}

inline std::string switch_card_options_normalized(const std::string &options) {
  std::string out;
  append_large_numbers_option(out, options);
  std::string pattern = normalize_card_on_pattern(cfg_option_value(options, "on_pattern"));
  if (!pattern.empty()) {
    if (!out.empty()) out += ",";
    out += "on_pattern=" + pattern;
  }
  append_confirm_options(out, options, "Turn off this device?", "Turn on this device?", "Toggle this device?");
  return out;
}

inline void append_config_token(std::string &out, const std::string &token) {
  if (token.empty()) return;
  if (!out.empty()) out += ",";
  out += token;
}

inline std::string action_card_options_normalized(const std::string &options,
                                                  const std::string &action) {
  std::string out;
  std::string state_entity = trim_saved_option_value(cfg_option_value(options, "state_entity"));
  if (!state_entity.empty()) {
    append_config_token(out, "state_entity=" + encode_compact_field(state_entity));
    std::string state_precision = cfg_option_value(options, "state_precision");
    if (state_precision == "icon" || state_precision == "text") {
      append_config_token(out, "state_precision=" + state_precision);
    } else {
      std::string state_unit = trim_saved_option_value(cfg_option_value(options, "state_unit"));
      if (!state_unit.empty()) {
        append_config_token(out, "state_unit=" + encode_compact_field(state_unit));
      }
      if (state_precision == "0" || state_precision == "1" || state_precision == "2") {
        append_config_token(out, "state_precision=" + state_precision);
      }
      append_large_numbers_option(out, options);
    }
  }

  if (action == "script.turn_on") {
    std::string fields = trim_saved_option_value(cfg_option_value(options, "script_fields"));
    if (!fields.empty()) {
      append_config_token(out, "script_fields=" + encode_compact_field(fields));
    }
  }

  if (action == "script.turn_on" && cfg_option_token_present(options, "confirm_on")) {
    append_config_token(out, "confirm_on");
    std::string message = trim_saved_option_value(cfg_option_value(options, "confirm_message"));
    std::string yes = trim_saved_option_value(cfg_option_value(options, "confirm_yes"));
    std::string no = trim_saved_option_value(cfg_option_value(options, "confirm_no"));
    if (!message.empty() && message != "Run this script?") {
      append_config_token(out, "confirm_message=" + encode_compact_field(message));
    }
    if (!yes.empty() && yes != "Yes") {
      append_config_token(out, "confirm_yes=" + encode_compact_field(yes));
    }
    if (!no.empty() && no != "No") {
      append_config_token(out, "confirm_no=" + encode_compact_field(no));
    }
  }
  return out;
}

inline void normalize_saved_config_action_fields(ParsedCfg &p) {
  const bool number_entity = p.entity.size() > 7 && p.entity.compare(0, 7, "number.") == 0;
  const bool input_number_entity =
    p.entity.size() > 13 && p.entity.compare(0, 13, "input_number.") == 0;
  if ((p.sensor == "number.set_value" || p.sensor == "input_number.set_value") &&
      (number_entity || input_number_entity)) {
    p.sensor = number_entity ? "number.set_value" : "input_number.set_value";
  }
  if (action_card_option_select(p)) {
    p.sensor = card_runtime_option_select_canonical_action();
    p.unit.clear();
    p.precision.clear();
    p.options.clear();
    p.icon_on = "Auto";
    if (p.icon.empty() || p.icon == "Auto" || p.icon == "Chevron Down") p.icon = "Flash";
    return;
  }
  if (action_card_local_action(p)) {
    p.unit.clear();
    p.precision.clear();
    p.options.clear();
    p.icon_on = "Auto";
    if (p.icon.empty() || p.icon == "Auto" || p.icon == "Flash") p.icon = "Gesture Tap";
    return;
  }
  p.precision.clear();
}

inline void normalize_saved_config_fan_fields(ParsedCfg &p) {
  if (p.icon.empty() || p.icon == "Auto") p.icon = fan_card_default_icon_name(p.type);
  if (p.type == "fan_switch") {
    if (p.icon_on.empty() || p.icon_on == "Auto") p.icon_on = "Fan";
  } else {
    p.icon_on = "Auto";
  }
}

inline void normalize_saved_config_mower_fields(ParsedCfg &p) {
  p.sensor = card_runtime_lawn_mower_mode(p.sensor);
  if (p.icon.empty() || p.icon == "Auto") {
    p.icon = card_runtime_lawn_mower_default_icon_name(p.sensor);
  }
}

inline void normalize_saved_config_occupancy_fields(ParsedCfg &p) {
  if (p.type == "door_window") {
    p.precision = normalize_door_window_subtype(p.precision);
    if (p.icon.empty() || p.icon == "Auto") p.icon = door_window_closed_icon_name(p.precision);
    if (p.icon_on.empty() || p.icon_on == "Auto") p.icon_on = door_window_open_icon_name(p.precision);
  } else if (p.type == "presence") {
    if (p.icon.empty() || p.icon == "Auto") p.icon = "Motion Sensor Off";
    if (p.icon_on.empty() || p.icon_on == "Auto") p.icon_on = "Motion Sensor";
  }
}

inline std::string normalize_saved_config_occupancy_options(
    const std::string &options, const ParsedCfg &p) {
  return p.type == "door_window" ? door_window_card_options_normalized(options)
                                  : presence_card_options_normalized(options);
}

inline void normalize_saved_config_access_fields(ParsedCfg &p) {
  if (p.type == "garage") {
    if (!card_runtime_garage_mode_valid(p.sensor)) p.sensor.clear();
    if (!p.sensor.empty()) p.icon_on = "Auto";
  } else if (p.type == "gate") {
    if (!card_runtime_gate_mode_valid(p.sensor)) p.sensor.clear();
    if (!p.sensor.empty()) p.icon_on = "Auto";
  } else if (p.type == "cover") {
    if (!card_runtime_cover_mode_valid(p.sensor)) p.sensor.clear();
    if (p.sensor != "set_position") p.unit.clear();
  } else if (p.type == "lock") {
    if (!card_runtime_lock_mode_valid(p.sensor)) p.sensor.clear();
    if (!p.sensor.empty()) {
      p.icon_on = "Auto";
    } else if (p.icon_on.empty() || p.icon_on == "Auto") {
      p.icon_on = "Lock Open";
    }
  }
}

inline std::string normalize_saved_config_access_options(
    const std::string &options, const ParsedCfg &p) {
  if (p.type == "garage") return garage_card_options_normalized(options, p.sensor);
  if (p.type == "gate") return gate_card_options_normalized(options, p.sensor);
  return cover_card_options_normalized(options, p.sensor);
}

inline void normalize_saved_config_security_fields(ParsedCfg &p) {
  if (p.type == "alarm") {
    if (p.icon.empty() || p.icon == "Auto") p.icon = "Security";
    return;
  }
  if (!alarm_action_mode_valid(p.sensor)) p.sensor = "away";
  if (p.icon.empty() || p.icon == "Auto" || alarm_action_legacy_icon_name(p.sensor, p.icon)) {
    p.icon = alarm_action_icon_name(p.sensor);
  }
}

inline std::string normalize_saved_config_security_options(
    const std::string &options, const ParsedCfg &) {
  return alarm_card_options_normalized(options);
}

inline void normalize_saved_config_weather_fields(ParsedCfg &p, bool was_legacy_forecast) {
  if (was_legacy_forecast && p.label == "Weather") p.label.clear();
  if (p.precision != "wind" && p.precision != "rainfall" && !card_runtime_weather_forecast_precision(p.precision)) p.precision.clear();
  if (!weather_wind_uses_sensors(p)) p.sensor.clear();
}

inline std::string normalize_saved_config_weather_options(
    const std::string &options, const ParsedCfg &p) {
  return weather_card_options_normalized(options, p);
}

inline void normalize_saved_config_image_fields(ParsedCfg &p) {
  normalize_image_card_overlay_fields(p.icon, p.options);
}

inline std::string normalize_saved_config_image_options(
    const std::string &options, const ParsedCfg &p) {
  return image_card_options_normalized(options, p.entity);
}

inline void normalize_saved_config_climate_fields(ParsedCfg &p) {
  if (p.icon.empty()) p.icon = "Thermostat";
  if (p.icon_on.empty()) p.icon_on = "Auto";
  p.precision = normalize_climate_precision_config(p.precision);
}

inline std::string normalize_saved_config_climate_options(
    const std::string &options, const ParsedCfg &) {
  return climate_card_options_normalized(options, true);
}

inline std::string normalize_saved_config_light_control_options(
    const std::string &options, const ParsedCfg &) {
  return light_control_card_options_normalized(options);
}

inline const char *saved_config_subpage_default_label_key(const std::string &kind) {
  if (kind == "switch") return "label_switch";
  if (kind == "lights") return "label_lighting";
  if (kind == "climate") return "climate";
  if (kind == "presence") return "presence";
  if (kind == "media") return "media";
  if (kind == "alarm") return "alarm";
  if (kind == "cover") return "cover";
  if (kind == "garage") return "label_garage";
  if (kind == "gate") return "gate";
  if (kind == "lock") return "lock";
  if (kind == "vacuum") return "vacuum";
  if (kind == "lawn_mower") return "lawn_mower";
  if (kind == "weather") return "weather";
  if (kind == "sensor") return "label_sensor";
  if (kind == "image") return "label_camera";
  return "";
}

inline const char *saved_config_subpage_default_icon(const std::string &kind) {
  if (kind == "switch") return "Power Plug";
  if (kind == "lights") return "Lightbulb";
  if (kind == "climate") return "Thermostat";
  if (kind == "presence") return "Account";
  if (kind == "media") return "Speaker";
  if (kind == "alarm") return "Security";
  if (kind == "cover") return "Blinds";
  if (kind == "garage") return "Garage";
  if (kind == "gate") return "Gate";
  if (kind == "lock") return "Lock";
  if (kind == "vacuum") return "Robot Vacuum";
  if (kind == "lawn_mower") return "Robot Mower";
  if (kind == "weather") return "Weather Partly Cloudy";
  if (kind == "sensor") return "Gauge";
  if (kind == "image") return "Camera";
  return "";
}

inline void normalize_saved_config_subpage_fields(ParsedCfg &p) {
  const std::string kind = normalize_subpage_kind(cfg_option_value(p.options, "subpage_kind"));
  if (kind.empty()) return;
  if (kind == "companion_stat") {
    if (!subpage_companion_stat_entity_valid(p.entity)) p.entity = "stat.cpu";
    if (p.label.empty()) p.label = subpage_companion_stat_default_label(p.entity);
    if (p.icon.empty() || p.icon == "Auto") p.icon = "Gauge";
    p.icon_on = "Auto";
    p.sensor = "indicator";
    if (p.unit.empty()) p.unit = subpage_companion_stat_default_unit(p.entity);
    p.precision.clear();
    return;
  }
  const char *label_key = saved_config_subpage_default_label_key(kind);
  // The editor serializes preset defaults as English labels.
  if (p.label.empty() || p.label == espdesktop_i18n_key_en(label_key)) {
    p.label = espdesktop_i18n_key(label_key);
  }
  if (p.icon.empty() || p.icon == "Auto") p.icon = saved_config_subpage_default_icon(kind);
  p.icon_on = "Auto";
  p.sensor = "indicator";
  p.unit.clear();
  p.precision.clear();
}

inline std::string normalize_saved_config_subpage_options(
    const std::string &options, const ParsedCfg &p) {
  return subpage_card_options_normalized(options, p.sensor, p.precision);
}

inline bool companion_shortcut_template_id_valid(const std::string &value) {
  if (value.empty() || value.size() > 3 || (value[0] == '0' && value.size() > 1)) return false;
  for (char ch : value) if (ch < '0' || ch > '9') return false;
  return std::atoi(value.c_str()) <= 999;
}

inline bool companion_app_shortcuts_enabled(const ParsedCfg &p) {
  return p.type == "companion" && companion_shortcut_page_app(p.entity) &&
         p.sensor.empty() && cfg_option_token_present(p.options, "app_shortcuts");
}

inline bool companion_app_launch_card(const ParsedCfg &p) {
  return p.type == "companion" && !p.entity.empty() && p.sensor.empty() &&
         p.entity.rfind("folder.", 0) != 0 &&
         p.entity.rfind("shortcut.", 0) != 0 &&
         p.entity.rfind("stat.", 0) != 0;
}

inline bool companion_app_icon_enabled(const ParsedCfg &p) {
  return companion_app_launch_card(p) &&
         p.entity.rfind("webapp.", 0) != 0;
}

inline bool companion_url_opens_new_window(const ParsedCfg &p) {
  return p.sensor.rfind("url.", 0) == 0 && cfg_option_value(p.options, "url_open_behavior") == "new_window";
}

inline std::string companion_folder_open_behavior(const ParsedCfg &p) {
  if (p.entity.rfind("folder.", 0) == 0 &&
      cfg_option_value(p.options, "finder_open_behavior") == "same_window") {
    return "same_window";
  }
  return "new_window";
}

inline std::string companion_app_shortcut_tabs_normalized(const ParsedCfg &p) {
  const std::string value = cfg_option_value(p.options, "app_shortcuts_tabs");
  if (value.empty()) return "";
  if (value == "none") return value;
  std::vector<std::string> tabs;
  for (const auto &part : split_config_fields(value, '|')) {
    if (!companion_shortcut_template_id_valid(part) ||
        std::find(tabs.begin(), tabs.end(), part) != tabs.end()) {
      continue;
    }
    tabs.push_back(part);
  }
  std::string out;
  for (const auto &tab : tabs) {
    if (!out.empty()) out += "|";
    out += tab;
  }
  return out;
}

inline std::string companion_shortcut_preset_normalized(const ParsedCfg &p) {
  if (p.type != "companion" || p.entity.rfind("shortcut.", 0) != 0) return "";
  const std::string value = cfg_option_value(p.options, "app_shortcut_preset");
  if (value == "custom") return value;
  const size_t separator = value.rfind(':');
  if (separator == std::string::npos) return "";
  return companion_shortcut_app_id_valid(value.substr(0, separator)) &&
         companion_shortcut_template_id_valid(value.substr(separator + 1)) ? value : "";
}

inline std::string companion_card_options_normalized(const ParsedCfg &p) {
  if (p.sensor.rfind("url.", 0) == 0) {
    return companion_url_opens_new_window(p) ? "url_open_behavior=new_window" : "";
  }
  std::string out;
  if (p.entity.rfind("webapp.", 0) == 0 &&
      cfg_option_token_present(p.options, "webapp_icon_title")) {
    out = "webapp_icon_title";
  }
  const std::string preset = companion_shortcut_preset_normalized(p);
  if (!preset.empty()) {
    if (!out.empty()) out += ",";
    out += "app_shortcut_preset=" + encode_compact_field(preset);
    return out;
  }
  const auto add_token = [&out](const std::string &token) {
    if (!out.empty()) out += ",";
    out += token;
  };
  if (companion_folder_open_behavior(p) == "same_window") add_token("finder_open_behavior=same_window");
  if (companion_app_shortcuts_enabled(p)) {
    add_token("app_shortcuts");
    const std::string tabs = companion_app_shortcut_tabs_normalized(p);
    if (!tabs.empty()) add_token("app_shortcuts_tabs=" + encode_compact_field(tabs));
  }
  if (p.type == "companion" && p.entity.rfind("shortcut.", 0) != 0) {
    const std::string custom_color = cfg_option_value(p.options, "app_bg_color");
    if (custom_color.size() == 6 && std::all_of(custom_color.begin(), custom_color.end(),
        [](unsigned char ch) { return std::isxdigit(ch); })) {
      add_token("app_bg_color=" + custom_color);
    }
    if (companion_app_launch_card(p)) {
      if (cfg_option_token_present(p.options, "app_hide_label")) add_token("app_hide_label");
    }
  }
  return out;
}

inline ParsedCfg normalize_parsed_cfg(ParsedCfg p) {
  const std::string retired_type = retired_saved_card_type(p.type, p.entity);
  if (!retired_type.empty()) {
    p = ParsedCfg{};
    p.type = retired_type;
    p.icon = "Auto";
    p.icon_on = "Auto";
    return p;
  }
  const std::string icon_size = cfg_option_value(p.options, "icon_size");
  // Remove legacy sizes before normalization; only app artwork retains a size override.
  std::string type_options;
  size_t start = 0;
  while (start < p.options.size()) {
    size_t end = p.options.find(',', start);
    if (end == std::string::npos) end = p.options.size();
    const std::string token = p.options.substr(start, end - start);
    if (!token.empty() && token.compare(0, 10, "icon_size=") != 0) {
      if (!type_options.empty()) type_options += ",";
      type_options += token;
    }
    start = end + 1;
  }
  p.options = type_options;
  const std::string card_colors = card_color_options_normalized(p.options);
  p.options = options_without_card_colors(p.options);
  // Retired Mac playback cards become empty slots, including inside subpages.
  if (p.type == "companion" && (p.entity == "media.play_pause" ||
      p.entity == "media.previous" || p.entity == "media.next")) return ParsedCfg{};
  const bool normalized_saved_fan = normalize_saved_config_fan(
      p, normalize_saved_config_fan_fields, fan_control_card_options_normalized);
  const bool was_legacy_weather_forecast = migrate_saved_config_weather_legacy(p);
  normalize_saved_config_weather(
      p, was_legacy_weather_forecast, normalize_saved_config_weather_fields,
      normalize_saved_config_weather_options);
  normalize_saved_config_media(p, normalize_saved_config_media_fields,
                               media_card_options_normalized);
  normalize_saved_config_climate(
      p, normalize_saved_config_climate_fields, normalize_saved_config_climate_options);
  const bool normalized_saved_access = normalize_saved_config_access(
      p, normalize_saved_config_access_fields, normalize_saved_config_access_options);
  normalize_saved_config_security(
      p, normalize_saved_config_security_fields, normalize_saved_config_security_options);
  normalize_saved_config_image(
      p, normalize_saved_config_image_fields, normalize_saved_config_image_options);
  const bool normalized_saved_static = normalize_saved_config_static(p);
  normalize_saved_config_light_control(p, normalize_saved_config_light_control_options);
  normalize_saved_config_subpage(
      p, normalize_saved_config_subpage_fields, normalize_saved_config_subpage_options);
  if (p.type == "companion_mac_lock") {
    p.entity = "shortcut.command+control+q";
    if (p.label.empty()) p.label = card_runtime_label(p.type);
    if (p.icon.empty() || p.icon == "Auto") p.icon = card_runtime_default_icon_name(p.type);
    p.icon_on = "Auto";
    p.sensor.clear();
    p.unit.clear();
    p.precision.clear();
  }
  if (p.type == "companion") {
    p.icon_on = "Auto";
    if (companion_system_metric_config(p)) {
      p.sensor.clear();
      if (p.entity.rfind("stat.ip_address", 0) == 0) p.unit.clear();
      else if (p.unit.empty()) {
        if (p.entity == "stat.network_throughput") p.unit = "MB/s";
        else p.unit = "%";
      } else if (p.entity == "stat.network_throughput" && p.unit == "KB/s") {
        p.unit = "MB/s";
      }
      if (p.precision != "0" && p.precision != "1" && p.precision != "2") p.precision = "0";
      p.options = companion_metric_options_normalized(p.options);
    } else {
      p.unit.clear();
      p.precision.clear();
      p.options = companion_card_options_normalized(p);
    }
  }
  if (migrate_saved_config_vacuum_legacy(p)) {
    if (p.icon.empty() || p.icon == "Auto") p.icon = card_runtime_vacuum_default_icon_name(p.sensor);
  }
  if (p.type == "vacuum") {
    p.sensor = normalize_saved_config_vacuum_sensor(p.sensor);
    if (p.sensor != "clean_area") p.unit.clear();
    p.precision = normalize_saved_config_vacuum_precision(p.precision);
    p.options = normalize_saved_config_vacuum_options(p.options);
    p.icon_on = normalize_saved_config_vacuum_icon_on(p.icon_on);
    if (p.icon.empty() || p.icon == "Auto") p.icon = card_runtime_vacuum_default_icon_name(p.sensor);
  }
  const bool normalized_saved_mower =
      normalize_saved_config_mower(p, normalize_saved_config_mower_fields);
  normalize_saved_config_switch(p, switch_card_options_normalized);
  const bool normalized_saved_occupancy = normalize_saved_config_occupancy(
      p, normalize_saved_config_occupancy_fields,
      normalize_saved_config_occupancy_options);
  if (!normalized_saved_static && !normalized_saved_fan && !normalized_saved_mower && !normalized_saved_occupancy && !normalized_saved_access && !p.type.empty() && p.type != "action" && p.type != "alarm" && p.type != "alarm_action" && !climate_card_type(p.type) && p.type != "media" && p.type != "companion" && p.type != "subpage" && p.type != "image" && p.type != "light_control" && p.type != "vacuum" && p.type != "weather" && !card_large_numbers_supported(p)) {
    p.options.clear();
  }
  if (!card_colors.empty()) {
    if (!p.options.empty()) p.options += ",";
    p.options += card_colors;
  }
  if (companion_app_icon_enabled(p) &&
      (icon_size == "small" || icon_size == "medium" || icon_size == "large")) {
    if (!p.options.empty()) p.options += ",";
    p.options += "icon_size=" + icon_size;
  }
  return p;
}

inline ParsedCfg parse_cfg(const std::string &cfg) {
  ParsedCfg p;
  if (!cfg.empty() && cfg[0] == '~') {
    std::vector<std::string> f = split_config_fields(cfg.substr(1), ',');
    p.entity    = f.size() > 0 ? decode_compact_field(f[0]) : "";
    p.label     = f.size() > 1 ? decode_compact_field(f[1]) : "";
    p.icon      = f.size() > 2 ? decode_compact_field(f[2]) : "";
    p.icon_on   = f.size() > 3 ? decode_compact_field(f[3]) : "";
    p.sensor    = f.size() > 4 ? decode_compact_field(f[4]) : "";
    p.unit      = f.size() > 5 ? decode_compact_field(f[5]) : "";
    p.type      = f.size() > 6 ? decode_compact_field(f[6]) : "";
    p.precision = f.size() > 7 ? decode_compact_field(f[7]) : "";
    p.options   = f.size() > 8 ? decode_compact_field(f[8]) : "";
    return normalize_parsed_cfg(p);
  }
  p.entity    = cfg_field(cfg, 0);
  p.label     = cfg_field(cfg, 1);
  p.icon      = cfg_field(cfg, 2);
  p.icon_on   = cfg_field(cfg, 3);
  p.sensor    = cfg_field(cfg, 4);
  p.unit      = cfg_field(cfg, 5);
  p.type      = cfg_field(cfg, 6);
  p.precision = cfg_field(cfg, 7);
  p.options   = cfg_field(cfg, 8);
  return normalize_parsed_cfg(p);
}

inline bool cfg_option_enabled(const std::string &options, const char *name) {
  return cfg_option_token_present(options, name);
}

inline int media_volume_max_percent(const ParsedCfg &p) {
  return p.type == "media" && (p.sensor == "volume" || p.sensor == "control_modal" ||
                               p.sensor == "cover_art" ||
                               p.sensor == "speaker_group")
    ? normalize_media_volume_max_percent(cfg_option_value(p.options, VOLUME_MAX_OPTION))
    : card_runtime_media_volume_max_default();
}

inline std::string media_speaker_group_entity(const ParsedCfg &p) {
  if (p.type != "media" || (p.sensor != "control_modal" && p.sensor != "cover_art" &&
                            p.sensor != "speaker_group")) {
    return "";
  }
  return trim_saved_option_value(cfg_option_value(p.options, MEDIA_SPEAKER_GROUP_ENTITY_OPTION));
}

inline bool media_control_card_show_status_label(const ParsedCfg &p) {
  return p.type == "media" && p.sensor == "control_modal" &&
         cfg_option_value(p.options, "label_display") != "label";
}

inline bool media_control_card_show_volume_number(const ParsedCfg &p) {
  return p.type == "media" && p.sensor == "control_modal" &&
         cfg_option_value(p.options, "number_display") == "volume";
}

inline std::string action_card_state_entity(const ParsedCfg &p) {
  if (action_card_local_action(p)) return "";
  return p.type == "action" ? cfg_option_value(p.options, "state_entity") : "";
}

inline std::string action_card_state_unit(const ParsedCfg &p) {
  if (action_card_local_action(p)) return "";
  return p.type == "action" ? cfg_option_value(p.options, "state_unit") : "";
}

inline std::string action_card_state_precision(const ParsedCfg &p) {
  if (action_card_local_action(p)) return "";
  return p.type == "action" ? cfg_option_value(p.options, "state_precision") : "";
}

inline bool action_card_state_display_enabled(const ParsedCfg &p) {
  if (action_card_state_entity(p).empty()) return false;
  std::string precision = action_card_state_precision(p);
  return precision == "icon" || precision == "text" || precision == "0" ||
         precision == "1" || precision == "2" ||
         !action_card_state_unit(p).empty();
}

inline bool action_card_state_icon_mode(const ParsedCfg &p) {
  return action_card_state_display_enabled(p) &&
         action_card_state_precision(p) == "icon";
}

inline bool action_card_state_text_mode(const ParsedCfg &p) {
  return action_card_state_display_enabled(p) &&
         action_card_state_precision(p) == "text";
}

inline bool action_card_state_numeric_mode(const ParsedCfg &p) {
  return action_card_state_display_enabled(p) &&
         action_card_state_precision(p) != "icon" &&
         action_card_state_precision(p) != "text";
}

inline bool card_large_numbers_enabled(const ParsedCfg &p) {
  return card_large_numbers_supported(p) && cfg_option_enabled(p.options, "large_numbers");
}

inline bool card_large_numbers_disabled(const ParsedCfg &p) {
  return card_large_numbers_supported(p) && large_numbers_explicitly_disabled(p.options);
}

inline bool sensor_large_numbers_enabled(const ParsedCfg &p) {
  return card_large_numbers_enabled(p);
}



inline bool door_window_active_color_enabled(const ParsedCfg &p) {
  return p.type == "door_window" && cfg_option_enabled(p.options, "active_color");
}

inline bool presence_active_color_enabled(const ParsedCfg &p) {
  return p.type == "presence" && cfg_option_enabled(p.options, "active_color");
}

inline bool switch_confirmation_enabled(const ParsedCfg &p) {
  return p.type.empty() &&
         (cfg_option_enabled(p.options, "confirm_off") ||
          cfg_option_enabled(p.options, "confirm_on"));
}

inline bool action_script_confirmation_enabled(const ParsedCfg &p) {
  return p.type == "action" && p.sensor == "script.turn_on" &&
         cfg_option_enabled(p.options, "confirm_on");
}

inline bool garage_confirmation_enabled(const ParsedCfg &p) {
  return p.type == "garage" &&
         (cfg_option_enabled(p.options, "confirm_off") ||
          cfg_option_enabled(p.options, "confirm_on"));
}

inline bool garage_confirmation_required(const ParsedCfg &p, bool pending_open) {
  if (p.type != "garage") return false;
  return pending_open
    ? cfg_option_enabled(p.options, "confirm_on")
    : cfg_option_enabled(p.options, "confirm_off");
}

inline std::string action_script_fields(const ParsedCfg &p) {
  return p.type == "action" && p.sensor == "script.turn_on"
    ? cfg_option_value(p.options, "script_fields")
    : "";
}

inline bool switch_confirmation_required(const ParsedCfg &p, bool currently_on) {
  if (p.type.empty()) {
    return currently_on
      ? cfg_option_enabled(p.options, "confirm_off")
      : cfg_option_enabled(p.options, "confirm_on");
  }
  return false;
}

inline std::string switch_confirmation_default_message(const ParsedCfg &p) {
  if (action_script_confirmation_enabled(p)) {
    return espdesktop_i18n(std::string("Run this script?"));
  }
  bool confirm_off = cfg_option_enabled(p.options, "confirm_off");
  bool confirm_on = cfg_option_enabled(p.options, "confirm_on");
  if (p.type == "garage") {
    if (confirm_off && confirm_on) return espdesktop_i18n(std::string("Open or close the garage door?"));
    if (confirm_on) return espdesktop_i18n(std::string("Open the garage door?"));
    return espdesktop_i18n(std::string("Close the garage door?"));
  }
  if (confirm_off && confirm_on) return espdesktop_i18n(std::string("Toggle this device?"));
  if (confirm_on) return espdesktop_i18n(std::string("Turn on this device?"));
  return espdesktop_i18n(std::string("Turn off this device?"));
}

inline std::string switch_confirmation_message(const ParsedCfg &p) {
  std::string value = cfg_option_value(p.options, "confirm_message");
  return value.empty() ? switch_confirmation_default_message(p) : value;
}

inline std::string switch_confirmation_yes_text(const ParsedCfg &p) {
  std::string value = cfg_option_value(p.options, "confirm_yes");
  return value.empty() ? espdesktop_i18n(std::string("Yes")) : value;
}

inline std::string switch_confirmation_no_text(const ParsedCfg &p) {
  std::string value = cfg_option_value(p.options, "confirm_no");
  return value.empty() ? espdesktop_i18n(std::string("No")) : value;
}

inline int parse_precision(const std::string &s) {
  if (s.empty()) return 0;
  int v = atoi(s.c_str());
  return (v < 0) ? 0 : (v > 3) ? 3 : v;
}

inline int clamp_percent_value(int pct) {
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

inline bool light_brightness_to_percent(float brightness, int &pct) {
  if (!std::isfinite(brightness)) return false;
  if (brightness <= 0.0f) {
    pct = 0;
    return true;
  }
  pct = clamp_percent_value((int)((brightness * 100.0f + 127.0f) / 255.0f));
  if (pct < 1) pct = 1;
  return true;
}

inline std::string trim_display_unit(const std::string &unit) {
  size_t start = 0;
  while (start < unit.size() &&
         std::isspace(static_cast<unsigned char>(unit[start]))) {
    start++;
  }
  size_t end = unit.size();
  while (end > start &&
         std::isspace(static_cast<unsigned char>(unit[end - 1]))) {
    end--;
  }
  return unit.substr(start, end - start);
}

#ifndef ESPDESKTOP_HA_SUBSCRIPTION_SCOPE_CONSTANTS_DEFINED
constexpr uint32_t HA_SUBSCRIPTION_SCOPE_ALL = 0;
constexpr uint32_t HA_SUBSCRIPTION_SCOPE_DEFAULT = 1u << 0;
constexpr uint32_t HA_SUBSCRIPTION_SCOPE_COVER_ART = 1u << 1;
constexpr uint32_t HA_SUBSCRIPTION_SCOPE_PHASE3 = 1u << 2;
constexpr uint32_t HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS = 1u << 3;
#define ESPDESKTOP_HA_SUBSCRIPTION_SCOPE_CONSTANTS_DEFINED 1
#endif



inline std::string normalized_state_text(esphome::StringRef value,
                                         size_t max_len = HA_SHORT_STATE_MAX_LEN) {
  std::string text = trim_display_unit(string_ref_limited(value, max_len));
  for (char &ch : text) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return text;
}

inline std::string text_sensor_display_text(esphome::StringRef value,
                                            size_t max_len = HA_TEXT_SENSOR_STATE_MAX_LEN) {
  std::string raw = string_ref_limited(value, max_len);
  std::string out;
  out.reserve(raw.size());
  bool cap_next = true;
  bool last_space = false;
  for (size_t i = 0; i < raw.size();) {
    char ch = raw[i];
    unsigned char c = static_cast<unsigned char>(ch);
    if (ch == '\r' || ch == '\n') {
      if (ch == '\r' && i + 1 < raw.size() && raw[i + 1] == '\n') {
        i++;
        continue;
      }
      if (!out.empty() && out.back() == ' ') out.pop_back();
      if (!out.empty() && out.back() != '\n') out.push_back('\n');
      cap_next = true;
      last_space = false;
      i++;
      continue;
    }
    if (ch == '-' && !out.empty() && out.back() != '\n' && out.back() != ' ') {
      out.push_back(ch);
      cap_next = true;
      last_space = false;
      i++;
      continue;
    }
    if (ch == '_' || (c < 0x80 && std::isspace(c))) {
      if (!out.empty() && !last_space && out.back() != '\n') {
        out.push_back(' ');
        last_space = true;
      }
      cap_next = true;
      i++;
      continue;
    }
    if (!append_title_case_character(raw, i, out, cap_next)) break;
    last_space = false;
  }
  while (!out.empty() && (out.back() == ' ' || out.back() == '\n')) out.pop_back();
  return out;
}



#ifndef ESPDESKTOP_CONFIG_PARSER_ONLY
inline void lv_label_set_text_limited(lv_obj_t *label, esphome::StringRef value, size_t max_len) {
  std::string text = normalize_display_text(string_ref_limited(value, max_len));
  lv_label_set_text(label, text.c_str());
}
#endif

inline bool parse_float_ref(esphome::StringRef value, float &out) {
  char *end;
  out = strtof(value.c_str(), &end);
  return end != value.c_str();
}

inline bool parse_double_ref(esphome::StringRef value, double &out) {
  char *end;
  out = std::strtod(value.c_str(), &end);
  return end != value.c_str();
}

inline bool numeric_state_positive_ref(esphome::StringRef state) {
  float value = 0.0f;
  return parse_float_ref(state, value) && std::isfinite(value) && value > 0.0f;
}

inline bool is_entity_on_ref(esphome::StringRef state) {
  std::string value = normalized_state_text(state);
  return value == "on" || value == "true" || value == "1" ||
         value == "home" || value == "playing" ||
         value == "open" || value == "opened" ||
         value == "opening" || value == "closing" ||
         value == "unlocked" || value == "unlocking" || value == "jammed";
}

inline bool sensor_active_color_state_ref(esphome::StringRef state,
                                          bool numeric_mode) {
  return is_entity_on_ref(state) ||
         (numeric_mode && numeric_state_positive_ref(state));
}

inline bool presence_detected_ref(esphome::StringRef state) {
  std::string value = normalized_state_text(state);
  return value == "detected" || is_entity_on_ref(state);
}

inline bool ha_state_unavailable_ref(esphome::StringRef state) {
  std::string value = normalized_state_text(state);
  return value.empty() || value == "unavailable" || value == "unknown";
}

inline bool ha_entity_accepts_unknown_state(const std::string &entity_id) {
  return (entity_id.size() > 7 && entity_id.compare(0, 7, "button.") == 0) ||
         (entity_id.size() > 13 && entity_id.compare(0, 13, "input_button.") == 0) ||
         (entity_id.size() > 7 && entity_id.compare(0, 7, "select.") == 0) ||
         (entity_id.size() > 13 && entity_id.compare(0, 13, "input_select.") == 0);
}

inline bool ha_entity_state_unavailable_ref(const std::string &entity_id,
                                            esphome::StringRef state) {
  std::string value = normalized_state_text(state);
  if (value.empty() || value == "unavailable") return true;
  if (value == "unknown") return !ha_entity_accepts_unknown_state(entity_id);
  return false;
}

inline std::string sentence_cap_text(const std::string &state) {
  std::string out;
  out.reserve(state.size());
  bool cap_next = true;
  bool last_space = false;
  for (size_t i = 0; i < state.size();) {
    char ch = state[i];
    unsigned char c = static_cast<unsigned char>(ch);
    if (ch == '_' || ch == '-' || (c < 0x80 && std::isspace(c))) {
      if (!out.empty() && !last_space) {
        out.push_back(' ');
        last_space = true;
      }
      cap_next = true;
      i++;
      continue;
    }
    if (!append_title_case_character(state, i, out, cap_next)) break;
    last_space = false;
  }
  if (!out.empty() && out.back() == ' ') out.pop_back();
  return out;
}
