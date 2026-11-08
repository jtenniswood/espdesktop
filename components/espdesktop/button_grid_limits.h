#pragma once

// Fixed capacities shared by the grid and its behaviour modules. Devices may
// lower the main-grid limit with a build flag, but saved configuration and
// allocation lifetimes remain unchanged.
#ifndef ESPDESKTOP_MAX_GRID_SLOTS
#define ESPDESKTOP_MAX_GRID_SLOTS 25
#endif

constexpr int MAX_GRID_SLOTS = ESPDESKTOP_MAX_GRID_SLOTS;
static_assert(MAX_GRID_SLOTS > 0, "ESPDESKTOP_MAX_GRID_SLOTS must be positive");
constexpr int MAX_SUBPAGE_ITEMS = MAX_GRID_SLOTS * MAX_GRID_SLOTS;

inline int bounded_grid_slots(int num_slots) {
  if (num_slots < 0) return 0;
  return num_slots > MAX_GRID_SLOTS ? MAX_GRID_SLOTS : num_slots;
}
