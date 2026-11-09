#pragma once

#include "esphome/components/web_server_base/web_server_base.h"

namespace espdesktop {

class DisplayResyncTestHandler final : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->method() == HTTP_GET && request->url_to(path) == "/display-test";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    request->send(200, "text/html", R"html(<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>S3 display test</title>
<h1>S3 display test</h1>
<p>Use these while the picture is shifted. Try the LCD reset if resyncing the pixel stream does not help.</p>
<button type="button" data-command="Resync S3 Display">Resync S3 display</button>
<button type="button" data-command="Reset S3 LCD Controller">Reset LCD controller</button>
<p id="result" role="status"></p>
<script>
const buttons = document.querySelectorAll("button[data-command]");
const result = document.getElementById("result");
for (const button of buttons) {
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
</script>
</html>)html");
  }
};

inline void register_display_resync_test() {
  static DisplayResyncTestHandler handler;
  esphome::web_server_base::global_web_server_base->add_handler(&handler);
}

}  // namespace espdesktop
