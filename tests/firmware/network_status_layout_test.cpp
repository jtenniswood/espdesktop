#include "../../components/espdesktop/network_status_layout.h"
#include <cassert>

int main() {
  // Every supported grid shape must fit all six EspDesktop cards without overlap.
  for (const auto dimensions : {NetworkStatusGridCell{2, 3}, {3, 2}, {3, 3},
                                {5, 3}, {3, 5}, {5, 4}, {4, 5}}) {
    bool occupied[25]{};
    for (int index = 0; index < NETWORK_STATUS_CARD_COUNT; ++index) {
      const auto cell = network_status_grid_cell(index, dimensions.column);
      assert(cell.column >= 0 && cell.column < dimensions.column);
      assert(cell.row >= 0 && cell.row < dimensions.row);
      const int slot = cell.row * dimensions.column + cell.column;
      assert(!occupied[slot]);
      occupied[slot] = true;
    }
  }
  const auto wide_build = network_status_grid_cell(NETWORK_STATUS_BUILD_CARD_INDEX, 5);
  assert(wide_build.column == 0 && wide_build.row == 1);
  const auto narrow_pairing = network_status_grid_cell(NETWORK_STATUS_PAIRING_CARD_INDEX, 2);
  assert(narrow_pairing.column == 0 && narrow_pairing.row == 1);
  const auto fallback = network_status_grid_cell(1, 0);
  assert(fallback.column == 0 && fallback.row == 1);
}
