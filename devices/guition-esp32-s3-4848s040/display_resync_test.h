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
<p>Use this while the picture is shifted. It resyncs the pixel stream without rebooting the device.</p>
<button type="button" id="resync">Resync S3 display</button>
<p id="result" role="status"></p>
<script>
const button = document.getElementById("resync");
const result = document.getElementById("result");
button.addEventListener("click", async () => {
  button.disabled = true;
  result.textContent = "Sending request…";
  try {
    const response = await fetch("/button/Resync%20S3%20Display/press", {method: "POST"});
    if (!response.ok) throw new Error();
    result.textContent = "Resync requested. Check whether the picture moved back into place.";
  } catch {
    result.textContent = "Could not send the resync request. Check that the device is online and try again.";
  } finally {
    button.disabled = false;
  }
});
</script>
</html>)html");
  }
};

inline void register_display_resync_test() {
  static DisplayResyncTestHandler handler;
  esphome::web_server_base::global_web_server_base->add_handler(&handler);
}

}  // namespace espdesktop
