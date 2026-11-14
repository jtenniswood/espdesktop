#pragma once

#include <string>
#include <string_view>

inline bool companion_apple_shortcut_action(std::string_view value) {
  return value.substr(0, 14) == "appleshortcut.";
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
      !companion_apple_shortcut_action(value);
}

inline const char *companion_shortcut_page_back_icon(const std::string &icon) {
  return icon.empty() || icon == "Auto" ? "Monitor" : icon.c_str();
}
