#pragma once

// Fixed capacities shared by the grid and its behaviour modules. Devices may
// lower the main-grid limit with a build flag, but saved configuration and
// allocation lifetimes remain unchanged.
#ifndef ESPDESKTOP_MAX_GRID_SLOTS
#define ESPDESKTOP_MAX_GRID_SLOTS 25
#endif

constexpr int MAX_GRID_SLOTS = ESPDESKTOP_MAX_GRID_SLOTS;
static_assert(MAX_GRID_SLOTS > 0, "ESPDESKTOP_MAX_GRID_SLOTS must be positive");

#ifndef ESPDESKTOP_CARD_BACKGROUND_MAX_ACTIVE
#define ESPDESKTOP_CARD_BACKGROUND_MAX_ACTIVE ESPDESKTOP_MAX_GRID_SLOTS
#endif
#ifndef ESPDESKTOP_CARD_BACKGROUND_RESIDENT_FRAMES
#define ESPDESKTOP_CARD_BACKGROUND_RESIDENT_FRAMES ESPDESKTOP_CARD_BACKGROUND_MAX_ACTIVE
#endif

constexpr int CARD_BACKGROUND_MAX_ACTIVE = ESPDESKTOP_CARD_BACKGROUND_MAX_ACTIVE;
constexpr int CARD_BACKGROUND_RESIDENT_FRAMES = ESPDESKTOP_CARD_BACKGROUND_RESIDENT_FRAMES;
static_assert(CARD_BACKGROUND_MAX_ACTIVE > 0 && CARD_BACKGROUND_MAX_ACTIVE <= MAX_GRID_SLOTS,
              "Card background active limit must fit the device grid");
static_assert(CARD_BACKGROUND_RESIDENT_FRAMES > 0 &&
                  CARD_BACKGROUND_RESIDENT_FRAMES <= CARD_BACKGROUND_MAX_ACTIVE,
              "Card background resident frame pool must fit the active limit");
constexpr int MAX_SUBPAGE_ITEMS = MAX_GRID_SLOTS * MAX_GRID_SLOTS;

inline int bounded_grid_slots(int num_slots) {
  if (num_slots < 0) return 0;
  return num_slots > MAX_GRID_SLOTS ? MAX_GRID_SLOTS : num_slots;
}
