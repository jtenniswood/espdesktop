"""Check the RGB driver presents once and waits before recycling its front buffer."""
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
#define pdMS_TO_TICKS(n) (n)
int submits = 0, waits = 0, result = ESP_OK;
bool complete = true;
const uint16_t *submitted = nullptr;
int esp_lcd_panel_draw_bitmap(void *, int, int, int, int, const void *pixels) {
  ++submits; submitted = static_cast<const uint16_t *>(pixels); return result;
}
int xSemaphoreTake(void *, int timeout) {
  if (!timeout) return 0;
  assert(submitted && submits > 0); ++waits; return complete;
}
namespace esphome::mipi_rgb {
struct MipiRgb {
  bool double_buffered_ = true, frame_active_ = false, failed = false;
  FrameBufferPair frames_;
  int width_ = 4, height_ = 2;
  void *handle_ = nullptr, *frame_done_ = nullptr;
  bool is_failed() { return failed; }
  void mark_failed(const char *) { failed = true; }
  void begin_frame();
  void end_frame();
};
'''
code += function("void MipiRgb::begin_frame() {")
code += function("void MipiRgb::end_frame() {")
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
}
'''
with tempfile.TemporaryDirectory(prefix="rgb-frame-present-") as directory:
    temp = Path(directory)
    (temp / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-I", str(ROOT / "components/mipi_rgb"), str(temp / "test.cpp"),
                    "-o", str(temp / "test")], check=True)
    subprocess.run([str(temp / "test")], check=True)
print("RGB presents once per refresh and never recycles a frame before completion.")
