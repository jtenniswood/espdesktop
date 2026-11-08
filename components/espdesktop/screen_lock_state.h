#pragma once

#include "screensaver_pin.h"
#include <cstdint>
#include <functional>
#include <utility>

inline bool screen_lock_enabled() {
  return espdesktop::screensaver_pin().locked();
}

using ScreenLockChangedHandler = std::function<void(bool)>;

inline ScreenLockChangedHandler &screen_lock_changed_handler() {
  static ScreenLockChangedHandler handler;
  return handler;
}

inline void register_screen_lock_changed_handler(ScreenLockChangedHandler handler) {
  screen_lock_changed_handler() = std::move(handler);
}

inline void screen_lock_apply() {
  const bool locked = screen_lock_enabled();
  static bool previous_locked = false;
  if (locked != previous_locked) {
    previous_locked = locked;
    if (screen_lock_changed_handler()) screen_lock_changed_handler()(locked);
  }
}

inline std::function<void()> &show_screen_lock_pin() {
  static std::function<void()> action;
  return action;
}

inline void screen_lock_activate() {
  if (!espdesktop::screensaver_pin().lock(true)) return;
  screen_lock_apply();
  if (show_screen_lock_pin()) show_screen_lock_pin()();
}
