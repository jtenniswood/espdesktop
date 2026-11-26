#pragma once

#include <atomic>
#include <cstddef>
#include <cstdlib>
#include <limits>
#include <type_traits>

#include "esphome/core/helpers.h"
#include "esphome/core/log.h"

#ifdef USE_ESP32
#include "esp_memory_utils.h"
#endif

// Stateless STL allocator for long-lived application metadata. ESPHome's
// RAMAllocator prefers external RAM and falls back to internal RAM. This
// wrapper supplies the failure contract required by STL containers and keeps
// lightweight diagnostics shared by every rebound allocator specialization.
struct EspDesktopExternalAllocatorStats {
  static inline std::atomic<size_t> external_bytes{0};
  static inline std::atomic<size_t> internal_bytes{0};
  static inline std::atomic<size_t> external_allocations{0};
  static inline std::atomic<size_t> internal_fallbacks{0};
  static inline std::atomic<size_t> failed_allocations{0};
};

template<typename T>
class EspDesktopExternalAllocator {
 public:
  using value_type = T;
  using is_always_equal = std::true_type;
  using propagate_on_container_move_assignment = std::true_type;

  EspDesktopExternalAllocator() noexcept = default;
  template<typename U>
  EspDesktopExternalAllocator(const EspDesktopExternalAllocator<U> &) noexcept {}

  template<typename U>
  struct rebind {
    using other = EspDesktopExternalAllocator<U>;
  };

  [[nodiscard]] T *allocate(size_t count) {
    if (count > max_size()) fail_allocation(count, true);
    esphome::RAMAllocator<T> allocator(ram_allocator_flags());
    T *result = allocator.allocate(count);
    if (result == nullptr && count != 0) fail_allocation(count, false);
    if (result == nullptr) return nullptr;

    const size_t bytes = count * sizeof(T);
#ifdef USE_ESP32
    if (esp_ptr_external_ram(result)) {
      EspDesktopExternalAllocatorStats::external_bytes.fetch_add(bytes, std::memory_order_relaxed);
      EspDesktopExternalAllocatorStats::external_allocations.fetch_add(1, std::memory_order_relaxed);
    } else {
      EspDesktopExternalAllocatorStats::internal_bytes.fetch_add(bytes, std::memory_order_relaxed);
      EspDesktopExternalAllocatorStats::internal_fallbacks.fetch_add(1, std::memory_order_relaxed);
    }
#else
    EspDesktopExternalAllocatorStats::internal_bytes.fetch_add(bytes, std::memory_order_relaxed);
    EspDesktopExternalAllocatorStats::internal_fallbacks.fetch_add(1, std::memory_order_relaxed);
#endif
    return result;
  }

  void deallocate(T *pointer, size_t count) noexcept {
    if (pointer == nullptr) return;
    const size_t bytes = count * sizeof(T);
#ifdef USE_ESP32
    if (esp_ptr_external_ram(pointer)) {
      subtract_saturating(EspDesktopExternalAllocatorStats::external_bytes, bytes);
    } else {
      subtract_saturating(EspDesktopExternalAllocatorStats::internal_bytes, bytes);
    }
#else
    subtract_saturating(EspDesktopExternalAllocatorStats::internal_bytes, bytes);
#endif
    esphome::RAMAllocator<T> allocator(ram_allocator_flags());
    allocator.deallocate(pointer, count);
  }

  constexpr size_t max_size() const noexcept {
    return std::numeric_limits<size_t>::max() / sizeof(T);
  }

  template<typename U>
  bool operator==(const EspDesktopExternalAllocator<U> &) const noexcept {
    return true;
  }

  template<typename U>
  bool operator!=(const EspDesktopExternalAllocator<U> &) const noexcept {
    return false;
  }

 private:
  static constexpr uint8_t ram_allocator_flags() {
    return static_cast<uint8_t>(esphome::RAMAllocator<T>::ALLOC_EXTERNAL |
                                esphome::RAMAllocator<T>::ALLOC_INTERNAL);
  }

  static void subtract_saturating(std::atomic<size_t> &value, size_t amount) {
    auto current = value.load(std::memory_order_relaxed);
    while (!value.compare_exchange_weak(current, current - (amount <= current ? amount : current),
                                       std::memory_order_relaxed)) {}
  }

  [[noreturn]] static void fail_allocation(size_t count, bool overflow) {
    EspDesktopExternalAllocatorStats::failed_allocations.fetch_add(1, std::memory_order_relaxed);
    if (overflow) {
      ESP_LOGE("ha", "Fatal subscription storage allocation failure: "
                     "requested=%u elements x %u bytes (overflow)",
               static_cast<unsigned>(count), static_cast<unsigned>(sizeof(T)));
    } else {
      ESP_LOGE("ha", "Fatal subscription storage allocation failure: requested=%u bytes",
               static_cast<unsigned>(count * sizeof(T)));
    }
    std::abort();
  }
};
