"""Check Webhook click and worker diagnostics for credential leaks."""
from pathlib import Path
import os
import shlex
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
from production_source import definition

worker = (ROOT / "components/espdesktop/webhook_request.h").read_text()
actions = (ROOT / "components/espdesktop/button_grid_actions.h").read_text()
click = definition(actions, "handle_button_click")[1]
assert 'if (p.type == "webhook")' in click
webhook_log = click.split('if (p.type == "webhook")', 1)[1].split("else", 1)[0]
assert "ESP_LOGI" in webhook_log and "p.entity" not in webhook_log

code = r'''
#include <cassert>
#include <cstdarg>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>
std::string logs;
void record_log(const char *, const char *format, ...) {
  char buffer[512]; va_list args; va_start(args, format);
  vsnprintf(buffer, sizeof(buffer), format, args); va_end(args);
  logs += buffer; logs += '\n';
}
#define ESP_LOGW(...) record_log(__VA_ARGS__)
#define ESP_LOGI(...) record_log(__VA_ARGS__)
namespace esphome::http_request {
struct Header { std::string name, value; };
bool is_success(int status) { return status >= 200 && status < 300; }
}
enum esp_http_client_method_t { HTTP_METHOD_GET, HTTP_METHOD_POST, HTTP_METHOD_PUT, HTTP_METHOD_PATCH, HTTP_METHOD_DELETE };
enum { ESP_OK, ESP_FAIL, HTTP_AUTH_TYPE_BASIC };
void esp_crt_bundle_attach() {}
const char *esp_err_to_name(int) { return "ESP_FAIL"; }
struct esp_http_client_config_t {
  const char *url;
  esp_http_client_method_t method;
  int timeout_ms, max_redirection_count, auth_type;
  void (*crt_bundle_attach)();
};
struct WebhookRequest {
  std::string url, method, body;
  std::vector<esphome::http_request::Header> headers;
};
struct Http {
  int status = 200;
  bool init_failed = false, request_failed = false, cleaned = false;
  std::string url, body;
  std::vector<esphome::http_request::Header> headers;
} http;
Http *esp_http_client_init(const esp_http_client_config_t *config) {
  http.url = config->url;
  assert(config->timeout_ms == 10000 && config->method == HTTP_METHOD_POST);
  return http.init_failed ? nullptr : &http;
}
void esp_http_client_set_header(Http *client, const char *name, const char *value) {
  client->headers.push_back({name, value});
}
void esp_http_client_set_post_field(Http *client, const char *data, size_t size) {
  client->body.assign(data, size);
}
int esp_http_client_perform(Http *client) { return client->request_failed ? ESP_FAIL : ESP_OK; }
int esp_http_client_get_status_code(Http *client) { return client->status; }
void esp_http_client_cleanup(Http *client) { client->cleaned = true; }
''' + definition(worker, "webhook_http_method")[1] + "\n" + definition(worker, "perform_webhook_request")[1] + r'''
int main() {
  const std::string url = "https://user:password@host.invalid/private-hook?token=query-secret";
  const std::string body = "body-secret";
  const std::vector<esphome::http_request::Header> headers = {{"Authorization", "Bearer header-secret"}};
  for (int status : {-1, 0, 200, 401, 500}) {
    logs.clear();
    http = Http{};
    http.init_failed = status == -1;
    http.request_failed = status == 0;
    http.status = status;
    perform_webhook_request({url, "POST", body, headers});
    assert(http.url == url);
    if (!http.init_failed) {
      assert(http.body == body && http.headers[0].value == "Bearer header-secret");
      assert(http.cleaned);
    }
    assert(logs.find("POST") != std::string::npos);
    for (const char *secret : {"user", "password", "host.invalid", "private-hook", "query-secret", "body-secret", "header-secret"})
      assert(logs.find(secret) == std::string::npos);
  }
  puts("Webhook click and HTTP diagnostics omit credentials.");
}
'''
with tempfile.TemporaryDirectory(prefix="webhook-log-secrets-") as temporary:
    source = Path(temporary) / "test.cpp"
    binary = Path(temporary) / "test"
    source.write_text(code)
    compiler = shlex.split(os.environ.get("CXX", sys.argv[1] if len(sys.argv) > 1 else "c++"))
    subprocess.run(compiler + ["-std=c++17", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
