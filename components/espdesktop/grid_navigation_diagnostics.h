#pragma once

#include <atomic>
#include <cstdint>

// The main loop publishes timings. The HTTP diagnostics handler reads them
// without walking LVGL objects from the web server task.
struct GridNavigationDiagnostics {
  std::atomic<uint32_t> pages_built{0};
  std::atomic<uint32_t> pages_evicted{0};
  std::atomic<uint32_t> page_build_ms{0};
  std::atomic<uint32_t> page_open_frame_ms{0};
  std::atomic<uint32_t> back_frame_ms{0};
};

inline GridNavigationDiagnostics &grid_navigation_diagnostics() {
  static GridNavigationDiagnostics diagnostics;
  return diagnostics;
}
