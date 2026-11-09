#pragma once

#include "page_store.h"

// Internal to the grid renderer. Include after the subpage card definitions.
// Keep the existing renderer's normalization while taking field values
// directly from the active native page instead of round-tripping through text.
inline std::vector<SubpageBtn> native_subpage_buttons(
    const espdesktop::pages::PageStore &store, const espdesktop::pages::PageDefinition &page) {
  using espdesktop::pages::CardField;
  std::vector<SubpageBtn> buttons;
  buttons.reserve(page.card_count);
  for (size_t i = 0; i < page.card_count; ++i) {
    const auto &card = *store.card(page.first_card + i);
    auto field = [&](CardField name) { return std::string(store.field(card, name)); };
    auto icon = field(CardField::ICON);
    auto icon_on = field(CardField::ICON_ON);
    buttons.push_back(normalize_subpage_btn({
        field(CardField::ENTITY), field(CardField::LABEL),
        icon.empty() ? "Auto" : std::move(icon), icon_on.empty() ? "Auto" : std::move(icon_on),
        field(CardField::SENSOR), field(CardField::UNIT), compact_subpage_type(field(CardField::TYPE)),
        field(CardField::PRECISION), field(CardField::OPTIONS)}));
  }
  return buttons;
}
