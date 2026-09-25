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
  second.companion_runtime().set_actions({{"com.example.Second", "Second"}});
  assert(!second.companion_runtime().connected());
  assert(first.companion_runtime().snapshot().actions[0].id == "com.example.First");
  assert(second.companion_runtime().snapshot().actions[0].id == "com.example.Second");
  const auto before = allocations;
  for (int i = 0; i < 1000; ++i) assert(first.companion_runtime().connected());
  assert(allocations == before); // Simple status reads never copy the catalogue.
  std::vector<CompanionRemoteDefinition> definitions;
  definitions.reserve(COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE * 2);
  for (size_t i = 0; i < COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE * 2; ++i)
    definitions.push_back({i < COMPANION_MAX_REMOTE_DEFINITIONS_PER_CATALOGUE ? "application" : "webapp",
                           std::to_string(i), "", "{}"});
  first.companion_runtime().set_remote_definitions(std::move(definitions));
  const auto before_snapshot = allocations;
  const auto snapshot = first.companion_runtime().snapshot();
  assert(allocations - before_snapshot < 16); // Snapshot reads omit the large remote definition catalogue.
  assert(snapshot.actions[0].id == "com.example.First");
  bool definitions_connected = false;
  bool has_more = false;
  assert(first.companion_runtime().remote_definitions_page(0, 4, definitions_connected, has_more).size() == 4);
  assert(definitions_connected && has_more);
  assert(first.companion_runtime().remote_definitions_page(252, 4, definitions_connected, has_more).size() == 4);
  assert(definitions_connected && !has_more);
  assert(first.start());
  bool invoked = false;
  assert(companion_expect_action_result("old-session", [&] { invoked = true; }));
  companion_set_connected(false);
  companion_deliver_action_result("old-session", "activated");
  assert(!invoked);
  auto lifetime = std::make_shared<int>(1);
  std::weak_ptr<int> callback_lifetime = lifetime;
  companion_action_sender() = [lifetime](const std::string &, const std::string &, const std::string &) { return true; };
  first.companion_runtime().begin_pairing = [lifetime] {};
  first.companion_runtime().revoke_pairing = [lifetime] {};
  assert(!second.companion_runtime().begin_pairing);
  assert(!second.companion_runtime().revoke_pairing);
  lifetime.reset();
  assert(!callback_lifetime.expired());
  assert(first.stop());
  assert(callback_lifetime.expired());
  assert(second.companion_runtime().snapshot().actions[0].id == "com.example.Second");
  std::cout << "Companion service: " << sizeof(CompanionRuntimeService)
            << " bytes; connection reads: 0 allocations\n";
}
