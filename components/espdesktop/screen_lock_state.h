#pragma once

#include <functional>
#include <optional>
#include <utility>

// Updated on the display loop by authenticated Companion messages. Keep the
// lock during connection loss; reconnect publishes the current Mac state.
inline bool &screen_lock_mac_locked() {
  static bool locked = false;
  return locked;
}

inline bool screen_lock_enabled() {
  return screen_lock_mac_locked();
}

inline std::optional<bool> &screen_lock_mac_display_awake() {
  static std::optional<bool> awake;
  return awake;
}

inline bool screen_lock_keeps_display_on(bool display_off) {
  return display_off && screen_lock_enabled() && screen_lock_mac_display_awake().value_or(false);
}

using ScreenLockChangedHandler = std::function<void(bool)>;

inline ScreenLockChangedHandler &screen_lock_changed_handler() {
  static ScreenLockChangedHandler handler;
  return handler;
}

inline void register_screen_lock_changed_handler(ScreenLockChangedHandler handler) {
  screen_lock_changed_handler() = std::move(handler);
}

inline void screen_lock_set_mac_locked(bool locked, std::optional<bool> display_awake = std::nullopt) {
  if (!locked) display_awake.reset();
  if (screen_lock_mac_locked() == locked && screen_lock_mac_display_awake() == display_awake) return;
  screen_lock_mac_locked() = locked;
  screen_lock_mac_display_awake() = display_awake;
  if (screen_lock_changed_handler()) screen_lock_changed_handler()(locked);
}
