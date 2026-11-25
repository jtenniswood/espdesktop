#pragma once

#include <array>
#include <cstddef>
#include <functional>
#include <optional>
#include <string>
#include <utility>

// Updated on the display loop by authenticated Companion messages. Keep the
// lock during connection loss; reconnect publishes the current computer state.
inline bool &screen_lock_mac_locked() {
  static bool locked = false;
  return locked;
}

// Each paired computer reports its own lock state. A locked computer blocks
// commands addressed to it; the display-wide screensaver follows the
// computers as a group (see below).
struct ScreenLockComputerState {
  std::string id;
  bool locked{false};
  std::optional<bool> awake;
};

inline std::array<ScreenLockComputerState, 4> &screen_lock_computer_states() {
  static std::array<ScreenLockComputerState, 4> states;
  return states;
}

inline ScreenLockComputerState *screen_lock_find_computer(const std::string &computer_id) {
  for (auto &state : screen_lock_computer_states())
    if (state.id == computer_id) return &state;
  return nullptr;
}

inline bool screen_lock_computer_locked(const std::string &computer_id) {
  if (computer_id.empty()) return screen_lock_mac_locked();
  const auto *state = screen_lock_find_computer(computer_id);
  return state && state->locked;
}

using ScreenLockChangedHandler = std::function<void(bool)>;

inline ScreenLockChangedHandler &screen_lock_changed_handler() {
  static ScreenLockChangedHandler handler;
  return handler;
}

inline void register_screen_lock_changed_handler(ScreenLockChangedHandler handler) {
  screen_lock_changed_handler() = std::move(handler);
}

inline std::optional<bool> &screen_lock_mac_display_awake() {
  static std::optional<bool> awake;
  return awake;
}

// Screensaver and display power are display-wide decisions. The panel counts
// as locked only while every known computer is locked, so an unlocked
// computer keeps the panel awake and usable while another computer's cards
// are gated by its own lock.
inline bool screen_lock_display_locked() {
  if (screen_lock_mac_locked()) return true;
  bool known = false;
  for (const auto &state : screen_lock_computer_states()) {
    if (state.id.empty()) continue;
    known = true;
    if (!state.locked) return false;
  }
  return known;
}

// The screen lock presentation. It follows the display-wide lock, so a panel
// with one computer keeps the original lock screen and a panel with several
// computers keeps working until all of them are locked.
inline bool screen_lock_enabled() {
  return screen_lock_display_locked();
}

inline std::optional<bool> screen_lock_display_awake() {
  if (screen_lock_mac_locked()) return screen_lock_mac_display_awake();
  std::optional<bool> asleep;
  for (const auto &state : screen_lock_computer_states()) {
    if (state.id.empty() || !state.locked || !state.awake.has_value()) continue;
    if (*state.awake) return true;
    asleep = false;
  }
  return asleep;
}

inline bool screen_lock_follows_display_power(bool display_off, bool connected) {
  const auto awake = screen_lock_display_awake();
  return display_off && screen_lock_display_locked() && awake.has_value() &&
      (connected || !*awake);
}

// A disconnect keeps a sleeping panel dark, but an awake value left over from
// the old session must not keep the panel awake indefinitely.
inline void screen_lock_discard_stale_display_awake() {
  if (screen_lock_mac_display_awake() == true) screen_lock_mac_display_awake().reset();
  for (auto &state : screen_lock_computer_states())
    if (state.awake == true) state.awake.reset();
}

inline void screen_lock_notify_display_changed(bool was_locked,
                                               std::optional<bool> was_awake,
                                               bool entry_changed = false) {
  const bool locked = screen_lock_display_locked();
  if (!entry_changed && locked == was_locked &&
      screen_lock_display_awake() == was_awake) return;
  if (screen_lock_changed_handler()) screen_lock_changed_handler()(locked);
}

inline void screen_lock_clear_computer(const std::string &computer_id) {
  auto *state = screen_lock_find_computer(computer_id);
  if (!state) return;
  const bool was_locked = screen_lock_display_locked();
  const auto was_awake = screen_lock_display_awake();
  *state = {};
  screen_lock_notify_display_changed(was_locked, was_awake, true);
}

// A disconnected unlocked computer should not keep the panel awake for
// another computer that is locked. A locked computer keeps its state so a
// reconnect does not briefly unlock its cards before the next report.
inline void screen_lock_disconnect_computer(const std::string &computer_id) {
  const auto *state = screen_lock_find_computer(computer_id);
  if (!state || state->locked) return;
  screen_lock_clear_computer(computer_id);
}

inline void screen_lock_set_mac_locked(bool locked, std::optional<bool> display_awake = std::nullopt) {
  if (!locked) display_awake.reset();
  if (screen_lock_mac_locked() == locked && screen_lock_mac_display_awake() == display_awake) return;
  screen_lock_mac_locked() = locked;
  screen_lock_mac_display_awake() = display_awake;
  if (screen_lock_changed_handler()) screen_lock_changed_handler()(locked);
}

inline void screen_lock_set_computer_locked(const std::string &computer_id, bool locked,
                                            std::optional<bool> display_awake = std::nullopt) {
  if (computer_id.empty()) {
    screen_lock_set_mac_locked(locked, display_awake);
    return;
  }
  auto *state = screen_lock_find_computer(computer_id);
  if (!state) {
    for (auto &candidate : screen_lock_computer_states()) {
      if (candidate.id.empty()) {
        candidate.id = computer_id;
        state = &candidate;
        break;
      }
    }
  }
  if (!state) state = &screen_lock_computer_states()[0];
  const bool was_locked = screen_lock_display_locked();
  const auto was_awake = screen_lock_display_awake();
  const bool was_entry_locked = state->locked;
  const auto was_entry_awake = state->awake;
  state->locked = locked;
  state->awake = locked ? display_awake : std::nullopt;
  const bool entry_changed = state->locked != was_entry_locked ||
      state->awake != was_entry_awake;
  screen_lock_notify_display_changed(was_locked, was_awake, entry_changed);
}
