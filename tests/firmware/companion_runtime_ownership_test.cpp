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
  second.companion_runtime().set_mac_update_required(true);
  assert(second.companion_runtime().mac_update_required());
  assert(!first.companion_runtime().mac_update_required());
  second.companion_runtime().set_connected(true);
  second.companion_runtime().set_connected(false);
  assert(!second.companion_runtime().mac_update_required());
  assert(first.companion_runtime().snapshot().actions[0].id == "com.example.First");
  assert(second.companion_runtime().snapshot().actions[0].id == "com.example.Second");
  using espdesktop::CheckStatus;
  using espdesktop::HealthchecksState;
  using espdesktop::HEALTHCHECK_PAGE_SIZE;
  auto &healthchecks = first.companion_runtime().healthchecks;
  constexpr std::string_view CHECK_ID = "0123456789abcdef0123456789abcdef01234567";
  std::array<espdesktop::HealthcheckEntry, HEALTHCHECK_PAGE_SIZE> checks{};
  auto &check = checks.front();
  std::copy(CHECK_ID.begin(), CHECK_ID.end(), check.id.begin());
  check.status = CheckStatus::UP;
  healthchecks.set_connected(true);
  assert(healthchecks.receive(1, 0, 1, true, HealthchecksState::READY, checks.data(), 1, 100));
  assert(healthchecks.reading(CHECK_ID, 100).check->status == CheckStatus::UP);
  assert(healthchecks.reading(CHECK_ID, 90101).state == HealthchecksState::STALE);
  check.status = CheckStatus::DOWN;
  assert(healthchecks.receive(2, 0, 33, false, HealthchecksState::READY, checks.data(), checks.size(), 60000));
  assert(healthchecks.reading(CHECK_ID, 60000).check->status == CheckStatus::UP);
  assert(!healthchecks.receive(3, 1, 33, true, HealthchecksState::READY, checks.data(), 1, 60000));
  assert(healthchecks.receive(2, 1, 33, true, HealthchecksState::READY, checks.data(), 1, 60000));
  assert(healthchecks.reading(CHECK_ID, 60000).check->status == CheckStatus::DOWN);
  assert(healthchecks.editor_page(0, 60000).has_more);
  assert(healthchecks.editor_page(1, 60000).checks.size() == 1);
  healthchecks.set_connected(false);
  assert(healthchecks.reading(CHECK_ID, 70000).state == HealthchecksState::STALE);
  assert(healthchecks.editor_page(0, 70000).checks.empty());
  healthchecks.set_connected(true);
  assert(healthchecks.receive(1, 0, 0, true, HealthchecksState::READY, nullptr, 0, 75000));
  assert(!healthchecks.reading(CHECK_ID, 75000).check);
  assert(healthchecks.reading(CHECK_ID, 75000).state == HealthchecksState::READY);
  healthchecks.clear();
  assert(healthchecks.reading(CHECK_ID, 75000).state == HealthchecksState::UNAVAILABLE);

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
