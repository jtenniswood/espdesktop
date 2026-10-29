#pragma once

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace esphome::mipi_rgb {

// LVGL may flush a page in many rotated strips. Keep them off the scanned
// buffer until the driver presents the complete refresh at a frame boundary.
class FrameBufferPair {
 public:
  void reset(uint16_t *front, uint16_t *back, int width, int height) {
    this->front_ = front;
    this->back_ = back;
    this->width_ = width;
    this->height_ = height;
    this->dirty_ = false;
  }

  bool available() const { return this->front_ && this->back_; }
  bool dirty() const { return this->dirty_; }
  const uint16_t *pending() const { return this->back_; }

  bool write(int x, int y, int width, int height, const uint8_t *pixels,
             int x_offset, int y_offset, int x_pad) {
    if (!this->available() || !pixels || x < 0 || y < 0 || width <= 0 || height <= 0 ||
        x > this->width_ || width > this->width_ - x ||
        y > this->height_ || height > this->height_ - y ||
        x_offset < 0 || y_offset < 0 || x_pad < 0) return false;
    const size_t stride = (static_cast<size_t>(x_offset) + width + x_pad) * sizeof(uint16_t);
    pixels += static_cast<size_t>(y_offset) * stride + x_offset * sizeof(uint16_t);
    for (int row = 0; row < height; ++row) {
      std::memcpy(this->back_ + static_cast<size_t>(y + row) * this->width_ + x,
                  pixels + row * stride, width * sizeof(uint16_t));
    }
    if (!this->dirty_) {
      this->left_ = x;
      this->top_ = y;
      this->right_ = x + width;
      this->bottom_ = y + height;
    } else {
      this->left_ = std::min(this->left_, x);
      this->top_ = std::min(this->top_, y);
      this->right_ = std::max(this->right_, x + width);
      this->bottom_ = std::max(this->bottom_, y + height);
    }
    this->dirty_ = true;
    return true;
  }

  // Call only after the RGB driver signals the old front buffer is reusable.
  // Copy just the changed rectangle so partial updates start from the same
  // image next time, without a whole-frame copy for every clock/status update.
  void complete() {
    if (!this->dirty_) return;
    std::swap(this->front_, this->back_);
    for (int row = this->top_; row < this->bottom_; ++row) {
      const size_t offset = static_cast<size_t>(row) * this->width_ + this->left_;
      std::memcpy(this->back_ + offset, this->front_ + offset,
                  (this->right_ - this->left_) * sizeof(uint16_t));
    }
    this->dirty_ = false;
  }

 protected:
  uint16_t *front_ = nullptr;
  uint16_t *back_ = nullptr;
  int width_ = 0;
  int height_ = 0;
  int left_ = 0, top_ = 0, right_ = 0, bottom_ = 0;
  bool dirty_ = false;
};

}  // namespace esphome::mipi_rgb
