#pragma once
#include <string_view>

namespace espdesktop {
inline bool page_card_owns_subpage(std::string_view type, std::string_view sensor,
                                  std::string_view options) {
  if (type == "subpage") return true;
  if (type != "companion" || !sensor.empty()) return false;
  while (!options.empty()) {
    const auto end = options.find(',');
    if (options.substr(0, end) == "app_shortcuts") return true;
    if (end == std::string_view::npos) break;
    options.remove_prefix(end + 1);
  }
  return false;
}
} // namespace espdesktop
