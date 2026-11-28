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
  std::array<std::atomic<uint32_t>, bucket_count> workload_to_scanout{};
  std::atomic<uint32_t> workload_events{0};
  std::atomic<bool> workload_finished{false};
  std::atomic<uint32_t> completed_frames{0};
  std::atomic<uint32_t> last_submit_to_scanout_us{0};

  void touch(bool workload = false) {
    touch_us_ = esp_timer_get_time();
    workload_touch_ = workload;
    if (workload) workload_events.fetch_add(1, std::memory_order_relaxed);
  }

  void submit() {
    submitted_us_ = esp_timer_get_time();
    submitted_touch_us_ = touch_us_;
    submitted_workload_ = workload_touch_;
    touch_us_ = 0;
  }

  void complete() {
    const auto now = esp_timer_get_time();
    last_submit_to_scanout_us.store(now - submitted_us_, std::memory_order_relaxed);
    completed_frames.fetch_add(1, std::memory_order_relaxed);
    if (submitted_touch_us_ == 0 || submitted_us_ - submitted_touch_us_ >= 250000) return;
    const auto bucket = (now - submitted_touch_us_) / bucket_us;
    const auto index = bucket < bucket_count ? bucket : bucket_count - 1;
    auto &histogram = submitted_workload_ ? workload_to_scanout : touch_to_scanout;
    histogram[index].fetch_add(1, std::memory_order_relaxed);
  }

 private:
  int64_t touch_us_ = 0;
  int64_t submitted_us_ = 0;
  int64_t submitted_touch_us_ = 0;
  bool workload_touch_ = false;
  bool submitted_workload_ = false;
};

inline S3DisplayBenchmark s3_display_benchmark;
}  // namespace espdesktop
#endif
