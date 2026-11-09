#include <cassert>
#include <cstring>
#include <string>
struct lv_obj_t {};
inline void lv_label_set_text(lv_obj_t *, const char *) {}
#include "connector_state.h"

int main() {
  espdesktop::connectors::ConnectorStateService service;
  service.setup("editor", "test-password");
  companion_pairing_provider() = nullptr;
  auto state = service.status();
  assert(state.onboarding_complete && !state.companion_paired && !state.companion_connected);
  assert(std::strcmp(service.web_auth_username(), "editor") == 0);
  assert(std::strcmp(service.web_auth_password(), "test-password") == 0);
  CompanionPairingSnapshot pairing;
  pairing.available = true;
  pairing.paired = true;
  companion_pairing_provider() = [&] { return pairing; };
  state = service.status();
  assert(state.onboarding_complete && state.companion_available && state.companion_paired && !state.companion_connected);
  pairing.connected = true;
  assert(service.status().companion_connected);
  pairing.connected = false;
  assert(service.status().companion_paired && service.status().onboarding_complete);
  // Recreating connector setup does not replace or reset the Companion pairing.
  espdesktop::connectors::ConnectorStateService restored;
  restored.setup(nullptr, nullptr);
  assert(restored.status().companion_paired && restored.status().onboarding_complete);
  companion_pairing_provider() = nullptr;
}
