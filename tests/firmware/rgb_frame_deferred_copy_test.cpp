#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <vector>
#include "../../components/mipi_rgb/frame_buffer_pair.h"

namespace {
void check_s3_pixel_parity() {
  using esphome::mipi_rgb::FrameBufferPair;
  constexpr int side = 480;
  constexpr int strip_height = 24;
  std::vector<uint16_t> first(side * side), second(side * side), expected(side * side);
  FrameBufferPair frames;
  frames.reset(first.data(), second.data(), side, side);

  // Send enough strips to exceed the region limit during a full-page flush.
  std::array<uint16_t, side * strip_height> strip;
  for (uint16_t color : {0x1234, 0x4321}) {
    const auto visible = expected;
    for (int y = side - strip_height; y >= 0; y -= strip_height) {
      const auto row_color = static_cast<uint16_t>(color + y);
      strip.fill(row_color);
      assert(frames.write(0, y, side, strip_height,
                          reinterpret_cast<const uint8_t *>(strip.data()), 0, 0, 0));
      std::fill_n(expected.begin() + y * side, strip.size(), row_color);
    }
    assert(std::equal(visible.begin(), visible.end(), frames.front()));
    frames.prepare();
    assert(frames.complete() == 0);
    assert(std::equal(expected.begin(), expected.end(), frames.front()));
  }

  // Follow a full redraw with overlapping padded rectangles and a remote tile.
  constexpr int stride = 5;
  constexpr std::array<uint16_t, stride * 3> source{
      0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 4, 5, 6, 0};
  auto update = [&](int x, int y) {
    assert(frames.write(x, y, 3, 2, reinterpret_cast<const uint8_t *>(source.data()), 1, 1, 1));
    for (int row = 0; row < 2; ++row) {
      std::copy_n(source.begin() + (row + 1) * stride + 1, 3, expected.begin() + (y + row) * side + x);
    }
  };
  const auto full_page = expected;
  update(1, 1);
  update(2, 2);
  update(side - 3, side - 2);
  assert(std::equal(full_page.begin(), full_page.end(), frames.front()));
  frames.prepare();
  frames.complete();
  assert(std::equal(expected.begin(), expected.end(), frames.front()));

  update(24, 260);
  frames.prepare();
  frames.complete();
  assert(std::equal(expected.begin(), expected.end(), frames.front()));
}
}  // namespace

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
#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
  present(24 * sizeof(uint16_t));
#else
  present(12 * sizeof(uint16_t));
#endif
  assert(frames.front()[0] == 21 && frames.front()[6] == 11);
  assert(frames.front()[12] == 12 && frames.front()[18] == 24);
  // Repair before writing a partial rectangle without undoing an earlier full row.
  write_row(3, 30);
  write_pixel(2, 1, 42);
#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
  present(7 * sizeof(uint16_t));
#else
  present(18 * sizeof(uint16_t));
#endif
  assert(frames.front()[0] == 21 && frames.front()[6] == 11);
  assert(frames.front()[8] == 42 && frames.front()[18] == 30);
  frames.prepare();
  assert(frames.complete() == 0);

  // The tracked height is S3-specific. Taller surfaces still repair damage safely.
  std::vector<uint16_t> tall_a(481), tall_b(481);
  frames.reset(tall_a.data(), tall_b.data(), 1, 481);
  write_pixel(0, 480, 7);
#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
  present(sizeof(uint16_t));
#else
  present(0);
#endif
  write_pixel(0, 0, 8);
  present(sizeof(uint16_t));
  assert(frames.front()[0] == 8 && frames.front()[480] == 7);

  check_s3_pixel_parity();
}
