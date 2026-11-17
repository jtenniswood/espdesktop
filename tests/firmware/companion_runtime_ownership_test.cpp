#include <cassert>
#include <cstdlib>
#include <iostream>
#include <new>
#include "companion_controls.h"

static size_t allocations = 0;
void *operator new(std::size_t size) {
  ++allocations;
  if (void *p = std::malloc(size ? size : 1)) return p;
  throw std::bad_alloc();
}
void operator delete(void *p) noexcept { std::free(p); }
void operator delete(void *p, std::size_t) noexcept { std::free(p); }

int main() {
  espdesktop::EspDesktopAppCore first, second;
  first.companion_runtime().set_actions({{"com.example.First", "First"}});
  first.companion_runtime().set_connected(true);
  assert(first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_actions({{"com.example.First", "First"}});
  assert(!first.companion_runtime().consume_refresh_request());
  const CompanionAction ready{"obs.take.token", "Take Live", OBSCardState::take_ready, "Studio", true};
  first.companion_runtime().set_obs_actions({ready});
  assert(first.companion_runtime().consume_refresh_request());
  const auto ready_actions = first.companion_runtime().snapshot().actions;
  assert(ready_actions.size() == 2 && ready_actions[0].id == "com.example.First" && ready_actions[1] == ready);
  first.companion_runtime().set_obs_actions({ready});
  assert(!first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_obs_actions({});
  assert(first.companion_runtime().consume_refresh_request());
  assert(first.companion_runtime().snapshot().actions.size() == 1);
  second.companion_runtime().set_actions({{"com.example.Second", "Second"}});
  assert(!second.companion_runtime().connected());
  second.companion_runtime().set_mac_update_required(true);
  assert(second.companion_runtime().mac_update_required());
  assert(!first.companion_runtime().mac_update_required());
  second.companion_runtime().set_connected(true);
  second.companion_runtime().set_connected(false);
  assert(!second.companion_runtime().mac_update_required());
  assert(first.companion_runtime().snapshot().actions[0].id == "com.example.First");
  assert(second.companion_runtime().snapshot().actions[0].id == "com.example.Second");
  const std::string action_id = "twitch.predictionWinner.1";
  const std::string old_command = action_id + ".12345678-1234-5678-1234-567812345678";
  const std::string new_command = action_id + ".12345678-1234-5678-1234-567812345679";
  auto &runtime = first.companion_runtime();
  runtime.set_twitch_controls({{action_id, "Team A", "Resolve prediction", old_command, true, false}});
  assert(companion_action_available(runtime.snapshot(), old_command));
  runtime.set_twitch_controls({{action_id, "Team B", "Resolve prediction", new_command, true, false}});
  assert(!companion_action_available(runtime.snapshot(), old_command));
  assert(companion_action_available(runtime.snapshot(), new_command));
  assert(runtime.snapshot().actions.front().id == "com.example.First");
  runtime.set_connected(false);
  assert(runtime.twitch_controls().empty());
  assert(!companion_action_available(runtime.snapshot(), new_command));
  runtime.set_connected(true);
  const auto before = allocations;
  for (int i = 0; i < 1000; ++i) assert(first.companion_runtime().connected());
  assert(allocations == before); // Simple status reads never copy the catalogue.
  const std::string remote_json(12000, 'x');
  std::vector<CompanionRemoteDefinition> definitions;
  for (size_t i = 0; i < COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE; ++i)
    definitions.push_back({"application", std::to_string(i), remote_json});
  first.companion_runtime().set_remote_definitions(std::move(definitions));
  const auto before_snapshot = allocations;
  const auto snapshot = first.companion_runtime().snapshot();
  assert(allocations - before_snapshot < 16); // Snapshot reads omit the large remote definition catalogue.
  assert(snapshot.actions[0].id == "com.example.First");
  bool definitions_connected = false;
  bool has_more = false;
  assert(first.companion_runtime().remote_definitions_page(0, 4, definitions_connected, has_more).size() == 4);
  assert(definitions_connected && has_more);
  assert(first.companion_runtime().remote_definitions_page(COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE - 4, 4, definitions_connected, has_more).size() == 4);
  assert(definitions_connected && !has_more);
  assert(first.start());
  bool invoked = false;
  assert(companion_expect_action_result("old-session", [&] { invoked = true; }));
  companion_set_connected(false);
  companion_deliver_action_result("old-session", "activated");
  assert(!invoked);
  auto lifetime = std::make_shared<int>(1);
  std::weak_ptr<int> callback_lifetime = lifetime;
  companion_action_sender() = [lifetime](const std::string &, const std::string &, const std::string &, const std::string &) { return true; };
  first.companion_runtime().begin_pairing = [lifetime] {};
  first.companion_runtime().reset_and_begin_pairing = [lifetime] { return true; };
  assert(!second.companion_runtime().begin_pairing);
  assert(!second.companion_runtime().reset_and_begin_pairing);
  lifetime.reset();
  assert(!callback_lifetime.expired());
  assert(first.stop());
  assert(callback_lifetime.expired());
  assert(second.companion_runtime().snapshot().actions[0].id == "com.example.Second");
  std::cout << "Companion service: " << sizeof(CompanionRuntimeService)
            << " bytes; connection reads: 0 allocations\n";
}
