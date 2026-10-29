#pragma once

#include <algorithm>
#include <string>

namespace espdesktop {
// LVGL uses 256 for an unscaled glyph. Large fills the available card area.
inline int card_icon_zoom(const std::string &size, int icon_width, int icon_height,
                          int available_width, int available_height) {
  const int requested = size == "large" ? 32767 : size == "medium" ? 384 : 256;
  if (requested == 256 || icon_width <= 0 || icon_height <= 0) return 256;
  return std::max(1, std::min(requested, std::min(
      available_width * 256 / icon_width, available_height * 256 / icon_height)));
}
}  // namespace espdesktop
