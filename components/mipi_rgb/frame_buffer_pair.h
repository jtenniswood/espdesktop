#pragma once

#include <algorithm>
#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
#include <array>
#endif
#include <cstddef>
#include <cstdint>
#include <cstring>
#ifdef ESPDESKTOP_S3_DEFER_FRAME_COPIES
#include <bitset>
#endif

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
#ifdef ESPDESKTOP_S3_DEFER_FRAME_COPIES
    this->stale_ = {};
    this->overwritten_.reset();
    this->copied_bytes_ = 0;
#endif
#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
    this->region_count_ = 0;
    this->region_pixels_ = 0;
#endif
  }

  bool available() const { return this->front_ && this->back_; }
  bool dirty() const { return this->dirty_; }
  const uint16_t *front() const { return this->front_; }
  const uint16_t *pending() const { return this->back_; }

  bool write(int x, int y, int width, int height, const uint8_t *pixels,
             int x_offset, int y_offset, int x_pad) {
    if (!this->available() || !pixels || x < 0 || y < 0 || width <= 0 || height <= 0 ||
        x > this->width_ || width > this->width_ - x ||
        y > this->height_ || height > this->height_ - y ||
        x_offset < 0 || y_offset < 0 || x_pad < 0) return false;
#ifdef ESPDESKTOP_S3_DEFER_FRAME_COPIES
    if (width == this->width_ && this->height_ <= static_cast<int>(this->overwritten_.size())) {
      for (int row = y; row < y + height; ++row) this->overwritten_.set(row);
    } else {
      // Repair the old frame before a partial write so its new pixels remain intact.
      this->prepare();
    }
#endif
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
#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
    if (this->region_count_ < this->regions_.size()) {
      this->regions_[this->region_count_++] = {x, y, x + width, y + height};
      this->region_pixels_ += static_cast<size_t>(width) * height;
    } else {
      this->region_count_ = this->regions_.size() + 1;
    }
#endif
    return true;
  }

  // Restore any pixels from the previous frame that the next one still needs.
  void prepare() {
#ifdef ESPDESKTOP_S3_DEFER_FRAME_COPIES
    for (int row = this->stale_.top; row < this->stale_.bottom; ++row) {
      if (this->height_ <= static_cast<int>(this->overwritten_.size()) && this->overwritten_[row]) continue;
      this->copy_(this->stale_.left, row, this->stale_.right, row + 1);
      this->copied_bytes_ += (this->stale_.right - this->stale_.left) * sizeof(uint16_t);
    }
    this->stale_ = {};
#endif
  }

  // Call only after the RGB driver signals the old front buffer is reusable.
  // Copy just the changed rectangle so partial updates start from the same
  // image next time, without a whole-frame copy for every clock/status update.
  size_t complete() {
    if (!this->dirty_) return 0;
    std::swap(this->front_, this->back_);
    this->dirty_ = false;
#ifdef ESPDESKTOP_S3_DEFER_FRAME_COPIES
    this->stale_ = {this->left_, this->top_, this->right_, this->bottom_};
    this->overwritten_.reset();
    const auto copied_bytes = this->copied_bytes_;
    this->copied_bytes_ = 0;
    return copied_bytes;
#else
    const size_t bounding_pixels = static_cast<size_t>(this->right_ - this->left_) *
                                   (this->bottom_ - this->top_);
#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
    const auto region_count = this->region_count_;
    const auto region_pixels = this->region_pixels_;
    this->region_count_ = 0;
    this->region_pixels_ = 0;
    if (region_count <= this->regions_.size() && region_pixels < bounding_pixels) {
      for (size_t i = 0; i < region_count; ++i) {
        const auto &region = this->regions_[i];
        this->copy_(region.left, region.top, region.right, region.bottom);
      }
      return region_pixels * sizeof(uint16_t);
    }
#endif
    this->copy_(this->left_, this->top_, this->right_, this->bottom_);
    return bounding_pixels * sizeof(uint16_t);
#endif
  }

 protected:
  void copy_(int left, int top, int right, int bottom) {
    for (int row = top; row < bottom; ++row) {
      const size_t offset = static_cast<size_t>(row) * this->width_ + left;
      std::memcpy(this->back_ + offset, this->front_ + offset,
                  (right - left) * sizeof(uint16_t));
    }
  }

#ifdef ESPDESKTOP_S3_COPY_DIRTY_REGIONS
  struct Region {
    int left, top, right, bottom;
  };
  std::array<Region, 16> regions_{};
  size_t region_count_ = 0;
  size_t region_pixels_ = 0;
#endif
#ifdef ESPDESKTOP_S3_DEFER_FRAME_COPIES
  struct Damage {
    int left = 0, top = 0, right = 0, bottom = 0;
  };
  Damage stale_{};
  std::bitset<480> overwritten_{};
  size_t copied_bytes_ = 0;
#endif
  uint16_t *front_ = nullptr;
  uint16_t *back_ = nullptr;
  int width_ = 0;
  int height_ = 0;
  int left_ = 0, top_ = 0, right_ = 0, bottom_ = 0;
  bool dirty_ = false;
};

}  // namespace esphome::mipi_rgb
