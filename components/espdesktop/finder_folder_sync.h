#pragma once

// The live catalogue has no ownership of the saved grid. Projection only
// fills unoccupied cells in the renderer's local copy.
inline bool finder_folder_catalogue_equal(const std::vector<CompanionAction> &left,
                                         const std::vector<CompanionAction> &right) {
  return left.size() == right.size() &&
      std::equal(left.begin(), left.end(), right.begin(), [](const auto &a, const auto &b) {
        return a.id == b.id && a.label == b.label;
      });
}

inline void finder_project_folder_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                       int slots, int columns, const std::vector<CompanionAction> &folders,
                                       const std::string &open_behavior) {
  if (!order.has_back_token) return;
  std::array<bool, MAX_GRID_SLOTS> occupied{};
  auto occupy = [&](int position, int rows, int cols) {
    for (int row = 0; row < rows; ++row)
      for (int col = 0; col < cols; ++col)
        occupied[position + row * columns + col] = true;
  };
  occupy(order.back_pos, order.back_row_span, order.back_col_span);
  for (int position = 0; position < slots; ++position) {
    const int index = order.positions[position];
    if (index > 0)
      occupy(position, order.row_span[index - 1], order.col_span[index - 1]);
  }

  int position = 0;
  const std::string options = "finder_open_behavior=" + open_behavior;
  for (const auto &folder : folders) {
    while (position < slots && occupied[position]) ++position;
    if (position == slots || buttons.size() == MAX_GRID_SLOTS) return;
    if (folder.id.rfind("folder.", 0) != 0 || folder.id.size() <= 7) continue;
    const bool placed = std::any_of(order.positions, order.positions + slots, [&](int index) {
      return index > 0 && buttons[index - 1].entity == folder.id;
    });
    if (placed) continue;
    buttons.push_back({folder.id, folder.label, "Folder Outline", "Auto", "", "", "companion", "", options});
    order.positions[position++] = static_cast<int>(buttons.size());
  }
}
