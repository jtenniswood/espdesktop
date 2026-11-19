#pragma once

#include <cstdint>
#include <optional>

enum class AllowanceState { UNAVAILABLE, LAST_KNOWN, AVAILABLE, COUNTDOWN };

inline AllowanceState allowance_state(bool connected, int64_t now, uint32_t observed_at,
                                      std::optional<uint32_t> resets_at) {
  if (!observed_at) return AllowanceState::UNAVAILABLE;
  if (!connected || now <= 1700000000 || now - observed_at > 900 ||
      static_cast<int64_t>(observed_at) - now > 60 ||
      (resets_at && *resets_at <= now)) return AllowanceState::LAST_KNOWN;
  return resets_at ? AllowanceState::COUNTDOWN : AllowanceState::AVAILABLE;
}
