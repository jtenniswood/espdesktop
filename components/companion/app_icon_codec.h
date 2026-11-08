#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

namespace esphome::companion::app_icon_codec {

// Pack repeated RGB565 pixels and alpha bytes independently. Literal runs keep
// detailed artwork bounded too; callers use the original bytes if packing grows.
inline size_t encode_plane(const uint8_t *input, size_t units, size_t width,
                           uint8_t *output, size_t capacity) {
  size_t position = 0, written = 0;
  const auto emit = [&](const uint8_t *bytes, size_t count) {
    if (output) {
      if (written > capacity || count > capacity - written) return false;
      std::memcpy(output + written, bytes, count);
    }
    written += count;
    return true;
  };
  while (position < units) {
    size_t run = 1;
    while (run < 128 && position + run < units &&
           std::memcmp(input + position * width, input + (position + run) * width, width) == 0) ++run;
    if (run >= 3) {
      const uint8_t token = 0x80 | static_cast<uint8_t>(run - 1);
      if (!emit(&token, 1) || !emit(input + position * width, width)) return 0;
      position += run;
    } else {
      const size_t start = position++;
      while (position < units && position - start < 128) {
        if (position + 2 < units &&
            std::memcmp(input + position * width, input + (position + 1) * width, width) == 0 &&
            std::memcmp(input + position * width, input + (position + 2) * width, width) == 0) break;
        ++position;
      }
      const uint8_t token = static_cast<uint8_t>(position - start - 1);
      if (!emit(&token, 1) || !emit(input + start * width, (position - start) * width)) return 0;
    }
  }
  return written;
}

inline size_t encoded_size(const uint8_t *pixels, size_t pixel_count) {
  return encode_plane(pixels, pixel_count, 2, nullptr, 0) +
         encode_plane(pixels + pixel_count * 2, pixel_count, 1, nullptr, 0);
}

inline bool encode(const uint8_t *pixels, size_t pixel_count, uint8_t *output, size_t capacity) {
  const size_t colors = encode_plane(pixels, pixel_count, 2, output, capacity);
  if (!colors || colors > capacity) return false;
  return encode_plane(pixels + pixel_count * 2, pixel_count, 1,
                      output + colors, capacity - colors) == capacity - colors;
}

inline bool decode_plane(const uint8_t *&input, const uint8_t *end,
                         uint8_t *output, size_t units, size_t width) {
  size_t position = 0;
  while (position < units) {
    if (input == end) return false;
    const uint8_t token = *input++;
    const size_t count = (token & 0x7f) + 1;
    if (count > units - position) return false;
    const size_t bytes = (token & 0x80) ? width : count * width;
    if (static_cast<size_t>(end - input) < bytes) return false;
    if (token & 0x80) {
      for (size_t index = 0; index < count; ++index)
        std::memcpy(output + (position + index) * width, input, width);
    } else {
      std::memcpy(output + position * width, input, bytes);
    }
    input += bytes;
    position += count;
  }
  return true;
}

inline bool decode(const uint8_t *input, size_t size, uint8_t *output, size_t pixel_count) {
  const uint8_t *end = input + size;
  return decode_plane(input, end, output, pixel_count, 2) &&
         decode_plane(input, end, output + pixel_count * 2, pixel_count, 1) && input == end;
}

}  // namespace esphome::companion::app_icon_codec
