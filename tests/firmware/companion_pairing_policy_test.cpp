#include <cassert>
#include "companion_pairing_policy.h"

int main() {
  CompanionPairingSnapshot state;
  state.available = true;
  assert(!companion_pairing_can_show_on_display(state));
  int reads = 0, starts = 0;
  auto provider = [&] { ++reads; return state; };
  auto begin = [&] { ++starts; state.active = true; state.pairing_code = "ABCD-EFGH"; };
  assert(!companion_pairing_status(false, provider, begin));
  assert(reads == 0 && starts == 0);
  auto first = companion_pairing_status(true, provider, begin);
  assert(first && first->pairing_code == "ABCD-EFGH" && starts == 1);
  assert(companion_pairing_can_show_on_display(*first));
  assert(companion_pairing_can_show_on_page_load(*first));
  auto repeated = companion_pairing_status(true, provider, begin);
  assert(repeated && repeated->pairing_code == first->pairing_code && starts == 1);
  state.paired = true;
  auto paired_active = companion_pairing_status(true, provider, begin);
  assert(paired_active->pairing_code == "ABCD-EFGH");
  // Viewing a browser page must not pop the reset confirmation on a paired panel.
  assert(!companion_pairing_can_show_on_page_load(*paired_active));
  state.active = false; state.connected = false; // Reconnect does not require pairing again.
  auto paired = companion_pairing_status(true, provider, begin);
  assert(paired && paired->pairing_code.empty() && starts == 1);
  assert(companion_pairing_can_show_on_display(*paired)); // Offer confirmation even without an active code.
  assert(!companion_pairing_can_show_on_page_load(*paired));
  auto adding = companion_pairing_status(true, provider, begin, true);
  assert(adding && adding->pairing_code == "ABCD-EFGH" && starts == 2);
  // Adding another computer shows its code in the browser, not on the panel.
  assert(!companion_pairing_can_show_on_page_load(*adding));
  state.available = false; state.paired = false;
  assert(!companion_pairing_status(true, provider, begin)->available && starts == 2);
  assert(!companion_pairing_can_show_on_display(state));
  assert(!companion_pairing_can_show_on_page_load(state));
}
