#pragma once

#include <optional>
#include "companion_runtime.h"
#include "companion_capabilities_generated.h"

inline bool companion_pairing_can_show_on_display(const CompanionPairingSnapshot &snapshot) {
  return snapshot.available && (snapshot.paired || snapshot.active);
}

// A browser page may ask the panel to show its pairing screen. Only forward
// that on a first pairing: an already-paired panel would show its reset
// confirmation, and pairing another computer keeps the existing pairings.
inline bool companion_pairing_can_show_on_page_load(const CompanionPairingSnapshot &snapshot) {
  return snapshot.available && snapshot.active && !snapshot.paired;
}

// This is the endpoint's operation, shared with the host tests. Authorization
// is evaluated before calling providers or activating a pairing window.
template<typename Provider, typename BeginPairing>
std::optional<CompanionPairingSnapshot> companion_pairing_status(
    bool authorized, Provider provider, BeginPairing begin, bool request_add = false) {
  if (!authorized) return std::nullopt;
  auto snapshot = provider();
  if (COMPANION_BROWSER_STARTS_PAIRING && snapshot.available &&
      (request_add || !snapshot.paired) && !snapshot.active) {
    begin();
    snapshot = provider();
  }
  if (!COMPANION_BROWSER_EXPOSES_PAIRING_CODE || !snapshot.active)
    snapshot.pairing_code.clear();
  return snapshot;
}
