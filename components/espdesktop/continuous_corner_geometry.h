#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace espdesktop::corners {

// A fourth-power superellipse has zero curvature where it meets a straight
// edge. Its extent is twice the nominal circular radius, keeping a similar
// diagonal cut while spreading the transition further along each edge.
inline uint8_t coverage(int x, int y, int extent) {
  constexpr int samples = 4;
  int inside = 0;
  for (int sy = 0; sy < samples; ++sy) {
    const float dy = 1.0f - (y + (sy + 0.5f) / samples) / extent;
    const float dy2 = dy * dy;
    for (int sx = 0; sx < samples; ++sx) {
      const float dx = 1.0f - (x + (sx + 0.5f) / samples) / extent;
      const float dx2 = dx * dx;
      inside += dx2 * dx2 + dy2 * dy2 <= 1.0f;
    }
  }
  return static_cast<uint8_t>((inside * 255 + samples * samples / 2) / (samples * samples));
}

inline void fill_mask(uint8_t *pixels, int width, int height, int stride, int radius) {
  std::memset(pixels, 255, static_cast<size_t>(stride) * height);
  const int extent = std::min({radius * 2, width / 2, height / 2});
  for (int y = 0; y < extent; ++y) {
    for (int x = 0; x < extent; ++x) {
      const uint8_t alpha = coverage(x, y, extent);
      pixels[y * stride + x] = alpha;
      pixels[y * stride + width - x - 1] = alpha;
      pixels[(height - y - 1) * stride + x] = alpha;
      pixels[(height - y - 1) * stride + width - x - 1] = alpha;
    }
  }
}

// The card mask clips the outside. This mask only needs to find the inner
// edge, using distance along the local normal of the same curve.
inline void fill_outline_mask(uint8_t *pixels, int width, int height, int stride, int extent, int thickness) {
  std::memset(pixels, 0, static_cast<size_t>(stride) * height);
  for (int y = 0; y < height; ++y) {
    auto *row = pixels + y * stride;
    if (y < thickness || y >= height - thickness) std::memset(row, 255, width);
    else {
      std::memset(row, 255, thickness);
      std::memset(row + width - thickness, 255, thickness);
    }
  }
  const float inset = static_cast<float>(thickness) / extent;
  const int corner = std::min({extent + thickness, width / 2, height / 2});
  for (int y = 0; y < corner; ++y) {
    for (int x = 0; x < corner; ++x) {
      if (x < thickness || y < thickness) continue;
      int covered = 0;
      constexpr int samples = 4;
      for (int sy = 0; sy < samples; ++sy) {
        const float dy = std::max(0.0f, 1.0f - (y + (sy + 0.5f) / samples) / extent);
        const float dy3 = dy * dy * dy;
        for (int sx = 0; sx < samples; ++sx) {
          const float dx = std::max(0.0f, 1.0f - (x + (sx + 0.5f) / samples) / extent);
          const float dx3 = dx * dx * dx;
          const float inside = 1.0f - dx3 * dx - dy3 * dy;
          if (inside <= 0) {
            ++covered;
          } else if (inside < 1.0f && inside <= 4.0f * inset) {
            // Move one stroke width towards the edge along the curve normal.
            const float scale = inset / std::sqrt(dx3 * dx3 + dy3 * dy3);
            const float outer_x = dx + scale * dx3;
            const float outer_y = dy + scale * dy3;
            const float x2 = outer_x * outer_x;
            const float y2 = outer_y * outer_y;
            covered += x2 * x2 + y2 * y2 >= 1.0f;
          }
        }
      }
      const uint8_t alpha = static_cast<uint8_t>((covered * 255 + samples * samples / 2) / (samples * samples));
      pixels[y * stride + x] = alpha;
      pixels[y * stride + width - x - 1] = alpha;
      pixels[(height - y - 1) * stride + x] = alpha;
      pixels[(height - y - 1) * stride + width - x - 1] = alpha;
    }
  }
}

}  // namespace espdesktop::corners
