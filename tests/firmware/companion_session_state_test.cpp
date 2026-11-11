#include <cassert>

#include "session_state.h"

using esphome::companion::CompanionSessionState;
using esphome::companion::legacy_protocol_for_path;

int main() {
  assert(legacy_protocol_for_path("/companion/v3", 4) == 3);
  assert(legacy_protocol_for_path("/companion/v4", 4) == 0);
  assert(legacy_protocol_for_path("/companion/v5", 4) == 0);
  assert(legacy_protocol_for_path("/companion/v4", 5) == 4);
  assert(legacy_protocol_for_path("/companion/v11", 12) == 11);
  assert(legacy_protocol_for_path("/companion/v2", 4) == 0);
  assert(legacy_protocol_for_path("/companion/v03", 4) == 0);
  assert(legacy_protocol_for_path("/companion/v3/extra", 4) == 0);
  assert(legacy_protocol_for_path("/companion/v999999999999", 4) == 0);
  assert(legacy_protocol_for_path("/companion/v", 4) == 0);
  assert(legacy_protocol_for_path("/elsewhere/v3", 4) == 0);

  CompanionSessionState session;
  assert(!session.connected());
  assert(session.authenticated_socket() == -1);

  assert(session.authenticate(7) == -1);
  assert(session.connected());
  assert(session.authenticated_socket() == 7);

  const auto old_generation = session.generation();
  assert(session.authenticate(9) == 7);
  assert(!session.current(old_generation));
  const auto current_generation = session.generation();
  assert(!session.disconnect_socket(7));
  assert(session.current(current_generation));
  assert(session.authenticated_socket() == 9);
  assert(session.disconnect_socket(9));
  assert(!session.current(current_generation));
  assert(!session.connected());

  assert(session.authenticate(11) == -1);
  assert(session.disconnect() == 11);
  assert(session.disconnect() == -1);
  return 0;
}
