#pragma once

#include <functional>
#include <utility>

// Updated on the display loop by authenticated Companion messages. Keep the
// last state during connection loss; reconnect publishes the current Mac state.
inline bool &screen_lock_mac_locked() {
  static bool locked = false;
  return locked;
}

inline bool screen_lock_enabled() {
  return screen_lock_mac_locked();
}

using ScreenLockChangedHandler = std::function<void(bool)>;

inline ScreenLockChangedHandler &screen_lock_changed_handler() {
  static ScreenLockChangedHandler handler;
  return handler;
}

inline void register_screen_lock_changed_handler(ScreenLockChangedHandler handler) {
  screen_lock_changed_handler() = std::move(handler);
}

inline void screen_lock_set_mac_locked(bool locked) {
  if (screen_lock_mac_locked() == locked) return;
  screen_lock_mac_locked() = locked;
  if (screen_lock_changed_handler()) screen_lock_changed_handler()(locked);
}
