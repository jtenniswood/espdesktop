#include <array>
#include <cassert>
#include <cstdint>
#include <vector>
#include "../../components/mipi_rgb/frame_buffer_pair.h"

int main() {
  using esphome::mipi_rgb::FrameBufferPair;
  std::array<uint16_t, 24> first{}, second{};
  FrameBufferPair frames;
  frames.reset(first.data(), second.data(), 6, 4);
  std::array<uint16_t, 6> strip{};
  auto write_row = [&](int row, uint16_t color) {
    strip.fill(color);
    assert(frames.write(0, row, 6, 1, reinterpret_cast<const uint8_t *>(strip.data()), 0, 0, 0));
  };
  auto write_pixel = [&](int x, int y, uint16_t pixel) {
    assert(frames.write(x, y, 1, 1, reinterpret_cast<const uint8_t *>(&pixel), 0, 0, 0));
  };
  auto present = [&](size_t copied) {
    frames.prepare();
    assert(frames.complete() == copied);
  };
  for (int row = 0; row < 4; ++row) write_row(row, row + 1);
  assert(first[0] == 0);
  present(0);
  // A full replacement in reverse strip order needs none of the previous frame.
  for (int row = 3; row >= 0; --row) write_row(row, row + 10);
  present(0);
  for (int row = 0; row < 4; ++row) assert(frames.front()[row * 6] == row + 10);
  // Uncovered rows must be preserved, including holes between full-width strips.
  write_row(0, 21);
  write_row(3, 24);
  present(12 * sizeof(uint16_t));
  assert(frames.front()[0] == 21 && frames.front()[6] == 11);
  assert(frames.front()[12] == 12 && frames.front()[18] == 24);
  // Repair before writing a partial rectangle without undoing an earlier full row.
  write_row(3, 30);
  write_pixel(2, 1, 42);
  present(18 * sizeof(uint16_t));
  assert(frames.front()[0] == 21 && frames.front()[6] == 11);
  assert(frames.front()[8] == 42 && frames.front()[18] == 30);
  frames.prepare();
  assert(frames.complete() == 0);

  // The tracked height is S3-specific. Taller surfaces still repair damage safely.
  std::vector<uint16_t> tall_a(481), tall_b(481);
  frames.reset(tall_a.data(), tall_b.data(), 1, 481);
  write_pixel(0, 480, 7);
  present(0);
  write_pixel(0, 0, 8);
  present(sizeof(uint16_t));
  assert(frames.front()[0] == 8 && frames.front()[480] == 7);
}
