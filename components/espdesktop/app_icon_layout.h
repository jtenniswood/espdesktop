#pragma once

#include <cstddef>
#include <cstdint>

namespace espdesktop::app_icon {

struct Insets {
  uint16_t left = 0;
  uint16_t top = 0;
  uint16_t right = 0;
  uint16_t bottom = 0;
};

// Align the artwork, ignoring transparent canvas and faint macOS shadows.
// A relative threshold also handles artwork that is intentionally translucent.
inline Insets artwork_insets(const uint8_t *alpha, uint16_t side) {
  if (!alpha || side == 0) return {};
  const size_t count = static_cast<size_t>(side) * side;
  uint8_t peak = 0;
  for (size_t i = 0; i < count; ++i) {
    if (alpha[i] > peak) peak = alpha[i];
  }
  if (peak == 0) return {};
  const uint8_t threshold = (static_cast<uint16_t>(peak) + 1u) / 2u;
  Insets result{side, side, side, side};
  for (size_t i = 0; i < count; ++i) {
    if (alpha[i] < threshold) continue;
    const uint16_t x = i % side;
    const uint16_t y = i / side;
    if (x < result.left) result.left = x;
    if (y < result.top) result.top = y;
    if (side - 1 - x < result.right) result.right = side - 1 - x;
    if (side - 1 - y < result.bottom) result.bottom = side - 1 - y;
  }
  return result;
}

}  // namespace espdesktop::app_icon
