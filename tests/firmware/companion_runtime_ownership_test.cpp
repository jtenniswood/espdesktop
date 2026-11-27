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
  const std::vector<std::string> previous_apps{"app.card", "app.unused", "app.other"};
  const std::vector<std::string> configured_apps{"app.card", "app.already.missing"};
  assert(companion_can_skip_catalogue_icon_refresh(true, previous_apps, {"app.other", "app.card"}, configured_apps));
  assert(!companion_can_skip_catalogue_icon_refresh(false, previous_apps, {"app.other", "app.card"}, configured_apps));
  assert(!companion_can_skip_catalogue_icon_refresh(true, previous_apps, {"app.other"}, configured_apps));
  assert(!companion_can_skip_catalogue_icon_refresh(true, previous_apps, {"app.card", "app.new"}, configured_apps));
  assert(!companion_can_skip_catalogue_icon_refresh(true, previous_apps, previous_apps, configured_apps));
  assert(companion_can_skip_catalogue_icon_refresh(true, {"app.unused"}, {}, configured_apps));

  espdesktop::EspDesktopAppCore first, second;
  first.companion_runtime().set_actions({{"com.example.First", "First"}});
  first.companion_runtime().set_connected(true);
  assert(first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_windows_shortcuts(true);
  assert(first.companion_runtime().windows_shortcuts());
  assert(!second.companion_runtime().windows_shortcuts());
  first.companion_runtime().set_connected(false);
  first.companion_runtime().set_connected(true);
  assert(!first.companion_runtime().windows_shortcuts());
  assert(first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_actions({{"com.example.First", "First"}});
  assert(!first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_remote_definitions({});
  assert(!first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_keyboard_actions_supported(true);
  assert(!first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_keyboard_actions_supported(false);
  assert(first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_keyboard_actions_supported(false);
  assert(!first.companion_runtime().consume_refresh_request());
  first.companion_runtime().set_keyboard_actions_supported(true);
  assert(first.companion_runtime().consume_refresh_request());
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
  auto &shortcut_catalogue = first.companion_runtime().shortcut_catalogue;
  using Status = CompanionShortcutCatalogue::Status;
  assert(shortcut_catalogue.read("com.example.First", 0, 0).status == Status::unavailable);
  shortcut_catalogue.set_supported(true);
  const auto requested = shortcut_catalogue.read("com.example.First", 0, 0);
  assert(requested.status == Status::request);
  assert(shortcut_catalogue.read("com.example.Second", 0, 1).status == Status::pending);
  shortcut_catalogue.receive({requested.request_id, "com.example.Second", 0, 5, true, "{}"});
  assert(shortcut_catalogue.read("com.example.First", 0, 2).status == Status::pending);
  shortcut_catalogue.receive({requested.request_id, "com.example.First", 0, 5, true, "{}"});
  const auto received = shortcut_catalogue.read("com.example.First", 0, 3);
  assert(received.status == Status::ready && received.page.json == "{}");
  const auto previous_session = shortcut_catalogue.read("com.example.Second", 0, 4);
  shortcut_catalogue.set_supported(false);
  shortcut_catalogue.set_supported(true);
  const auto new_session = shortcut_catalogue.read("com.example.Second", 0, 5);
  assert(new_session.request_id != previous_session.request_id);
  shortcut_catalogue.receive({previous_session.request_id, "com.example.Second", 0, 5, true, "{}"});
  assert(shortcut_catalogue.read("com.example.Second", 0, 6).status == Status::pending);
  assert(shortcut_catalogue.read("com.example.First", 0, 3005).status == Status::request);
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

  // Each paired computer keeps an isolated runtime. Legacy cards resolve to
  // the primary computer, while the active computer follows the last input.
  CompanionRuntimeRegistry registry;
  registry.set_primary_computer("0011223344556677");
  auto &primary_runtime = registry.for_computer("0011223344556677");
  auto &secondary_runtime = registry.for_computer("8899aabbccddeeff");
  assert(&primary_runtime == &registry.primary());
  assert(&primary_runtime != &secondary_runtime);
  primary_runtime.set_actions({{"com.example.Primary", "Primary"}});
  secondary_runtime.set_actions({{"com.example.Secondary", "Secondary"}});
  primary_runtime.set_connected(true);
  secondary_runtime.set_connected(true);
  assert(registry.any_connected());
  assert(registry.active_computer() == "0011223344556677");
  assert(registry.active().snapshot().actions[0].id == "com.example.Primary");
  registry.set_active_computer("8899aabbccddeeff");
  assert(registry.is_active_computer("8899aabbccddeeff"));
  assert(registry.active().snapshot().actions[0].id == "com.example.Secondary");
  assert(registry.for_computer("8899aabbccddeeff").snapshot().actions[0].id == "com.example.Secondary");

  // The registry holds at most four computers. An extra ID reads an empty
  // runtime rather than borrowing (and then rebinding) another computer.
  auto &third = registry.for_computer("1111111111111111");
  auto &fourth = registry.for_computer("2222222222222222");
  assert(&third != &fourth);
  auto &overflow = registry.for_computer("3333333333333333");
  assert(&overflow != &registry.primary());
  assert(!registry.has_computer("3333333333333333"));

  // Revoking a computer frees its slot for the next pairing.
  registry.release_computer("1111111111111111");
  auto &fifth = registry.for_computer("3333333333333333");
  assert(registry.has_computer("3333333333333333"));
  assert(&fifth != &registry.primary());
  fifth.set_actions({{"com.example.Fifth", "Fifth"}});
  assert(registry.for_computer("3333333333333333").snapshot().actions[0].id == "com.example.Fifth");

  registry.reset_computer("8899aabbccddeeff");
  assert(!registry.for_computer("8899aabbccddeeff").connected());
  assert(registry.for_computer("8899aabbccddeeff").snapshot().actions.empty());

  // Promoting a computer moves its state to the primary slot.
  registry.set_primary_computer("0011223344556677");
  registry.set_primary_computer("2222222222222222");
  fourth.set_actions({{"com.example.Fourth", "Fourth"}});
  assert(registry.primary().snapshot().actions[0].id == "com.example.Fourth");
  registry.reset();

  std::cout << "Companion service: " << sizeof(CompanionRuntimeService)
            << " bytes; connection reads: 0 allocations\n";
}
