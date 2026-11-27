#pragma once

#include <cstdint>

namespace espdesktop {
namespace slider_geometry {

inline int32_t edge_inset(int32_t length) {
  if (length <= 0) return 0;

  int32_t inset = (length * 8 + 50) / 100;
  if (inset < 8) inset = 8;
  if (inset > 24) inset = 24;

  const int32_t small_slider_limit = length / 4;
  if (inset > small_slider_limit) inset = small_slider_limit;
  return inset;
}

inline int32_t vertical_edge_inset(int32_t height) {
  return edge_inset(height);
}

inline bool vertical_pointer_position(int32_t pointer_y, int32_t top, int32_t bottom,
                                      int32_t position_count, int &position) {
  if (bottom < top || position_count <= 0) return false;

  const int32_t height = bottom - top + 1;
  const int32_t inset = vertical_edge_inset(height);
  const int32_t safe_top = top + inset;
  const int32_t safe_bottom = bottom - inset;
  if (safe_bottom <= safe_top) return false;

  if (pointer_y <= safe_top) {
    position = position_count;
    return true;
  }
  if (pointer_y >= safe_bottom) {
    position = 0;
    return true;
  }

  const int32_t span = safe_bottom - safe_top;
  const int32_t distance_from_bottom = safe_bottom - pointer_y;
  position = static_cast<int>(
    (static_cast<int64_t>(distance_from_bottom) * position_count + span / 2) / span);
  return true;
}

inline bool vertical_pointer_percent(int32_t pointer_y, int32_t top, int32_t bottom,
                                     int &percent) {
  return vertical_pointer_position(pointer_y, top, bottom, 100, percent);
}

inline bool horizontal_pointer_position(int32_t pointer_x, int32_t left, int32_t right,
                                        int32_t position_count, int &position) {
  if (right < left || position_count <= 0) return false;

  const int32_t width = right - left + 1;
  const int32_t inset = edge_inset(width);
  const int32_t safe_left = left + inset;
  const int32_t safe_right = right - inset;
  if (safe_right <= safe_left) return false;

  if (pointer_x <= safe_left) {
    position = 0;
    return true;
  }
  if (pointer_x >= safe_right) {
    position = position_count;
    return true;
  }

  const int32_t span = safe_right - safe_left;
  position = static_cast<int>(
    (static_cast<int64_t>(pointer_x - safe_left) * position_count + span / 2) / span);
  return true;
}

inline bool horizontal_pointer_percent(int32_t pointer_x, int32_t left, int32_t right,
                                       int &percent) {
  return horizontal_pointer_position(pointer_x, left, right, 100, percent);
}

}  // namespace slider_geometry
}  // namespace espdesktop
