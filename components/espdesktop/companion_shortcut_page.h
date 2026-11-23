#pragma once

#include <cstdint>
#include <string>
#include <string_view>

inline bool companion_apple_shortcut_action(std::string_view value) {
  return value.substr(0, 14) == "appleshortcut.";
}

inline bool companion_apple_home_action(std::string_view value) {
  return value.rfind("applehome.control.", 0) == 0;
}

inline std::string companion_apple_shortcut_exclusion_key(std::string_view id) {
  constexpr std::string_view alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  uint64_t hash = 0xcbf29ce484222325ULL;
  for (const unsigned char ch : id) hash = (hash ^ ch) * 0x100000001b3ULL;
  std::string key(11, 'A');
  for (auto ch = key.rbegin(); ch != key.rend(); ++ch) {
    *ch = alphabet[hash & 63];
    hash >>= 6;
  }
  return key;
}

inline bool companion_apple_shortcut_hidden(std::string_view id, std::string_view exclusions) {
  if (exclusions.substr(0, 3) == "v1.") {
    const auto key = companion_apple_shortcut_exclusion_key(id);
    exclusions.remove_prefix(3);
    while (exclusions.size() >= key.size()) {
      if (exclusions.substr(0, key.size()) == key) return true;
      exclusions.remove_prefix(key.size());
    }
    return false;
  }
  while (!exclusions.empty()) {
    const auto delimiter = exclusions.find('|');
    if (exclusions.substr(0, delimiter) == id) return true;
    if (delimiter == std::string_view::npos) break;
    exclusions.remove_prefix(delimiter + 1);
  }
  return false;
}

inline bool companion_shortcut_app_id_valid(std::string_view value) {
  if (value.size() > 96 || value.find('.') == std::string_view::npos) return false;
  for (const char ch : value) {
    if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
          (ch >= '0' && ch <= '9') || ch == '-' || ch == '.')) return false;
  }
  return true;
}

inline bool companion_shortcut_page_app(std::string_view value) {
  return companion_shortcut_app_id_valid(value) && value.substr(0, 9) != "shortcut." &&
      value.substr(0, 7) != "folder." && value.substr(0, 5) != "stat." &&
      !companion_apple_shortcut_action(value) && !companion_apple_home_action(value);
}

inline const char *companion_shortcut_page_back_icon(const std::string &icon) {
  return icon.empty() || icon == "Auto" ? "Monitor" : icon.c_str();
}
