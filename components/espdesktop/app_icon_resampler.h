#pragma once

#include <cstdint>
#include "../artwork_image/scanline_resampler.h"

namespace espdesktop::app_icon {
// Resample once at the actual display size rather than repeatedly transforming
// the icon while drawing. Average reductions and interpolate enlargements;
// premultiplied alpha keeps transparent edges free of dark halos.
template<typename Axis, typename Sum>
inline void resize_pixels_with(const uint8_t *source, int source_side,
                               uint8_t *target, int target_side) {
  if (!source || !target || source_side <= 0 || target_side <= 0) return;
  const size_t source_count = static_cast<size_t>(source_side) * source_side;
  const size_t target_count = static_cast<size_t>(target_side) * target_side;
  for (int y = 0; y < target_side; ++y) {
    const auto rows = Axis::at(source_side, target_side, y);
    for (int x = 0; x < target_side; ++x) {
      const auto columns = Axis::at(source_side, target_side, x);
      Sum alpha = 0, red = 0, green = 0, blue = 0;
      const Sum total = static_cast<Sum>(rows.total) * static_cast<Sum>(columns.total);
      for (int sy = rows.first; sy <= rows.last; ++sy) {
        for (int sx = columns.first; sx <= columns.last; ++sx) {
          const size_t index = static_cast<size_t>(sy) * source_side + sx;
          const uint16_t pixel = source[index * 2] | (source[index * 2 + 1] << 8);
          const Sum weight = static_cast<Sum>(rows.weight(sy)) * static_cast<Sum>(columns.weight(sx));
          const Sum coverage = source[source_count * 2 + index] * weight;
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
inline void resize_pixels(const uint8_t *source, int source_side,
                          uint8_t *target, int target_side) {
  // Typical card icons fit in native 32-bit arithmetic on ESP32. The largest
  // channel sum, including rounding, is 255 * (63 + 0.5) * axis_total^2.
  // An axis total <= 512 keeps it below UINT32_MAX. Larger artwork retains
  // the wide path, with identical weights, alpha handling and rounding.
  const int axis_total = source_side >= target_side ? source_side :
      (target_side <= 256 ? target_side * 2 : 513);
  if (source_side > 0 && target_side > 0 && axis_total <= 512) {
    resize_pixels_with<esphome::artwork_image::ResampleAxis32, uint32_t>(
        source, source_side, target, target_side);
  } else {
    resize_pixels_with<esphome::artwork_image::ResampleAxis, uint64_t>(
        source, source_side, target, target_side);
  }
}
}  // namespace espdesktop::app_icon
