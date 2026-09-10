#pragma once

#include <cstdint>

namespace espdesktop::cards {

constexpr uint8_t REGISTRY_VERSION = 1;

enum class Family : uint8_t { DATE_TIME, COMPANION, SCREEN_LOCK, SUBPAGE, WEBHOOK, UNKNOWN };

struct Registration {
  uint8_t version = REGISTRY_VERSION;
  Family family = Family::UNKNOWN;
  bool known = false;
  bool allow_in_subpage = false;
};

inline Registration registration(Family family, bool known,
                                 bool allow_in_subpage) {
  return {
    REGISTRY_VERSION,
    family,
    known,
    allow_in_subpage,
  };
}

}  // namespace espdesktop::cards
