#pragma once

#ifdef ESPDESKTOP_S3_DISPLAY_BENCHMARK
#include <array>
#include <atomic>
#include <cstdint>
#include <esp_timer.h>

namespace espdesktop {

// Written on the device loop. Only cumulative results cross to the HTTP task.
class S3DisplayBenchmark {
 public:
  static constexpr uint32_t bucket_us = 5000;
  static constexpr uint32_t bucket_count = 51;
  std::array<std::atomic<uint32_t>, bucket_count> touch_to_scanout{};
  std::atomic<uint32_t> completed_frames{0};
  std::atomic<uint32_t> last_submit_to_scanout_us{0};

  void touch() { touch_us_ = esp_timer_get_time(); }

  void submit() {
    submitted_us_ = esp_timer_get_time();
    submitted_touch_us_ = touch_us_;
    touch_us_ = 0;
  }

  void complete() {
    const auto now = esp_timer_get_time();
    last_submit_to_scanout_us.store(now - submitted_us_, std::memory_order_relaxed);
    completed_frames.fetch_add(1, std::memory_order_relaxed);
    if (submitted_touch_us_ == 0 || submitted_us_ - submitted_touch_us_ >= 250000) return;
    const auto bucket = (now - submitted_touch_us_) / bucket_us;
    const auto index = bucket < bucket_count ? bucket : bucket_count - 1;
    touch_to_scanout[index].fetch_add(1, std::memory_order_relaxed);
  }

 private:
  int64_t touch_us_ = 0;
  int64_t submitted_us_ = 0;
  int64_t submitted_touch_us_ = 0;
};

inline S3DisplayBenchmark s3_display_benchmark;
}  // namespace espdesktop
#endif
