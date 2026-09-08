#pragma once

#include <cstdint>
#include <string>

// UI feedback only: never used as proof that an app is ready for shortcuts.
struct CompanionFocusFeedback {
  std::string action_id;
  uint32_t started_at{0};

  void begin(const std::string &action, uint32_t now) {
    action_id = action;
    started_at = now;
  }

  bool reconcile(bool connected, const std::string &confirmed_action, uint32_t now) {
    if (action_id.empty()) return false;
    if (!connected || action_id == confirmed_action ||
        static_cast<uint32_t>(now - started_at) >= 1000) {
      action_id.clear();
      return true;
    }
    return false;
  }
};
