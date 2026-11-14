#pragma once

#include "home_assistant_cards.h"
#include "device_reset.h"

namespace espdesktop::home_assistant {

struct SharedCard {
  ParsedCfg config;
  std::string id;
  std::string focus;
  int target{0};
};

inline std::vector<SharedCard> shared_cards() {
  std::vector<SharedCard> cards;
  const auto *layout = grid_native_pages();
  if (!layout || !layout->store || hooks().fingerprint.size() != 64) return cards;
  const auto &store = *layout->store;
  for (pages::PageId page_id = 0; page_id < store.page_count(); ++page_id) {
    const auto &page = *store.page(page_id);
    for (const auto index : page.runtime_cards()) {
      const auto &record = *store.card(index);
      auto config = grid_saved_card_config(store, record);
      auto id = cfg_option_value(config.options, "ha_id");
      if (!valid_home_assistant_card_id(id) || id.compare(0, 64, hooks().fingerprint) != 0 || !cfg_option_token_present(config.options, "ha_exposed")) continue;
      const auto target = std::find_if(layout->pages.begin(), layout->pages.end(),
          [&](const GridNativePage &entry) { return entry.id == record.target; });
      const int key = target == layout->pages.end() ? 0 : target->key;
      const bool mac = config.type == "companion" || config.type == "companion_mac_lock";
      if (config.type == "subpage" ? !key :
          !mac || companion_metric_key_valid(config.entity) ||
          (config.entity.empty() && companion_encoded_url(config.sensor).empty())) continue;
      std::string focus;
      if (page_id && config.entity.rfind("shortcut.", 0) == 0) {
        const auto owner = grid_saved_card_config(store, *store.card(page.owner));
        if (companion_app_shortcuts_enabled(owner)) focus = owner.entity;
      }
      if (page_id && config.entity.rfind("folder.", 0) == 0 &&
          cfg_option_value(config.options, "finder_open_behavior").empty()) {
        const auto owner = grid_saved_card_config(store, *store.card(page.owner));
        if (companion_folder_open_behavior(owner) == "same_window")
          config.options += ",finder_open_behavior=same_window";
      }
      cards.push_back({std::move(config), id.substr(64), std::move(focus), key});
    }
  }
  // A malformed imported layout must never send a press to an ambiguous card.
  std::sort(cards.begin(), cards.end(), [](const auto &a, const auto &b) { return a.id < b.id; });
  for (size_t i = 0; i < cards.size();) {
    size_t end = i + 1;
    while (end < cards.size() && cards[i].id == cards[end].id) ++end;
    if (end == i + 1) ++i;
    else cards.erase(cards.begin() + i, cards.begin() + end);
  }
  return cards;
}

inline bool card_available(const SharedCard &card, const CompanionRuntimeSnapshot &mac) {
  if (screen_lock_enabled() || reset::pending()) return false;
  if (card.config.type == "subpage") return card.target && navigation_allows_companion_focus();
  if (!mac.connected || (!card.focus.empty() && !companion_action_focused(mac, card.focus))) return false;
  return !companion_encoded_url(card.config.sensor).empty() ||
      companion_action_available(mac, card.config.entity);
}

inline std::string list_cards() {
  const auto mac = companion_runtime_snapshot();
  std::string output = "{\"cards\":[";
  bool first = true;
  for (const auto &card : shared_cards()) {
    if (!first) output += ',';
    first = false;
    const auto name = card.config.label.empty()
        ? (card.config.type == "subpage" ? "Subpage" :
           companion_default_action_label(card.config.entity, card.config.sensor, &mac))
        : card.config.label;
    output += "{\"id\":\"" + card.id + "\",\"name\":\"" + companion_json_escape(name) +
        "\",\"available\":" + (card_available(card, mac) ? "true}" : "false}");
  }
  return output + "]}";
}

inline bool press_card(const std::string &id) {
  for (const auto &card : shared_cards()) {
    if (id != card.id) continue;
    if (!card_available(card, companion_runtime_snapshot())) return false;
    if (card.config.type == "subpage") return navigation_present_companion_subpage(card.target);
    char request[24];
    snprintf(request, sizeof(request), "ha-%08lx",
             static_cast<unsigned long>(companion_next_request_number()));
    return espdesktop::cards::invoke_saved_companion_card(card.config, request, card.focus);
  }
  return false;
}

}  // namespace espdesktop::home_assistant
