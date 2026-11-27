#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "page_store.h"
#include "panel_settings_generated.h"

namespace espdesktop {
// Editor paths are independent of the identities retained in the saved document.
struct GridNativePage {
  int key{0};
  int parent{0};
  int owner_slot{0};
  pages::PageId id{pages::NO_PAGE};
};
struct GridNativePages {
  const pages::PageStore *store{nullptr};
  std::vector<GridNativePage> pages;
  // Borrowed from the active snapshot; null when the configuration predates
  // the native settings document.
  const std::optional<std::string_view> *scalar_values{nullptr};
  size_t scalar_count{0};
};
inline const GridNativePages *&grid_native_pages() {
  static const GridNativePages *pages = nullptr;
  return pages;
}
inline const pages::PageStore *grid_native_page_store() {
  const auto *snapshot = grid_native_pages();
  return snapshot ? snapshot->store : nullptr;
}
inline const GridNativePage *grid_native_page(int key) {
  const auto *snapshot = grid_native_pages();
  if (snapshot)
    for (const auto &page : snapshot->pages)
      if (page.key == key) return &page;
  return nullptr;
}
// The active native setting value, or its documented default when unset.
inline std::string grid_native_scalar(std::string_view key) {
  const auto *snapshot = grid_native_pages();
  if (!snapshot || !snapshot->scalar_values) return {};
  const size_t index = panel_settings::scalar_setting_index(key);
  if (index >= snapshot->scalar_count) return {};
  const auto &value = snapshot->scalar_values[index];
  return value ? std::string(*value)
               : std::string(panel_settings::SCALAR_RULES[index].default_value);
}
} // namespace espdesktop
