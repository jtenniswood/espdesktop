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
  assert(session.connected_count() == 0);
  assert(session.authenticated_socket() == -1);

  const auto first_generation = session.generation(0);
  auto attached = session.authenticate(7, 0);
  assert(attached.attached);
  assert(attached.replaced_socket == -1);
  assert(session.connected());
  assert(session.connected(0));
  assert(!session.connected(1));
  assert(session.authenticated_socket() == 7);
  assert(session.authenticated_socket(0) == 7);
  assert(session.credential_index(7) == 0);
  assert(session.credential_index(9) == -1);
  assert(!session.current(0, first_generation));

  // A second computer connects without displacing the first.
  const auto second_generation = session.generation(1);
  attached = session.authenticate(9, 1);
  assert(attached.attached);
  assert(session.connected_count() == 2);
  assert(session.authenticated_socket() == 7);
  assert(session.authenticated_socket(1) == 9);
  assert(!session.current(1, second_generation));

  // Reconnecting the same computer replaces only its own socket.
  const auto reconnect_generation = session.generation(1);
  attached = session.authenticate(11, 1);
  assert(attached.attached);
  assert(attached.replaced_socket == 9);
  assert(session.connected_count() == 2);
  assert(session.authenticated_socket(0) == 7);
  assert(session.authenticated_socket(1) == 11);
  assert(!session.current(1, reconnect_generation));

  // Disconnecting one computer leaves the other one connected.
  assert(!session.disconnect_socket(9));
  assert(session.disconnect_socket(7));
  assert(session.connected_count() == 1);
  assert(!session.connected(0));
  assert(session.connected(1));
  assert(!session.disconnect_socket(7));

  // A third distinct computer cannot take a third live slot.
  attached = session.authenticate(13, 2);
  assert(attached.attached);
  assert(session.connected_count() == 2);
  attached = session.authenticate(15, 3);
  assert(!attached.attached);
  assert(session.authenticated_socket(3) == -1);
  assert(session.connected_count() == 2);

  const auto last_generation = session.generation(1);
  assert(session.disconnect_credential(1));
  assert(!session.disconnect_credential(1));
  assert(!session.current(1, last_generation));
  assert(session.connected_count() == 1);
  assert(session.authenticated_socket() == 13);

  session.invalidate_all();
  const auto current_generation = session.generation(2);
  session.clear();
  assert(!session.connected());
  assert(!session.current(2, current_generation));
  return 0;
}
