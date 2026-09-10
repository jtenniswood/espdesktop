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
#include "button_grid_string.h"
#include "companion_capabilities_generated.h"
struct ParsedCfg {
  std::string entity, label, icon, icon_on, sensor, unit, type, precision, options;
};
inline bool card_large_numbers_supported(const ParsedCfg &p) {
  return p.type == "clock" || p.type == "calendar" || p.type == "timezone" ||
         (p.type == "companion" && p.entity.rfind("stat.", 0) == 0) ||
         (p.type == "subpage" && p.entity.rfind("stat.", 0) == 0);
}
inline std::string normalize_subpage_kind(const std::string &kind) {
  return kind == "companion_stat" ? kind : "";
}
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

inline int hex_digit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

inline bool valid_utf8_bytes(const std::string &value) {
  size_t index = 0;
  while (index < value.size()) {
    const unsigned char first = static_cast<unsigned char>(value[index]);
    if (first <= 0x7F) { ++index; continue; }
    size_t count = 0;
    if (first >= 0xC2 && first <= 0xDF) count = 1;
    else if (first >= 0xE0 && first <= 0xEF) count = 2;
    else if (first >= 0xF0 && first <= 0xF4) count = 3;
    else return false;
    if (index + count >= value.size()) return false;
    const unsigned char second = static_cast<unsigned char>(value[index + 1]);
    if ((second & 0xC0) != 0x80) return false;
    if (first == 0xE0 && second < 0xA0) return false;
    if (first == 0xED && second > 0x9F) return false;
    if (first == 0xF0 && second < 0x90) return false;
    if (first == 0xF4 && second > 0x8F) return false;
    for (size_t offset = 2; offset <= count; ++offset) {
      if ((static_cast<unsigned char>(value[index + offset]) & 0xC0) != 0x80) return false;
    }
    index += count + 1;
  }
  return true;
}

inline std::string decode_compact_field(const std::string &value, size_t start, size_t len) {
  if (start > value.size()) return "";
  size_t end = start + len;
  if (end < start || end > value.size()) end = value.size();
  std::string out;
  out.reserve(end - start);
  for (size_t i = start; i < end;) {
    if (value[i] == '%' && i + 2 < end) {
      size_t run_end = i;
      std::string decoded;
      while (run_end + 2 < end && value[run_end] == '%') {
        int hi = hex_digit(value[run_end + 1]);
        int lo = hex_digit(value[run_end + 2]);
        if (hi < 0 || lo < 0) break;
        decoded.push_back(static_cast<char>((hi << 4) | lo));
        run_end += 3;
      }
      if (run_end > i) {
        if (valid_utf8_bytes(decoded)) out += decoded;
        else out.append(value, i, run_end - i);
        i = run_end;
        continue;
      }
    }
    out.push_back(value[i]);
    ++i;
  }
  return out;
}

