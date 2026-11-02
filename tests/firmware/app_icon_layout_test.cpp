#include <array>
#include <cassert>
#include <vector>
#include "app_icon_layout.h"
#include "app_icon_resampler.h"

int main() {
  using espdesktop::app_icon::fit_side;
  // Red opaque artwork beside transparent black must retain its colour at
  // partially covered edges. Reductions average coverage, not dark mattes.
  const uint8_t input[] = {0, 248, 0, 0, 0, 248, 0, 0, 255, 0, 255, 0};
  uint8_t reduced[3]{};
  espdesktop::app_icon::resize_pixels(input, 2, reduced, 1);
  assert(reduced[0] == 0 && reduced[1] == 248 && reduced[2] == 128);
  uint8_t enlarged[4 * 4 * 3]{};
  espdesktop::app_icon::resize_pixels(input, 2, enlarged, 4);
  assert(enlarged[0] == 0 && enlarged[1] == 248);
  assert(enlarged[32] == 255 && enlarged[33] > 0 && enlarged[33] < 255);
  for (int i = 0; i < 16; ++i) {
    if (enlarged[32 + i]) assert(enlarged[i * 2 + 1] == 248);
  }
  uint8_t identity[sizeof(input)]{};
  espdesktop::app_icon::resize_pixels(input, 2, identity, 2);
  for (size_t i = 0; i < sizeof(input); ++i) assert(input[i] == identity[i]);

  // Compare native arithmetic with the original wide implementation across
  // real icon sizes, the overflow boundary, and transparent/opaque artwork.
  for (const int source_side : {1, 2, 17, 240, 512, 513}) {
    std::vector<uint8_t> source(source_side * source_side * 3);
    for (const int target_side : {1, 16, 60, 120, 200, 256, 257, 400}) {
      uint32_t random = 12345;
      for (auto &byte : source) {
        random = random * 1664525u + 1013904223u;
        byte = random >> 24;
      }
      std::vector<uint8_t> actual(target_side * target_side * 3), expected(actual.size());
      const auto compare = [&] {
        espdesktop::app_icon::resize_pixels(source.data(), source_side, actual.data(), target_side);
        espdesktop::app_icon::resize_pixels_with<esphome::artwork_image::ResampleAxis, uint64_t>(
            source.data(), source_side, expected.data(), target_side);
        assert(actual == expected);
      };
      compare();
      // Maximal colour and coverage exercise accumulation/rounding overflow.
      std::fill(source.begin(), source.end(), 255);
      compare();
      std::fill(source.begin() + source_side * source_side * 2, source.end(), 0);
      compare();
    }
  }

  assert(fit_side(100, 100, 0, 5, 8, {}) == 100);
  assert(fit_side(100, 100, 20, 5, 8, {}) == 75);
  assert(fit_side(100, 100, 40, 5, 8, {}) == 55);
  assert(fit_side(200, 100, 40, 5, 8, {}) == 55);
  assert(fit_side(100, 200, 40, 5, 8, {}) == 100);
  assert(fit_side(100, 100, 40, 5, 8, {2, 2, 2, 2}) == 110);
  assert(fit_side(100, 40, 40, 5, 8, {}) == 1);

  std::array<uint8_t, 64> alpha{};
  const auto check = [&](uint16_t left, uint16_t top) {
    const auto insets = espdesktop::app_icon::artwork_insets(alpha.data(), 8);
    assert(insets.left == left && insets.top == top);
  };
  check(0, 0);  // Completely transparent artwork must stay in its slot.
  alpha.fill(255);
  check(0, 0);  // Already tightly bounded icons must not move.
  alpha.fill(0);
  alpha[1] = 20;  // Faint shadow outside the visible artwork.
  for (size_t y = 3; y < 7; ++y)
    for (size_t x = 2; x < 6; ++x) alpha[y * 8 + x] = 255;
  check(2, 3);  // Asymmetric canvas insets stay independent.
  for (auto &value : alpha) value /= 4;
  check(2, 3);  // The same artwork remains aligned when translucent.
  assert(espdesktop::app_icon::artwork_insets(nullptr, 8).left == 0);
}
