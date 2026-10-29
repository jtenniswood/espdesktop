#pragma once

#include <cstdint>
#include "../artwork_image/scanline_resampler.h"

namespace espdesktop::app_icon {
// Resample once at the actual display size rather than repeatedly transforming
// the icon while drawing. Average reductions and interpolate enlargements;
// premultiplied alpha keeps transparent edges free of dark halos.
inline void resize_pixels(const uint8_t *source, int source_side,
                          uint8_t *target, int target_side) {
  using esphome::artwork_image::ResampleAxis;
  if (!source || !target || source_side <= 0 || target_side <= 0) return;
  const size_t source_count = static_cast<size_t>(source_side) * source_side;
  const size_t target_count = static_cast<size_t>(target_side) * target_side;
  for (int y = 0; y < target_side; ++y) {
    const auto rows = ResampleAxis::at(source_side, target_side, y);
    for (int x = 0; x < target_side; ++x) {
      const auto columns = ResampleAxis::at(source_side, target_side, x);
      uint64_t alpha = 0, red = 0, green = 0, blue = 0;
      const uint64_t total = static_cast<uint64_t>(rows.total) * columns.total;
      for (int sy = rows.first; sy <= rows.last; ++sy) {
        for (int sx = columns.first; sx <= columns.last; ++sx) {
          const size_t index = static_cast<size_t>(sy) * source_side + sx;
          const uint16_t pixel = source[index * 2] | (source[index * 2 + 1] << 8);
          const uint64_t weight = rows.weight(sy) * columns.weight(sx);
          const uint64_t coverage = source[source_count * 2 + index] * weight;
          alpha += coverage;
          red += ((pixel >> 11) & 31) * coverage;
          green += ((pixel >> 5) & 63) * coverage;
          blue += (pixel & 31) * coverage;
        }
      }
      const uint16_t pixel = alpha ?
          (((red + alpha / 2) / alpha) << 11) |
          (((green + alpha / 2) / alpha) << 5) |
          ((blue + alpha / 2) / alpha) : 0;
      const size_t index = static_cast<size_t>(y) * target_side + x;
      target[index * 2] = pixel & 255;
      target[index * 2 + 1] = pixel >> 8;
      target[target_count * 2 + index] = (alpha + total / 2) / total;
    }
  }
}
}  // namespace espdesktop::app_icon
