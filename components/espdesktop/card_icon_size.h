#pragma once

#include <algorithm>
#include <string>

namespace espdesktop {
inline std::string &card_icon_default_size() {
  static std::string size = "small";
  return size;
}

inline void set_card_icon_default_size(const std::string &value) {
  card_icon_default_size() = value == "Medium" || value == "medium" ? "medium" :
      value == "Large" || value == "large" ? "large" : "small";
}

inline std::string resolved_card_icon_size(const std::string &override_size) {
  return override_size == "small" || override_size == "medium" || override_size == "large"
      ? override_size : card_icon_default_size();
}

// LVGL uses 256 for an unscaled glyph. Large fills the available card area.
inline int card_icon_zoom(const std::string &size, int icon_width, int icon_height,
                          int available_width, int available_height) {
  const std::string effective = resolved_card_icon_size(size);
  const int requested = effective == "large" ? 32767 : effective == "medium" ? 384 : 256;
  if (requested == 256 || icon_width <= 0 || icon_height <= 0) return 256;
  return std::max(1, std::min(requested, std::min(
      available_width * 256 / icon_width, available_height * 256 / icon_height)));
}
}  // namespace espdesktop
