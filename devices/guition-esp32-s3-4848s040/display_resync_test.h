#pragma once

#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <memory>
#include <mutex>

#include "esphome/components/lvgl/lvgl_esphome.h"
#include "esphome/components/mipi_rgb/mipi_rgb.h"
#include "esphome/components/web_server_base/web_server_base.h"
#include "esphome/core/application.h"
#include "esphome/core/helpers.h"

namespace espdesktop {

class DisplayResyncTestHandler final : public esphome::web_server_idf::AsyncWebHandler {
 public:
  DisplayResyncTestHandler(esphome::mipi_rgb::MipiRgb &display, esphome::lvgl::LvglComponent &lvgl)
      : display_(display), lvgl_(lvgl) {}

  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    if (request->method() != HTTP_GET) return false;
    const auto url = request->url_to(path);
    return url == "/display-test" || url == "/display-test/frame";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    if (request->url_to(path) == "/display-test/frame") {
      this->send_frame_(request);
      return;
    }
    httpd_resp_set_hdr(*request, "Cache-Control", "no-store");
    request->send(200, "text/html", R"html(<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>S3 display test</title>
<h1>S3 display test</h1>
<p>While the picture is shifted, take a photo and capture the current frame before trying a reset.</p>
<button type="button" id="capture">Capture current frame</button>
<button type="button" data-command="Resync S3 Display">Resync S3 display</button>
<button type="button" data-command="Reset S3 LCD Controller">Reset LCD controller</button>
<p id="result" role="status"></p>
<p><a id="download" download="s3-current-frame.png" hidden>Download capture</a></p>
<canvas id="frame" aria-label="Captured S3 frame" style="max-width:100%;height:auto;border:1px solid" hidden></canvas>
<script>
const buttons = document.querySelectorAll("button");
const result = document.getElementById("result");
for (const button of document.querySelectorAll("button[data-command]")) {
  button.addEventListener("click", async () => {
    for (const control of buttons) control.disabled = true;
    result.textContent = "Sending request…";
    try {
      const command = encodeURIComponent(button.dataset.command);
      const response = await fetch("/button/" + command + "/press", {method: "POST"});
      if (!response.ok) throw new Error();
      result.textContent = "Request accepted. Check whether the picture moved back into place.";
    } catch {
      result.textContent = "Could not send the request. Check that the device is online and try again.";
    } finally {
      for (const control of buttons) control.disabled = false;
    }
  });
}
document.getElementById("capture").addEventListener("click", async () => {
  const canvas = document.getElementById("frame");
  const download = document.getElementById("download");
  for (const control of buttons) control.disabled = true;
  canvas.hidden = download.hidden = true;
  result.textContent = "Capturing the frame…";
  try {
    const response = await fetch("/display-test/frame", {cache: "no-store"});
    if (!response.ok) throw new Error(await response.text());
    const [width, height, rotation] = response.headers.get("X-Frame-Geometry").split(",").map(Number);
    const pixels = new DataView(await response.arrayBuffer());
    if (pixels.byteLength !== width * height * 2) throw new Error("The frame was incomplete.");
    const raw = document.createElement("canvas");
    raw.width = width;
    raw.height = height;
    const rawContext = raw.getContext("2d");
    const image = rawContext.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const color = pixels.getUint16(i * 2, true);
      image.data[i * 4] = ((color >> 11) & 31) * 255 / 31;
      image.data[i * 4 + 1] = ((color >> 5) & 63) * 255 / 63;
      image.data[i * 4 + 2] = (color & 31) * 255 / 31;
      image.data[i * 4 + 3] = 255;
    }
    rawContext.putImageData(image, 0, 0);
    // Undo LVGL's software rotation so the capture matches the viewing orientation.
    canvas.width = rotation % 180 === 0 ? width : height;
    canvas.height = rotation % 180 === 0 ? height : width;
    const context = canvas.getContext("2d");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-rotation * Math.PI / 180);
    context.drawImage(raw, -width / 2, -height / 2);
    download.href = canvas.toDataURL("image/png");
    canvas.hidden = download.hidden = false;
    result.textContent = "Frame captured. Compare the top and bottom edges with your photo.";
  } catch (error) {
    result.textContent = error.message || "Could not capture the frame.";
  } finally {
    for (const control of buttons) control.disabled = false;
  }
});
</script>
</html>)html");
  }

 private:
  struct FrameCapture {
    esphome::RAMUniquePtr<uint16_t[]> pixels;
    std::mutex mutex;
    std::condition_variable ready;
    bool complete{false};
    bool success{false};
    int rotation{0};
  };

  void send_frame_(esphome::web_server_idf::AsyncWebServerRequest *request) {
    const int width = this->display_.get_width_internal();
    const int height = this->display_.get_height_internal();
    const size_t pixel_count = static_cast<size_t>(width) * height;
    auto capture = std::make_shared<FrameCapture>();
    esphome::RAMAllocator<uint16_t> allocator(esphome::RAMAllocator<uint16_t>::ALLOC_EXTERNAL);
    capture->pixels = allocator.make_unique_array_for_overwrite(pixel_count);
    httpd_resp_set_hdr(*request, "Cache-Control", "no-store");
    if (!capture->pixels) {
      request->send(503, "text/plain", "The S3 has insufficient memory to capture a frame.");
      return;
    }

    // Copy between renders on the application loop. The HTTP task owns only
    // the snapshot and can send it while the display continues drawing.
    esphome::App.scheduler.set_timeout(nullptr, "s3-frame-capture", 0,
        [this, pending = std::weak_ptr<FrameCapture>(capture), pixel_count]() {
          if (const auto snapshot = pending.lock()) {
            std::lock_guard<std::mutex> lock(snapshot->mutex);
            snapshot->success = this->display_.copy_presented_frame(snapshot->pixels.get(), pixel_count);
            snapshot->rotation = static_cast<int>(this->lvgl_.get_rotation());
            snapshot->complete = true;
            snapshot->ready.notify_one();
          }
        });
    esphome::App.wake_loop_threadsafe();
    bool captured;
    {
      std::unique_lock<std::mutex> lock(capture->mutex);
      captured = capture->ready.wait_for(lock, std::chrono::seconds(2), [&] { return capture->complete; }) &&
                 capture->success;
    }
    if (!captured) {
      request->send(503, "text/plain", "The display frame is unavailable. Try again while the display is active.");
      return;
    }

    char geometry[40];
    std::snprintf(geometry, sizeof(geometry), "%d,%d,%d", width, height, capture->rotation);
    httpd_resp_set_type(*request, "application/octet-stream");
    httpd_resp_set_hdr(*request, "X-Frame-Geometry", geometry);
    httpd_resp_send(*request, reinterpret_cast<const char *>(capture->pixels.get()), pixel_count * sizeof(uint16_t));
  }

  esphome::mipi_rgb::MipiRgb &display_;
  esphome::lvgl::LvglComponent &lvgl_;
};

inline void register_display_resync_test(esphome::mipi_rgb::MipiRgb &display, esphome::lvgl::LvglComponent &lvgl) {
  static DisplayResyncTestHandler handler(display, lvgl);
  esphome::web_server_base::global_web_server_base->add_handler(&handler);
}

}  // namespace espdesktop
