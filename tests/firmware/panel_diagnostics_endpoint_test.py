"""Execute the production read-only diagnostics handler, including web authentication."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'components/espdesktop/panel_diagnostics_endpoint.h').read_text()
source = re.sub(r'^#(?:include[^\n]*|pragma once)\n', '', source, flags=re.M)
prelude = r'''
#include <ArduinoJson.h>
#include "grid_navigation_diagnostics.h"
#include <cassert>
#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#define USE_WEBSERVER
#define USE_WEBSERVER_AUTH
#define ESPHOME_VERSION "2026.10.2"
#define ESPHOME_PROJECT_VERSION "dev"
#define ESPDESKTOP_DEVICE_SLUG "test-panel"
constexpr int HTTP_GET = 1, HTTP_POST = 2, HTTPD_RESP_USE_STRLEN = -1;
constexpr uint32_t MALLOC_CAP_INTERNAL = 1, MALLOC_CAP_8BIT = 2, MALLOC_CAP_SPIRAM = 4;
uint64_t uptime = 0x100000001ULL;
int random_calls = 0;
size_t heap_total = 1000;
size_t heap_caps_get_total_size(uint32_t flags) { return flags & MALLOC_CAP_INTERNAL ? heap_total : 2000; }
size_t heap_caps_get_free_size(uint32_t flags) { return flags & MALLOC_CAP_INTERNAL ? 250 : 1500; }
size_t heap_caps_get_largest_free_block(uint32_t flags) { return flags & MALLOC_CAP_INTERNAL ? 125 : 750; }
int esp_reset_reason() { return 12; }
struct httpd_req_t { std::string status, type, body; std::map<std::string, std::string> headers; };
void httpd_resp_set_status(httpd_req_t *r, const char *s) { r->status = s; }
void httpd_resp_set_type(httpd_req_t *r, const char *s) { r->type = s; }
void httpd_resp_set_hdr(httpd_req_t *r, const char *k, const char *v) { r->headers[k] = v; }
void httpd_resp_send(httpd_req_t *r, const char *s, int n) { r->body.assign(s, n < 0 ? std::strlen(s) : n); }
namespace esphome {
uint32_t random_uint32() { ++random_calls; return 12345; }
uint64_t millis_64() { return uptime; }
struct Application {
 static constexpr size_t BUILD_TIME_STR_SIZE = 26;
 const std::string &get_name() { static std::string name = "test-panel"; return name; }
 void get_build_time_string(char *s) { std::strcpy(s, "2026-11-08 12:00:00 +0000"); }
} App;
namespace json {
template<class F> std::string build_json(F f) { JsonDocument d; f(d.to<JsonObject>()); std::string s; serializeJson(d, s); return s; }
}
namespace web_server_idf {
struct AsyncWebServerRequest {
 static constexpr size_t URL_BUF_SIZE = 128;
 httpd_req_t raw;
 int verb = HTTP_GET;
 bool authorized = true;
 std::string path = "/api/v1/diagnostics";
 int method() { return verb; }
 std::string url_to(char *) { return path; }
 operator httpd_req_t *() { return &raw; }
 bool authenticate(const char *u, const char *p) { assert(std::string(u) == "admin" && std::string(p) == "private"); return authorized; }
 void requestAuthentication() { raw.status = "401 Unauthorized"; }
};
struct AsyncWebHandler {
 virtual bool canHandle(AsyncWebServerRequest *) const = 0;
 virtual void handleRequest(AsyncWebServerRequest *) = 0;
 virtual ~AsyncWebHandler() = default;
};
struct AsyncWebServer { int registrations = 0; void addHandler(AsyncWebHandler *h) { ++registrations; delete h; } };
}
}
namespace espdesktop {
struct Identity { bool available = true; bool ready() { return available; }
 const char *username() { return "admin"; } const char *password() { return "private"; }
 std::string suffix() { return "ddeeff"; }
} identity;
auto *panel_identity = &identity;
}
'''
checks = r'''
int main() {
 using namespace espdesktop;
 using namespace esphome::web_server_idf;
 PanelDiagnosticsHandler h; AsyncWebServerRequest r;
 assert(h.canHandle(&r));
 r.verb = HTTP_POST; assert(!h.canHandle(&r)); r.verb = HTTP_GET;
 r.path = "/api/v1/diagnostics/other"; assert(!h.canHandle(&r)); r.path = "/api/v1/diagnostics";
 r.authorized = false; h.handleRequest(&r); assert(r.raw.status == "401 Unauthorized" && r.raw.body.empty() && random_calls == 0);
 r.authorized = true; identity.available = false; h.handleRequest(&r); assert(r.raw.status == "503 Service Unavailable" && random_calls == 0);
 identity.available = true; r.raw = {};
 grid_navigation_diagnostics().pages_built = 5;
 grid_navigation_diagnostics().pages_evicted = 2;
 grid_navigation_diagnostics().page_build_ms = 18;
 grid_navigation_diagnostics().page_open_frame_ms = 27;
 grid_navigation_diagnostics().back_frame_ms = 9;
 h.handleRequest(&r);
 assert(r.raw.type == "application/json" && r.raw.headers["Cache-Control"] == "no-store");
 JsonDocument d; assert(!deserializeJson(d, r.raw.body)); assert(d.size() == 9);
 assert(d["hostname"] == "test-panel" && d["mac_suffix"] == "ddeeff" && d["version"] == 1);
 assert(d["boot_id"] == 12345 && d["uptime_ms"].as<uint64_t>() == uptime && d["reset_reason"] == 12);
 assert(d["firmware"]["esphome_version"] == "2026.10.2" && d["firmware"]["compilation_time"] == "2026-11-08 12:00:00 +0000");
 assert(d["firmware"]["project_version"] == "dev" && d["firmware"]["model"] == "test-panel");
 assert(d["memory"]["heap_free_percent"] == 25 && d["memory"]["psram_free_percent"] == 75);
 assert(d["memory"]["heap_largest_bytes"] == 125 && d["memory"]["psram_largest_bytes"] == 750);
 assert(d["navigation"]["pages_built"] == 5 && d["navigation"]["pages_evicted"] == 2);
 assert(d["navigation"]["page_build_ms"] == 18 && d["navigation"]["page_open_frame_ms"] == 27);
 assert(d["navigation"]["back_frame_ms"] == 9);
 ++uptime; heap_total = 0; h.handleRequest(&r); assert(random_calls == 1);
 assert(!deserializeJson(d, r.raw.body)); assert(d["boot_id"] == 12345 && d["uptime_ms"].as<uint64_t>() == uptime);
 assert(!d["memory"]["heap_free_percent"].is<double>());
 AsyncWebServer server; register_panel_diagnostics_endpoint(server); register_panel_diagnostics_endpoint(server); assert(server.registrations == 1);
}
'''
with tempfile.TemporaryDirectory() as tmp:
    cpp, exe = Path(tmp)/'diagnostics.cpp', Path(tmp)/'diagnostics'
    cpp.write_text(prelude + source + checks)
    subprocess.run([sys.argv[1], '-std=c++20', '-Wall', '-Wextra', '-Werror', '-I', sys.argv[2],
                    '-I', str(ROOT / 'components/espdesktop'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
