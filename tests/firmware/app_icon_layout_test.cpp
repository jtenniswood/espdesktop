#include <array>
#include <cassert>
#include "app_icon_layout.h"

int main() {
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
