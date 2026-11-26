#pragma once

#include "companion_capabilities_generated.h"
#include "companion_shortcut_page.h"

inline bool is_live_finder_folder(std::string_view id) {
  constexpr std::string_view prefix = "folder.";
  return id.size() > prefix.size() && id.substr(0, prefix.size()) == prefix;
}

inline constexpr const char *finder_folder_default_icon() {
  for (const auto &mode : COMPANION_CARD_MODES)
    if (std::string_view(mode.id) == "folder") return mode.default_icon;
  return "Monitor";
}

// The live catalogue has no ownership of the saved grid. Projection only
// fills unoccupied cells in the renderer's local copy.
inline bool live_companion_catalogue_equal(const CompanionActionList &left,
                                         const CompanionActionList &right) {
  return left.size() == right.size() &&
      std::equal(left.begin(), left.end(), right.begin(), [](const auto &a, const auto &b) {
        return a.id == b.id && a.label == b.label && a.shortcut_color == b.shortcut_color;
      });
}

inline std::optional<uint32_t> apple_shortcut_catalogue_color(
    const CompanionActionList &actions, std::string_view id) {
  if (!companion_apple_shortcut_action(id)) return std::nullopt;
  const auto action = std::find_if(actions.begin(), actions.end(), [id](const auto &item) {
    return item.id == id;
  });
  return action != actions.end() ? action->shortcut_color : std::nullopt;
}

inline std::string generated_card_key(const std::string &id) {
  auto key = id.substr(id.rfind('.') + 1);
  key.erase(std::remove(key.begin(), key.end(), '-'), key.end());
  return key;
}

inline std::array<bool, MAX_GRID_SLOTS> live_page_occupied_cells(const SubpageOrder &order, int slots, int columns) {
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

  return occupied;
}

template<typename Accept>
inline void project_live_folder_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                     int slots, int columns, int capacity,
                                     const CompanionActionList &entries,
                                     const char *icon, const std::string &options, Accept accept,
                                     const char *type = "companion",
                                     const std::string &exclusions = {}) {
  if (!order.has_back_token) return;
  const auto occupied = live_page_occupied_cells(order, slots, columns);
  const auto excluded = split_config_fields(exclusions, '|');
  int position = 0;
  for (const auto &folder : entries) {
    while (position < slots && occupied[position]) ++position;
    if (position == slots || buttons.size() >= size_t(capacity)) return;
    if (!accept(folder.id)) continue;
    if (!exclusions.empty() &&
        std::find(excluded.begin(), excluded.end(), generated_card_key(folder.id)) != excluded.end()) continue;
    const bool placed = std::any_of(order.positions, order.positions + slots, [&](int index) {
      return index > 0 && buttons[index - 1].entity == folder.id;
    });
    if (placed) continue;
    buttons.push_back({folder.id, folder.label, icon, "Auto", "", "", type, "", options});
    order.positions[position++] = static_cast<int>(buttons.size());
  }
}

inline void finder_project_folder_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                       int slots, int columns, int capacity,
                                       const CompanionActionList &folders,
                                       const std::string &open_behavior, const std::string &exclusions = {}) {
  project_live_folder_tiles(order, buttons, slots, columns, capacity, folders,
      finder_folder_default_icon(), "finder_open_behavior=" + open_behavior, is_live_finder_folder, "companion", exclusions);
}

inline void project_apple_shortcut_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                         int slots, int columns, int capacity,
                                         const CompanionActionList &actions,
                                         std::string_view hidden) {
  if (!order.has_back_token) return;
  const auto occupied = live_page_occupied_cells(order, slots, columns);
  const int cell_limit = std::min(slots, capacity);
  constexpr std::string_view prefix = "appleshortcut.";
  int position = 0;
  for (const auto &action : actions) {
    while (position < cell_limit && occupied[position]) ++position;
    if (position == cell_limit) return;
    if (!companion_apple_shortcut_action(action.id) || action.id.size() <= prefix.size()) continue;
    if (companion_apple_shortcut_hidden(std::string_view(action.id).substr(prefix.size()), hidden)) continue;
    const auto end = order.positions + slots;
    if (std::any_of(order.positions, end, [&](int index) {
          return index > 0 && buttons[index - 1].entity == action.id;
        })) continue;
    size_t index = 0;
    while (index < buttons.size() && std::find(order.positions, end, int(index + 1)) != end) ++index;
    if (index >= MAX_GRID_SLOTS) return;
    SubpageBtn tile{action.id, action.label, "Flash", "Auto", "", "", "companion", "", ""};
    if (index == buttons.size()) buttons.push_back(std::move(tile));
    else buttons[index] = std::move(tile);
    order.row_span[index] = order.col_span[index] = 1;
    order.positions[position++] = static_cast<int>(index + 1);
  }
}
