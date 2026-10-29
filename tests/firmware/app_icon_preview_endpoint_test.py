"""Run the production icon HTTP handler with constrained-memory request doubles."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HEADER = ROOT / "components/espdesktop/companion_app_icon_endpoint.h"
PRELUDE = r'''
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <map>
#include <memory>
#include <string>
#include <vector>
#include "companion_capabilities_generated.h"
constexpr int HTTP_GET = 1, HTTPD_RESP_USE_STRLEN = -1;
constexpr int COLOR_CORRECTION_RED_PERCENT = 100;
constexpr int COLOR_CORRECTION_GREEN_PERCENT = 100;
constexpr int COLOR_CORRECTION_BLUE_PERCENT = 100;
bool authorized = true, online = true, fail_allocation = false;
bool store_available = true, referenced = true, copy_ok = true;
int allocations = 0, releases = 0, outstanding = 0;
uint8_t *live_buffer = nullptr;
struct httpd_req_t {
  std::string status, type;
  std::map<std::string, std::string> headers;
  std::vector<uint8_t> body;
  bool fail_send = false, sent_from_owned_buffer = false;
};
void httpd_resp_set_status(httpd_req_t *r, const char *s) { r->status = s; }
void httpd_resp_set_type(httpd_req_t *r, const char *s) { r->type = s; }
void httpd_resp_set_hdr(httpd_req_t *r, const char *k, const char *v) { r->headers[k] = v; }
int httpd_resp_send(httpd_req_t *r, const char *bytes, int size) {
  if (size < 0) size = std::strlen(bytes);
  if (r->status == "200 OK") {
    assert(outstanding == 1);
    assert(reinterpret_cast<const uint8_t *>(bytes) == live_buffer);
    r->sent_from_owned_buffer = true;
  }
  if (r->fail_send) return -1;
  r->body.assign(bytes, bytes + size);
  return 0;
}
namespace esphome {
template<class T> struct RAMAllocator {
  enum { ALLOC_EXTERNAL = 1 };
  explicit RAMAllocator(int flags) { assert(flags == ALLOC_EXTERNAL); }
  T *allocate(size_t size) {
    ++allocations;
    if (fail_allocation) return nullptr;
    assert(outstanding == 0);
    ++outstanding;
    live_buffer = new T[size];
    return live_buffer;
  }
  void deallocate(T *p, size_t) {
    if (!p) return;
    assert(p == live_buffer);
    --outstanding;
    ++releases;
    delete[] p;
    live_buffer = nullptr;
  }
};
namespace companion {
constexpr size_t APP_ICON_PIXEL_BYTES = COMPANION_APP_ICON_PIXEL_BYTES;
struct Store {
  bool begin() { return store_available; }
  bool is_referenced(const std::string &id) { return referenced && id == "example.app"; }
  bool copy_pixels(const std::string &, uint8_t *out, size_t size) {
    assert(size == APP_ICON_PIXEL_BYTES);
    if (!copy_ok) return false;
    for (size_t i = 0; i < size; ++i) out[i] = static_cast<uint8_t>(i);
    return true;
  }
};
Store store;
Store &app_icon_store() { return store; }
}
namespace web_server_idf {
struct AsyncWebServerRequest {
  static constexpr size_t URL_BUF_SIZE = 80;
  httpd_req_t raw;
  std::string app_id = "example.app", background, path = "/companion/app-icon";
  int method() { return HTTP_GET; }
  std::string url_to(char *) { return path; }
  std::string arg(const char *name) { return std::string(name) == "appId" ? app_id : background; }
  operator httpd_req_t *() { return &raw; }
  // Intentionally no beginResponse(string): success must avoid payload copies.
};
struct AsyncWebHandler {
  virtual ~AsyncWebHandler() = default;
  virtual bool canHandle(AsyncWebServerRequest *) const = 0;
  virtual void handleRequest(AsyncWebServerRequest *) = 0;
};
}
}
bool companion_authorize_web_request(esphome::web_server_idf::AsyncWebServerRequest *) { return authorized; }
bool companion_connected() { return online; }
namespace espdesktop::cover_art {
struct AccentPalette { bool valid = false; uint32_t default_rgb = 0, active_rgb = 0; };
AccentPalette make_app_icon_custom_palette(uint32_t rgb, int, int, int) { return {true, rgb, rgb}; }
}
'''
TEST = r'''
int main() {
  using esphome::web_server_idf::AsyncWebServerRequest;
  CompanionAppIconPreviewHandler handler;
  for (int visit = 0; visit < 25; ++visit) {
    AsyncWebServerRequest request;
    request.background = "123ABC";
    assert(handler.canHandle(&request));
    handler.handleRequest(&request);
    assert(request.raw.status == "200 OK" && request.raw.sent_from_owned_buffer);
    assert(request.raw.body.size() == esphome::companion::APP_ICON_PIXEL_BYTES);
    for (size_t i = 0; i < request.raw.body.size(); ++i)
      assert(request.raw.body[i] == static_cast<uint8_t>(i));
    assert(request.raw.headers["Cache-Control"] == "no-store");
    assert(request.raw.headers["X-EspDesktop-Companion-Online"] == "true");
    assert(request.raw.headers["X-EspDesktop-App-Icon-Palette"] == "123abc,123abc");
    assert(outstanding == 0 && releases == allocations);
  }
  {
    AsyncWebServerRequest request;
    fail_allocation = true;
    handler.handleRequest(&request);
    assert(request.raw.status == "503 Service Unavailable");
    assert(outstanding == 0);
    fail_allocation = false;
  }
  {
    AsyncWebServerRequest request;
    copy_ok = false;
    handler.handleRequest(&request);
    assert(request.raw.status == "404 Not Found" && outstanding == 0);
    copy_ok = true;
  }
  {
    AsyncWebServerRequest request;
    request.raw.fail_send = true;
    handler.handleRequest(&request);
    assert(request.raw.sent_from_owned_buffer && outstanding == 0);
  }
  {
    AsyncWebServerRequest request;
    online = false;
    handler.handleRequest(&request);
    assert(request.raw.headers["X-EspDesktop-Companion-Online"] == "false");
    assert(request.raw.headers.count("X-EspDesktop-App-Icon-Palette") == 0);
    assert(outstanding == 0);
  }
  for (int reason = 0; reason < 3; ++reason) {
    AsyncWebServerRequest request;
    authorized = reason != 0;
    store_available = reason != 1;
    referenced = reason != 2;
    const int before = allocations;
    handler.handleRequest(&request);
    assert(allocations == before && outstanding == 0);
  }
}
'''

source = HEADER.read_text()
handler = source[source.index("class CompanionAppIconPreviewHandler"):source.index("inline void register_companion_app_icon_preview_endpoint")]
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp)
    (path / "test.cpp").write_text(PRELUDE + handler + TEST)
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", str(ROOT / "components/espdesktop"), str(path / "test.cpp"), "-o", str(path / "test")], check=True)
    subprocess.run([str(path / "test")], check=True)
print("App icon preview endpoint memory and response tests passed.")
