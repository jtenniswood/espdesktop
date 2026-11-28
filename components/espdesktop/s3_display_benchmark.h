#pragma once

#ifdef ESPDESKTOP_S3_DISPLAY_BENCHMARK
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <esp_timer.h>

namespace espdesktop {

enum class S3WorkloadKind : uint8_t { Tiles, Pages, Mixed, Pointer };

// Written on the device loop. Only cumulative results cross to the HTTP task.
class S3DisplayBenchmark {
 public:
  static constexpr uint32_t bucket_us = 5000;
  static constexpr uint32_t bucket_count = 51;
  std::array<std::atomic<uint32_t>, bucket_count> touch_to_scanout{};
  std::array<std::atomic<uint32_t>, bucket_count> workload_to_scanout{};
  std::array<std::atomic<uint32_t>, bucket_count> touch_to_driver_ready{};
  std::array<std::atomic<uint32_t>, bucket_count> workload_to_driver_ready{};
  std::array<std::atomic<uint32_t>, bucket_count> pointer_release_to_page{};
  std::atomic<uint32_t> workload_events{0};
  std::atomic<uint32_t> workload_copied_bytes{0};
  std::atomic<uint32_t> pointer_presses{0};
  std::atomic<uint32_t> pointer_page_changes{0};
  std::atomic<bool> workload_finished{false};
  std::atomic<S3WorkloadKind> workload_kind{S3WorkloadKind::Tiles};
  std::atomic<uint32_t> completed_frames{0};
  std::atomic<uint32_t> last_submit_to_scanout_us{0};

  void touch(bool workload = false) {
    touch_us_ = esp_timer_get_time();
    workload_touch_ = workload;
    if (workload) workload_events.fetch_add(1, std::memory_order_relaxed);
  }

  void page_requested(int64_t release_us) { page_release_us_ = release_us; }

  void submit() {
    submitted_us_ = esp_timer_get_time();
    submitted_touch_us_ = touch_us_;
    submitted_workload_ = workload_touch_;
    touch_us_ = 0;
    submitted_page_release_us_ = page_release_us_;
    page_release_us_ = 0;
  }

  void complete(int64_t ready_us, size_t copied_bytes) {
    const auto now = esp_timer_get_time();
    last_submit_to_scanout_us.store(now - submitted_us_, std::memory_order_relaxed);
    completed_frames.fetch_add(1, std::memory_order_relaxed);
    if (submitted_page_release_us_ > 0 && submitted_us_ - submitted_page_release_us_ < 250000) {
      pointer_release_to_page[bucket_(now - submitted_page_release_us_)].fetch_add(1, std::memory_order_relaxed);
    }
    if (submitted_touch_us_ == 0 || submitted_us_ - submitted_touch_us_ >= 250000) return;
    if (submitted_workload_) workload_copied_bytes.fetch_add(copied_bytes, std::memory_order_relaxed);
    auto &observed = submitted_workload_ ? workload_to_scanout : touch_to_scanout;
    observed[bucket_(now - submitted_touch_us_)].fetch_add(1, std::memory_order_relaxed);
    if (ready_us >= submitted_touch_us_ && ready_us <= now) {
      auto &driver = submitted_workload_ ? workload_to_driver_ready : touch_to_driver_ready;
      driver[bucket_(ready_us - submitted_touch_us_)].fetch_add(1, std::memory_order_relaxed);
    }
  }

 private:
  static uint32_t bucket_(int64_t elapsed_us) {
    const auto bucket = elapsed_us / bucket_us;
    return bucket < bucket_count ? bucket : bucket_count - 1;
  }
  int64_t touch_us_ = 0;
  int64_t submitted_us_ = 0;
  int64_t submitted_touch_us_ = 0;
  int64_t page_release_us_ = 0;
  int64_t submitted_page_release_us_ = 0;
  bool workload_touch_ = false;
  bool submitted_workload_ = false;
};

inline S3DisplayBenchmark s3_display_benchmark;
}  // namespace espdesktop
#endif
