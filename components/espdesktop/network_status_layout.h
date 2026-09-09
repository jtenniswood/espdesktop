#pragma once

#include <algorithm>

struct NetworkStatusGridCell {
  int column = 0;
  int row = 0;
};

enum NetworkStatusCardIndex {
  NETWORK_STATUS_BACK_CARD_INDEX,
  NETWORK_STATUS_IP_CARD_INDEX,
  NETWORK_STATUS_PAIRING_CARD_INDEX,
  NETWORK_STATUS_CONNECTOR_CARD_INDEX,
  NETWORK_STATUS_WIFI_CARD_INDEX,
  NETWORK_STATUS_BUILD_CARD_INDEX,
  NETWORK_STATUS_BACKLIGHT_CARD_INDEX,
  NETWORK_STATUS_CARD_COUNT,
};

// Flow 1x1 Settings cards in the same order on every device and orientation.
inline NetworkStatusGridCell network_status_grid_cell(int card_index, int columns) {
  const int safe_columns = std::max(1, columns);
  return {card_index % safe_columns, card_index / safe_columns};
}

inline int network_status_grid_rows(int columns, int rows, int card_count) {
  const int safe_columns = std::max(1, columns);
  return std::max(rows, (card_count + safe_columns - 1) / safe_columns);
}
