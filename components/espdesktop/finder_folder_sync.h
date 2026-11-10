#pragma once

// Included after the card/subpage parsers. Occupancy comes from the same layout
// calculation used by the display, including large cards and the Back button.
struct FinderFolderTilePlan {
  std::string order;
  std::vector<SubpageBtn> added;
};

inline std::string finder_folder_card_record(const SubpageBtn &button) {
  return "|" + encode_compact_field(button.type) + "," + encode_compact_field(button.entity) +
    "," + encode_compact_field(button.label) + "," + encode_compact_field(button.icon) +
    "," + encode_compact_field(button.icon_on) + "," + encode_compact_field(button.sensor) +
    "," + encode_compact_field(button.unit) + "," + encode_compact_field(button.precision) +
    "," + encode_compact_field(button.options);
}

inline FinderFolderTilePlan finder_plan_folder_tiles(
    const std::string &order_text, const std::vector<SubpageBtn> &buttons,
    const std::vector<bool> &occupied, const std::vector<CompanionAction> &folders,
    size_t capacity, const std::string &open_behavior) {
  FinderFolderTilePlan plan;
  auto order = split_subpage_fields(order_text, ',');
  if (order.size() < occupied.size()) order.resize(occupied.size());
  // Retain the existing record-size limit for a page that is represented as
  // compact text at the compatibility boundary.
  size_t saved_size = order.empty() ? 1 : order.size();
  for (const auto &token : order) saved_size += token.size();
  for (const auto &button : buttons) saved_size += finder_folder_card_record(button).size();
  auto contains = [](const auto &cards, const std::string &entity) {
    return std::any_of(cards.begin(), cards.end(), [&](const auto &card) { return card.entity == entity; });
  };
  const std::string options = open_behavior == "same_window"
    ? "finder_open_behavior=same_window" : "finder_open_behavior=new_window";
  for (const auto &folder : folders) {
    if (folder.id.rfind("folder.", 0) != 0 || folder.id.size() <= 7 ||
        contains(buttons, folder.id) || contains(plan.added, folder.id)) continue;
    size_t position = 0;
    while (position < occupied.size() &&
           (occupied[position] || !order[position].empty())) ++position;
    if (position == occupied.size()) break;
    SubpageBtn card{folder.id, folder.label, "Folder Outline", "Auto", "", "", "companion", "", options};
    auto token = std::to_string(buttons.size() + plan.added.size() + 1);
    const size_t added_size = token.size() + finder_folder_card_record(card).size();
    if (saved_size + added_size > capacity) continue;
    saved_size += added_size;
    order[position] = std::move(token);
    plan.added.push_back(std::move(card));
  }
  if (!plan.added.empty()) {
    for (size_t index = 0; index < order.size(); ++index) {
      if (index) plan.order += ',';
      plan.order += order[index];
    }
  }
  return plan;
}

inline std::string finder_append_folder_tiles(
    const std::string &config, const std::vector<bool> &occupied,
    const std::vector<CompanionAction> &folders, size_t capacity = 65535,
    const std::string &open_behavior = "new_window") {
  const auto buttons = parse_subpage_config(config);
  const auto plan = finder_plan_folder_tiles(get_subpage_order(config), buttons, occupied, folders, capacity, open_behavior);
  if (plan.added.empty()) return config;
  std::string result = "~" + plan.order;
  for (const auto &button : buttons) result += finder_folder_card_record(button);
  for (const auto &button : plan.added) result += finder_folder_card_record(button);
  return result;
}

inline FinderFolderTilePlan finder_plan_folder_tiles_for_grid(
    const std::string &order_text, const std::vector<SubpageBtn> &buttons, int slots, int columns,
    const std::vector<CompanionAction> &folders, size_t capacity, const std::string &behavior) {
  SubpageOrder order;
  parse_subpage_order(order_text, slots, buttons.size(), order);
  if (!order.has_back_token) return {};
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
  return finder_plan_folder_tiles(order_text, buttons, occupied, folders, capacity, behavior);
}
