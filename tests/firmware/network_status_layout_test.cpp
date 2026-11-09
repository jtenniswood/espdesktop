#include "../../components/espdesktop/network_status_layout.h"
#include <cassert>

int main() {
  // Every supported grid shape must fit all Settings cards without overlap.
  for (const auto dimensions : {NetworkStatusGridCell{2, 3}, {3, 2}, {3, 3},
                                {5, 3}, {3, 5}, {5, 4}, {4, 5}}) {
    const int rows = network_status_grid_rows(dimensions.column, dimensions.row, NETWORK_STATUS_CARD_COUNT);
    bool occupied[25]{};
    for (int index = 0; index < NETWORK_STATUS_CARD_COUNT; ++index) {
      const auto cell = network_status_grid_cell(index, dimensions.column);
      assert(cell.column >= 0 && cell.column < dimensions.column);
      assert(cell.row >= 0 && cell.row < rows);
      const int slot = cell.row * dimensions.column + cell.column;
      assert(!occupied[slot]);
      occupied[slot] = true;
    }
  }
  assert(NETWORK_STATUS_BUILD_CARD_INDEX == 5);
  assert(NETWORK_STATUS_NAME_CARD_INDEX == NETWORK_STATUS_CARD_COUNT - 1);
  assert(network_status_grid_rows(2, 3, 7) == 4);
  assert(network_status_grid_rows(3, 2, 7) == 3);
  assert(network_status_grid_rows(2, 3, 6) == 3);
  const auto wide_build = network_status_grid_cell(NETWORK_STATUS_BUILD_CARD_INDEX, 5);
  assert(wide_build.column == 0 && wide_build.row == 1);
  const auto narrow_pairing = network_status_grid_cell(NETWORK_STATUS_PAIRING_CARD_INDEX, 2);
  assert(narrow_pairing.column == 0 && narrow_pairing.row == 1);
  const auto fallback = network_status_grid_cell(1, 0);
  assert(fallback.column == 0 && fallback.row == 1);
}
