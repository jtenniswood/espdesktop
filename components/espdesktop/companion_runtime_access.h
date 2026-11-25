#pragma once

#include <cstdlib>

#include "espdesktop_app_core.h"
#include "screen_lock_state.h"

// Temporary facade for existing card/YAML entry points. Production state has
// an application owner; the fallback is compiled only for isolated host tests.
inline CompanionRuntimeRegistry &companion_runtime_registry() {
  if (auto *core = espdesktop::active_espdesktop_app_core()) return core->companion_runtimes();
#if defined(USE_ESP32)
  std::abort();
#else
  static CompanionRuntimeRegistry host_test_runtimes;
  return host_test_runtimes;
#endif
}

// Global surfaces read the active computer. Cards saved before multi-computer
// pairing used the primary computer and keep doing so through the default.
inline CompanionRuntimeService &companion_runtime_service() {
  return companion_runtime_registry().active();
}

inline CompanionRuntimeService &companion_runtime_for(const std::string &computer_id) {
  return computer_id.empty() ? companion_runtime_registry().primary()
                             : companion_runtime_registry().find_or_primary(computer_id);
}

// Transport authentication is the only path that creates a runtime.
inline CompanionRuntimeService &companion_runtime_create(const std::string &computer_id) {
  return computer_id.empty() ? companion_runtime_registry().primary()
                             : companion_runtime_registry().for_computer(computer_id);
}

inline void companion_set_primary_computer(const std::string &computer_id) {
  companion_runtime_registry().set_primary_computer(computer_id);
}

inline std::string companion_primary_computer() {
  return companion_runtime_registry().primary_computer();
}

// A command without an explicit computer runs on the primary one, so its lock
// state must follow that computer. A display-wide lock (the legacy Mac lock,
// or every paired computer locked) still covers every Companion card.
inline bool companion_computer_locked(const std::string &computer_id) {
  if (screen_lock_enabled()) return true;
  const std::string effective =
      computer_id.empty() ? companion_primary_computer() : computer_id;
  return !effective.empty() && screen_lock_computer_locked(effective);
}

inline void companion_set_active_computer(const std::string &computer_id) {
  if (companion_runtime_registry().active_computer() == computer_id) return;
  companion_runtime_registry().set_active_computer(computer_id);
  companion_runtime_registry().request_refresh_all();
}

inline std::string companion_active_computer() {
  return companion_runtime_registry().active_computer();
}

inline bool companion_is_active_computer(const std::string &computer_id) {
  return companion_runtime_registry().is_active_computer(computer_id);
}

inline void companion_reset_computer_runtime(const std::string &computer_id) {
  companion_runtime_registry().reset_computer(computer_id);
}

inline void companion_release_computer_runtime(const std::string &computer_id) {
  companion_runtime_registry().release_computer(computer_id);
}

inline std::string companion_first_connected_computer() {
  return companion_runtime_registry().first_connected_computer();
}
