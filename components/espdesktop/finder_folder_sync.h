#pragma once

// Included after the card/subpage parsers. Occupancy comes from the same layout
// calculation used by the display, including large cards and the Back button.
inline std::string finder_append_folder_tiles(
    const std::string &config, const std::vector<bool> &occupied,
    const std::vector<CompanionAction> &folders, size_t capacity = 65535,
    const std::string &open_behavior = "new_window") {
  auto buttons = parse_subpage_config(config);
  const size_t start = !config.empty() && config[0] == '~' ? 1 : 0;
  std::string order_text = config.substr(start, config.find('|', start) - start);
  auto order = split_subpage_fields(order_text, ',');
  // The caller supplies normalized explicit Back positions.
  if (order.size() < occupied.size()) order.resize(occupied.size());
  auto serialize = [&]() {
    std::string out = "~";
    for (size_t index = 0; index < order.size(); ++index) {
      if (index) out += ',';
      out += order[index];
    }
    // Full type names are accepted by the compact parser. Escape every field,
    // including user-provided directory names, so delimiters remain harmless.
    for (const auto &button : buttons) {
      out += "|" + encode_compact_field(button.type) + "," + encode_compact_field(button.entity) +
        "," + encode_compact_field(button.label) + "," + encode_compact_field(button.icon) +
        "," + encode_compact_field(button.icon_on) + "," + encode_compact_field(button.sensor) +
        "," + encode_compact_field(button.unit) + "," + encode_compact_field(button.precision) +
        "," + encode_compact_field(button.options);
    }
    return out;
  };
  std::string result = config;
  for (const auto &folder : folders) {
    if (folder.id.rfind("folder.", 0) != 0 || folder.id.size() <= 7) continue;
    if (std::any_of(buttons.begin(), buttons.end(), [&](const auto &button) {
          return button.entity == folder.id;
        })) continue;
    size_t position = 0;
    while (position < occupied.size() &&
           (occupied[position] || !order[position].empty())) ++position;
    if (position == occupied.size()) break;
    const std::string options = open_behavior == "same_window"
      ? "finder_open_behavior=same_window" : "finder_open_behavior=new_window";
    buttons.push_back({folder.id, folder.label, "Folder Outline", "Auto", "", "", "companion", "", options});
    order[position] = std::to_string(buttons.size());
    auto candidate = serialize();
    if (candidate.size() > capacity) {
      buttons.pop_back();
      order[position].clear();
      continue;
    }
    result = std::move(candidate);
  }
  return result;
}

inline std::string finder_append_folder_tiles_for_grid(
    const std::string &config, int slots, int columns,
    const std::vector<CompanionAction> &folders, size_t capacity,
    const std::string &behavior) {
  const auto buttons = parse_subpage_config(config);
  SubpageOrder order;
  parse_subpage_order(get_subpage_order(config), slots, buttons.size(), order);
  if (!order.has_back_token) return config;
  normalize_subpage_order_spans(order, slots, columns);
  std::vector<bool> occupied(slots, false);
  auto occupy = [&](int position, int rows, int cols) {
    for (int row = 0; row < rows; ++row)
      for (int col = 0; col < cols; ++col) {
        const int cell = position + row * columns + col;
        if (cell >= 0 && cell < slots) occupied[cell] = true;
      }
  };
  occupy(order.back_pos, order.back_row_span, order.back_col_span);
  for (int position = 0; position < slots; ++position) {
    const int index = order.positions[position];
    if (index > 0 && index <= static_cast<int>(buttons.size()))
      occupy(position, order.row_span[index - 1], order.col_span[index - 1]);
  }
  return finder_append_folder_tiles(config, occupied, folders, capacity, behavior);
}
