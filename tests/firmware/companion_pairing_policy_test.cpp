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
  auto repeated = companion_pairing_status(true, provider, begin);
  assert(repeated && repeated->pairing_code == first->pairing_code && starts == 1);
  state.active = false; // Expired code: a fresh authorized visit starts a new window.
  assert(companion_pairing_status(true, provider, begin)->active && starts == 2);
  state.paired = true;
  assert(companion_pairing_status(true, provider, begin)->pairing_code.empty());
  state.active = false; state.connected = false; // Reconnect does not require pairing again.
  auto paired = companion_pairing_status(true, provider, begin);
  assert(paired && paired->pairing_code.empty() && starts == 2);
  assert(companion_pairing_can_show_on_display(*paired)); // Offer confirmation even without an active code.
  state.available = false; state.paired = false;
  assert(!companion_pairing_status(true, provider, begin)->available && starts == 2);
  assert(!companion_pairing_can_show_on_display(state));
}
