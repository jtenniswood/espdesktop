#pragma once

#include "button_grid_config_parser.h"
#include "grid_native_pages.h"

inline ParsedCfg grid_layout_card_config(int slot, const std::string &legacy_config) {
  const auto *store = espdesktop::grid_native_page_store();
  if (!store) return parse_cfg(legacy_config);
  const espdesktop::pages::CardDefinition *card = nullptr;
  if (slot > 0 && slot <= 32) {
    const auto *root = store->page(0);
    if (root && slot <= root->card_count) card = store->card(root->first_card + slot - 1);
  } else if (const auto *entry = espdesktop::grid_native_page(slot)) {
    if (const auto *page = store->page(entry->id)) card = store->card(page->owner);
  }
  if (!card) return {};
  using espdesktop::pages::CardField;
  auto field = [&](CardField key) { return std::string(store->field(*card, key)); };
  // PageStore applies the same card normalization when it loads a document.
  return {field(CardField::ENTITY), field(CardField::LABEL), field(CardField::ICON),
          field(CardField::ICON_ON), field(CardField::SENSOR), field(CardField::UNIT),
          field(CardField::TYPE), field(CardField::PRECISION), field(CardField::OPTIONS)};
}

inline std::string grid_layout_root_order(const std::string &legacy_order) {
  const auto *store = espdesktop::grid_native_page_store();
  if (!store) return legacy_order;
  const auto *root = store->page(0);
  return root ? std::string(store->string(root->order)) : std::string{};
}
