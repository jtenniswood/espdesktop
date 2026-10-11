"""Exercise the production setup-address reader with default and custom APs."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as tmp:
 d=Path(tmp);(d/'esphome/core').mkdir(parents=True);(d/'esphome/core/defines.h').write_text('')
 (d/'esphome/components/wifi').mkdir(parents=True)
 (d/'esphome/components/wifi/wifi_component.h').write_text('''#pragma once
#include <string>
#include <optional>
#include <cstdio>
namespace esphome::network { constexpr size_t IP_ADDRESS_BUFFER_SIZE = 40; }
namespace esphome::wifi {
struct IP { std::string value; bool is_set() const { return !value.empty(); } char *str_to(char *buffer) const { std::snprintf(buffer, esphome::network::IP_ADDRESS_BUFFER_SIZE, "%s", value.c_str()); return buffer; } };
struct Manual { IP static_ip; };
struct AP { std::optional<Manual> manual; const auto &get_manual_ip() const { return manual; } };
struct WiFi { IP live; AP ap; IP wifi_soft_ap_ip() const { return live; } AP get_ap() const { return ap; } };
inline WiFi *global_wifi_component = nullptr;
}
''')
 (d/'test.cpp').write_text('''#include <cassert>
#include "wifi_setup_message.h"
int main() {
 assert(wifi_setup_address()=="192.168.4.1");
 assert(wifi_setup_browser_instruction("Visit {address} in a browser", "10.42.0.1")=="Visit 10.42.0.1 in a browser");
 assert(wifi_setup_browser_instruction("פתחו את {address} בדפדפן", "10.42.0.1")=="פתחו את 10.42.0.1 בדפדפן");
#ifdef USE_WIFI
 esphome::wifi::WiFi wifi; esphome::wifi::global_wifi_component=&wifi;
 assert(wifi_setup_address()=="192.168.4.1");
#ifdef USE_WIFI_MANUAL_IP
 wifi.ap.manual=esphome::wifi::Manual{{"10.42.0.1"}};
 assert(wifi_setup_address()=="10.42.0.1");
#endif
 wifi.live.value="10.43.0.1";
 assert(wifi_setup_address()=="10.43.0.1");
#endif
}
''')
 for flags in [[],['-DUSE_WIFI','-DUSE_WIFI_AP'],['-DUSE_WIFI','-DUSE_WIFI_AP','-DUSE_WIFI_MANUAL_IP']]:
  subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror','-fsanitize=address','-fsanitize-address-use-after-scope',*flags,'-I'+str(d),'-I'+str(root/'components/espdesktop'),str(d/'test.cpp'),'-o',str(d/'test')],check=True)
  subprocess.run([str(d/'test')],check=True)
print('Default, live/custom AP addresses, translations and Ethernet-only header passed.')
