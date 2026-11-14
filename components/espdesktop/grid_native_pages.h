#pragma once

#include <vector>

#include "page_store.h"

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
} // namespace espdesktop
