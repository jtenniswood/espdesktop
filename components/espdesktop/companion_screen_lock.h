#pragma once

#include "button_grid_config_parser.h"
#include "companion_runtime_access.h"
#include "screen_lock_state.h"

// Companion cards follow the lock state of the computer they command. Cards
// saved before per-computer pairing resolve to the primary computer; cards
// that are not Companion controls keep the legacy display-wide lock.
inline bool card_action_locked(const ParsedCfg &card) {
  if (!companion_card_type_name(card.type)) return screen_lock_enabled();
  return companion_computer_locked(companion_card_computer(card));
}
