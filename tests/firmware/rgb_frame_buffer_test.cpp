#include <array>
#include <cassert>
#include <cstdint>
#include <vector>
#include "../../components/mipi_rgb/frame_buffer_pair.h"

int main() {
  using esphome::mipi_rgb::FrameBufferPair;
  std::array<uint16_t, 24> front{}, back{};
  FrameBufferPair frames;
  frames.reset(front.data(), back.data(), 6, 4);
  // A full page arrives in separate strips: none may touch the scanned image.
  for (int row = 0; row < 4; ++row) {
    std::array<uint16_t, 6> strip;
    strip.fill(row + 1);
    assert(frames.write(0, row, 6, 1, reinterpret_cast<const uint8_t *>(strip.data()), 0, 0, 0));
    for (auto pixel : front) assert(pixel == 0);
  }
  assert(frames.dirty() && frames.pending() == back.data());
  // Once the driver confirms presentation, the old front is synchronized.
  frames.complete();
  assert(front == back && !frames.dirty());
  for (int row = 0; row < 4; ++row)
    for (int col = 0; col < 6; ++col) assert(front[row * 6 + col] == row + 1);
  // Padded/offset source rows and repeated partial updates preserve old pixels.
  std::array<uint16_t, 16> source{};
  source[5] = 91; source[6] = 92; source[9] = 93; source[10] = 94;
  for (int visit = 0; visit < 20; ++visit) {
    const auto original = front;
    const auto old_back = back;
    assert(frames.write(2, 1, 2, 2, reinterpret_cast<const uint8_t *>(source.data()), 1, 1, 1));
    // The scanned buffer remains unchanged regardless of which buffer is front.
    if (frames.pending() == back.data()) assert(front == original);
    else assert(back == old_back);
    frames.complete();
    assert(front == back && front[8] == 91 && front[9] == 92 && front[14] == 93 && front[15] == 94);
    assert(front[0] == 1 && front[23] == 4);
  }
  const auto original = front;
  assert(!frames.write(-1, 0, 1, 1, reinterpret_cast<const uint8_t *>(source.data()), 0, 0, 0));
  assert(!frames.write(5, 3, 2, 1, reinterpret_cast<const uint8_t *>(source.data()), 0, 0, 0));
  assert(!frames.write(0, 0, 1, 1, nullptr, 0, 0, 0));
  assert(!frames.write(0, 0, 1, 1, reinterpret_cast<const uint8_t *>(source.data()), -1, 0, 0));
  frames.complete();
  assert(front == original && back == original && !frames.dirty());
  frames.reset(nullptr, nullptr, 6, 4);
  assert(!frames.available());
}
