"""Check both RGB presentation modes retain frames until scan-out completes."""
import os
from pathlib import Path
import subprocess
import tempfile
ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / "components/mipi_rgb/mipi_rgb.cpp").read_text()
def function(signature):
    start = source.index(signature)
    return source[start:source.index("\n}", start) + 2]
code = r'''
#include <array>
#include <cassert>
#include "frame_buffer_pair.h"
#define LOG_STR(s) s
using esp_err_t = int;
constexpr int ESP_OK = 0, pdTRUE = 1;
using TickType_t = unsigned;
#define pdMS_TO_TICKS(n) (n)
int submits = 0, waits = 0, result = ESP_OK;
bool complete = true;
bool frame_ready = false;
int presented = 0;
uint32_t now = 0;
uint32_t millis() { return now; }
const uint16_t *submitted = nullptr;
int esp_lcd_panel_draw_bitmap(void *, int, int, int, int, const void *pixels) {
  ++submits; submitted = static_cast<const uint16_t *>(pixels); return result;
}
int xSemaphoreTake(void *, int timeout) {
#ifdef ESPDESKTOP_S3_ASYNC_SCANOUT
  if (timeout) ++waits;
  const bool ready = frame_ready;
  frame_ready = false;
  return ready;
#else
  if (!timeout) return 0;
  assert(submitted && submits > 0); ++waits; return complete;
#endif
}
namespace esphome::mipi_rgb {
struct MipiRgb {
  bool double_buffered_ = true, frame_active_ = false, failed = false;
  FrameBufferPair frames_;
  int width_ = 4, height_ = 2;
  void *handle_ = nullptr, *frame_done_ = nullptr;
  bool is_failed() { return failed; }
  bool take_frame_done_(TickType_t wait);
  void mark_failed(const char *) { failed = true; }
  void begin_frame();
  void end_frame();
  bool frame_pending_ = false;
  uint32_t frame_submitted_at_ = 0;
  void (*frame_presented_)() = nullptr;
  void finish_frame_(bool wait);
  void notify_frame_presented(void (*callback)());
};
'''
code += function("void MipiRgb::begin_frame() {")
code += function("bool MipiRgb::take_frame_done_(TickType_t wait) {")
code += function("void MipiRgb::end_frame() {")
code += "\n#ifdef ESPDESKTOP_S3_ASYNC_SCANOUT\n"
code += function("void MipiRgb::finish_frame_(bool wait) {")
code += function("void MipiRgb::notify_frame_presented(void (*callback)()) {")
code += "\n#endif\n"
code += r'''
}
int main() {
  using namespace esphome::mipi_rgb;
  std::array<uint16_t, 8> front{}, back{};
  std::array<uint16_t, 4> strip{1, 2, 3, 4};
  MipiRgb driver;
  driver.frames_.reset(front.data(), back.data(), 4, 2);
  driver.begin_frame();
  driver.frames_.write(0, 0, 4, 1, reinterpret_cast<const uint8_t *>(strip.data()), 0, 0, 0);
  driver.begin_frame(); // Multiple render-start events must not discard earlier strips.
  driver.frames_.write(0, 1, 4, 1, reinterpret_cast<const uint8_t *>(strip.data()), 0, 0, 0);
  assert(submits == 0 && front[0] == 0);
#ifdef ESPDESKTOP_S3_ASYNC_SCANOUT
  driver.end_frame();
  driver.notify_frame_presented([] { ++presented; });
  driver.finish_frame_(false);
  assert(submits == 1 && waits == 0 && presented == 0 && front[0] == 0);
  frame_ready = true;
  driver.finish_frame_(false);
  assert(waits == 0 && presented == 1 && front == back && !driver.failed);
  driver.begin_frame();
  strip[0] = 99;
  driver.frames_.write(0, 0, 4, 1, reinterpret_cast<const uint8_t *>(strip.data()), 0, 0, 0);
  driver.end_frame();
  driver.notify_frame_presented([] { ++presented; });
  now = 100;
  driver.finish_frame_(false);
  assert(driver.failed && presented == 1 && back[0] == 1 && !driver.frame_active_);
#else
  driver.end_frame();
  assert(submits == 1 && waits == 1 && front == back && !driver.failed);
  driver.end_frame();
  driver.begin_frame(); driver.end_frame();
  assert(submits == 1); // Empty refreshes do not present or wait.
  const uint16_t *scanned = submitted;
  // Failed submission must not recycle/mirror the buffer.
  driver.begin_frame();
  strip[0] = 99;
  driver.frames_.write(0, 0, 4, 1, reinterpret_cast<const uint8_t *>(strip.data()), 0, 0, 0);
  result = -1;
  driver.end_frame();
  assert(driver.failed && scanned[0] == 1 && waits == 1);
  driver.failed = false; result = ESP_OK; complete = false;
  driver.begin_frame(); driver.end_frame();
  assert(driver.failed && scanned[0] == 1 && waits == 2);
  // The opt-out/single-buffer path does not begin a buffered refresh.
  driver.failed = false; driver.double_buffered_ = false;
  driver.begin_frame(); driver.end_frame();
  assert(!driver.frame_active_ && submits == 3);
#endif
}
'''
with tempfile.TemporaryDirectory(prefix="rgb-frame-present-") as directory:
    temp = Path(directory)
    (temp / "test.cpp").write_text(code)
    for flags in ([], ["-DESPDESKTOP_S3_ASYNC_SCANOUT"]):
        subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                        *flags, "-I", str(ROOT / "components/mipi_rgb"), str(temp / "test.cpp"),
                        "-o", str(temp / "test")], check=True)
        subprocess.run([str(temp / "test")], check=True)
print("RGB presents once per refresh and never recycles a frame before completion.")
