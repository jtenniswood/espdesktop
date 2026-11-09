#pragma once

#include <string>
#include <vector>

namespace espdesktop {
// Editor paths are independent of the identities retained in the saved document.
struct GridNativePage {
  int key{0};
  int parent{0};
  int owner_slot{0};
  std::string owner_config;
  std::string config;
};
struct GridNativePages {
  std::vector<GridNativePage> pages;
};
inline const GridNativePages *&grid_native_pages() {
  static const GridNativePages *pages = nullptr;
  return pages;
}
inline const GridNativePage *grid_native_page(int key) {
  const auto *snapshot = grid_native_pages();
  if (snapshot)
    for (const auto &page : snapshot->pages)
      if (page.key == key) return &page;
  return nullptr;
}
} // namespace espdesktop
