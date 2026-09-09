#include "../../components/companion/companion_discovery.h"
#include <cassert>
#include <map>
#include <string>

static std::map<std::string, uint16_t> services{{"_http._tcp", 80}, {"_esphomelib._tcp", 6053}};
static std::map<std::string, std::string> advertised;
static int result = 0;
esp_err_t mdns_service_add(const char *instance, const char *type, const char *protocol, uint16_t port,
                         mdns_txt_item_t *records, size_t count) {
  assert(instance == nullptr); // Inherit the existing ESPHome instance name.
  if (result != 0) return result;
  services[std::string(type) + "." + protocol] = port;
  advertised.clear();
  for (size_t i = 0; i < count; ++i) advertised[records[i].key] = records[i].value;
  return 0;
}
int main() {
  const std::string fingerprint(64, 'a');
  result = -1;
  assert(esphome::companion::register_discovery(9443, "Desk", fingerprint) == -1);
  assert(services.size() == 2);
  result = 0;
  assert(esphome::companion::register_discovery(9443, "Desk", fingerprint) == 0);
  assert(services.at("_espdesktop._tcp") == 9443);
  assert(services.at("_http._tcp") == 80);
  assert(services.at("_esphomelib._tcp") == 6053);
  const std::map<std::string, std::string> expected{{"v", "1"}, {"name", "Desk"}, {"id", fingerprint}};
  assert(advertised == expected); // No pairing code, credential or private key.
}
