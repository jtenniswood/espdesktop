#pragma once

// Included after the card/subpage parsers. Occupancy comes from the same layout
// calculation used by the display, including large cards and the Back button.
inline std::string finder_append_folder_tiles(
    const std::string &config, const std::vector<bool> &occupied,
    const std::vector<CompanionAction> &folders, size_t capacity = 65535) {
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
    buttons.push_back({folder.id, folder.label, "Folder Outline", "Auto", "", "", "companion", "", ""});
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