inline std::string decode_compact_field(const std::string &value, size_t start, size_t len) {
  if (start > value.size()) return "";
  size_t end = start + len;
  if (end < start || end > value.size()) end = value.size();
  std::string out;
  out.reserve(end - start);
  for (size_t i = start; i < end;) {
    if (value[i] == '%' && i + 2 < end) {
      size_t run_end = i;
      std::string decoded;
      while (run_end + 2 < end && value[run_end] == '%') {
        int hi = hex_digit(value[run_end + 1]);
        int lo = hex_digit(value[run_end + 2]);
        if (hi < 0 || lo < 0) break;
        decoded.push_back(static_cast<char>((hi << 4) | lo));
        run_end += 3;
      }
      if (run_end > i) {
        if (valid_utf8_bytes(decoded)) out += decoded;
        else out.append(value, i, run_end - i);
        i = run_end;
        continue;
      }
    }
    out.push_back(value[i]);
    ++i;
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

inline std::string trim_saved_option_value(const std::string &value) {
  const size_t first = value.find_first_not_of(" \t\r\n");
  if (first == std::string::npos) return "";
  return value.substr(first, value.find_last_not_of(" \t\r\n") - first + 1);
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

inline std::string date_time_card_options_normalized(const std::string &options,
                                                     const ParsedCfg &p) {
  if (!card_large_numbers_supported(p)) return "";
  if (cfg_option_token_present(options, "large_numbers") ||
      large_numbers_explicitly_disabled(options)) {
    std::string out;
    append_large_numbers_option(out, options);
    return out;
  }
  return "";
}

inline std::string normalize_webhook_method(const std::string &value) {
  std::string method;
  method.reserve(value.size());
  for (char ch : value) {
    method.push_back(static_cast<char>(std::toupper(static_cast<unsigned char>(ch))));
  }
  if (method == "POST" || method == "PUT" || method == "PATCH" ||
      method == "DELETE") return method;
  return "GET";
}

inline std::string webhook_card_options_normalized(const std::string &options) {
  std::string headers = cfg_option_value(options, "webhook_headers");
  return headers.empty() ? std::string() : "webhook_headers=" + encode_compact_field(headers);
}

inline std::string normalize_card_on_pattern(const std::string &value) {
  return value == "stripes" ? std::string("stripes") : std::string();
}

inline void append_config_token(std::string &out, const std::string &token) {
  if (token.empty()) return;
  if (!out.empty()) out += ",";
  out += token;
}

inline bool companion_app_shortcuts_enabled(const ParsedCfg &p) {
  return p.type == "companion" &&
         (p.entity == "com.apple.Safari" || p.entity == "com.openai.codex" ||
          p.entity == "com.tinyspeck.slackmacgap") &&
         p.sensor.empty() &&
         cfg_option_token_present(p.options, "app_shortcuts");
}

inline bool companion_app_subpage_auto_switch_enabled(const ParsedCfg &p) {
  return companion_app_shortcuts_enabled(p) &&
         cfg_option_token_present(p.options, "app_shortcuts_auto_switch");
}

inline std::string companion_app_shortcut_tabs_normalized(const ParsedCfg &p) {
  const std::string value = cfg_option_value(p.options, "app_shortcuts_tabs");
  if (value.empty()) return "";
  if (value == "none") return value;
  const size_t count = p.entity == "com.openai.codex" ? 7 : 5;
  std::vector<std::string> tabs;
  for (const auto &part : split_config_fields(value, '|')) {
    if (part.size() != 1 || part[0] < '0' || static_cast<size_t>(part[0] - '0') >= count ||
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
  if (separator == std::string::npos || separator + 2 != value.size() ||
      value[separator + 1] < '0' || value[separator + 1] > '9') return "";
  const std::string bundle = value.substr(0, separator);
  const size_t index = static_cast<size_t>(value[separator + 1] - '0');
  const size_t count = bundle == "com.openai.codex" ? 7 :
    (bundle == "com.apple.Safari" || bundle == "com.tinyspeck.slackmacgap" ? 5 : 0);
  return index < count ? value : "";
}

inline std::string companion_card_options_normalized(const ParsedCfg &p) {
  const std::string preset = companion_shortcut_preset_normalized(p);
  if (!preset.empty()) {
    return "app_shortcut_preset=" + encode_compact_field(preset);
  }
  if (!companion_app_shortcuts_enabled(p)) return "";
  std::string out = companion_app_subpage_auto_switch_enabled(p)
    ? "app_shortcuts,app_shortcuts_auto_switch" : "app_shortcuts";
  const std::string tabs = companion_app_shortcut_tabs_normalized(p);
  if (!tabs.empty()) {
    out += ",app_shortcuts_tabs=" + encode_compact_field(tabs);
  }
  return out;
}

inline ParsedCfg normalize_parsed_cfg(ParsedCfg p) {
  if (!card_runtime_context(p).known) return {};
  if (p.icon.empty()) p.icon = card_runtime_default_icon_name(p.type);
  p.icon_on = "Auto";
  if (p.type == "companion") {
    p.options = companion_system_metric_config(p)
      ? date_time_card_options_normalized(p.options, p) : companion_card_options_normalized(p);
  } else if (p.type == "webhook") {
    p.sensor = normalize_webhook_method(p.sensor);
    p.options = webhook_card_options_normalized(p.options);
  } else if (p.type == "screen_lock") {
    p.entity.clear(); p.sensor.clear(); p.unit.clear(); p.options.clear();
  } else if (p.type != "subpage") {
    if (p.type == "calendar") p.entity.clear();
    p.options = date_time_card_options_normalized(p.options, p);
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

inline bool card_large_numbers_enabled(const ParsedCfg &p) {
  return card_large_numbers_supported(p) && cfg_option_enabled(p.options, "large_numbers");
}

inline bool card_large_numbers_disabled(const ParsedCfg &p) {
  return card_large_numbers_supported(p) && large_numbers_explicitly_disabled(p.options);
}

inline int parse_precision(const std::string &s) {
  if (s.empty()) return 0;
  int v = atoi(s.c_str());
  return (v < 0) ? 0 : (v > 3) ? 3 : v;
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

inline std::string sentence_cap_text(const std::string &state) {
  std::string out;
  out.reserve(state.size());
  bool cap_next = true;
  bool last_space = false;
  for (char ch : state) {
    unsigned char c = static_cast<unsigned char>(ch);
    if (ch == '_' || ch == '-' || std::isspace(c)) {
      if (!out.empty() && !last_space) {
        out.push_back(' ');
        last_space = true;
      }
      cap_next = true;
      continue;
    }
    if (std::isalpha(c)) {
      out.push_back(static_cast<char>(cap_next ? std::toupper(c) : std::tolower(c)));
      cap_next = false;
    } else {
      out.push_back(ch);
    }
    last_space = false;
  }
  if (!out.empty() && out.back() == ' ') out.pop_back();
  return out;
}

