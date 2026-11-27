#pragma once

#include "home_assistant_cards.h"
#include "device_reset.h"
#include "external_memory_allocator.h"
#include "native_api_setting.h"
#ifdef USE_COMPANION
#include <mbedtls/sha256.h>
#endif

namespace espdesktop::home_assistant {

struct SharedCard {
  ParsedCfg config;
  std::string id;
  std::string focus;
  int target{0};
  pages::PageId page{0};
};

// Cards that predate Home Assistant have no saved sharing ID. Key them by
// their saved location and action so a later edit cannot redirect an old press.
inline std::string automatic_card_id(int page, int slot, const ParsedCfg &config,
                                     const std::string &focus) {
#ifdef USE_COMPANION
  std::string identity = std::to_string(page) + "/" + std::to_string(slot);
  for (const auto &field : {config.type, config.entity, config.sensor, focus,
                            cfg_option_value(config.options, "app_shortcut_preset"),
                            companion_folder_open_behavior(config),
                            cfg_option_value(config.options, "url_open_behavior")}) {
    identity += "/" + std::to_string(field.size()) + ":" + field;
  }
  uint8_t digest[32]{};
  if (mbedtls_sha256(reinterpret_cast<const unsigned char *>(identity.data()),
                    identity.size(), digest, 0) != 0) return {};
  constexpr char hex[] = "0123456789abcdef";
  std::string id;
  id.reserve(32);
  for (size_t i = 0; i < 16; ++i) {
    id += hex[digest[i] >> 4];
    id += hex[digest[i] & 15];
  }
  return id;
#else
  return {};
#endif
}

inline std::vector<SharedCard, EspDesktopExternalAllocator<SharedCard>> shared_cards() {
  // Layouts with many nested cards can exceed the largest free internal heap block.
  std::vector<SharedCard, EspDesktopExternalAllocator<SharedCard>> cards;
  const auto *layout = grid_native_pages();
  if (!layout || !layout->store || hooks().fingerprint.size() != 64) return cards;
  const auto &store = *layout->store;
  for (pages::PageId page_id = 0; page_id < store.page_count(); ++page_id) {
    const auto &page = *store.page(page_id);
    for (const auto index : page.runtime_cards()) {
      const auto &record = *store.card(index);
      auto config = grid_saved_card_config(store, record);
      if (card_runtime_type_retired(config.type) || retired_home_assistant_card(config)) continue;
      const auto saved_id = cfg_option_value(config.options, "ha_id");
      const auto target = std::find_if(layout->pages.begin(), layout->pages.end(),
          [&](const GridNativePage &entry) { return entry.id == record.target; });
      const int key = target == layout->pages.end() ? 0 : target->key;
      const bool mac = config.type == "companion" || config.type == "companion_mac_lock";
      const bool mute = config.type == "slider" && companion_mute_control_valid(config.entity);
      const bool remote_action = mac && !companion_metric_key_valid(config.entity) &&
          !companion_obs_status_card(config.entity) && !companion_obs_tokenized_card(config.entity) &&
          (!config.entity.empty() || !companion_encoded_url(config.sensor).empty());
      if (config.type == "subpage" ? !key : !remote_action && !mute) continue;
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
      const auto page_entry = std::find_if(layout->pages.begin(), layout->pages.end(),
          [&](const GridNativePage &entry) { return entry.id == page_id; });
      if (page_id && page_entry == layout->pages.end()) continue;
      const bool has_saved_id = valid_home_assistant_card_id(saved_id) &&
          saved_id.compare(0, 64, hooks().fingerprint) == 0;
      auto id = has_saved_id ? saved_id.substr(64) :
          automatic_card_id(page_id ? page_entry->key : 0, record.slot, config, focus);
      if (!id.empty()) cards.push_back({std::move(config), std::move(id), std::move(focus), key, page_id});
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
  if (!mac.connected) return false;
  if (card.config.type == "slider") return true;
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

inline std::string shortcut_application(const SharedCard &card) {
  if (!companion_encoded_url(card.config.sensor).empty() ||
      !companion_shortcut_action_valid(card.config.entity)) return {};
  const auto preset = cfg_option_value(card.config.options, "app_shortcut_preset");
  if (auto app = companion_shortcut_preset_app(preset); !app.empty()) return app;
  if (!card.page) return {};
  if (!card.focus.empty()) return card.focus;

  const auto *store = grid_native_page_store();
  if (!store) return {};
  for (auto page_id = card.page; page_id != 0;) {
    const auto *page = store->page(page_id);
    if (!page || page->parent == pages::NO_PAGE) break;
    const auto *owner = store->card(page->owner);
    if (!owner) break;
    const auto config = grid_saved_card_config(*store, *owner);
    if (config.entity.rfind("folder.", 0) == 0) return "com.apple.finder";
    if (companion_app_launch_card(config)) return config.entity;
    page_id = page->parent;
  }
  return {};
}

inline bool press_app_shortcut(const SharedCard &card, const std::string &app,
                                const std::string &request) {
  const auto shortcut = companion_app_scoped_shortcut(card.config.entity);
  const auto target = companion_shortcut_launch_target(app);
  if (shortcut.empty() || target.empty() || !companion_action_sender()) return false;
  return companion_activate_then(target, request, esphome::millis() + 10000,
      [id = card.id, app, target, shortcut, request] {
#ifdef USE_ESPDESKTOP_NATIVE_CARD_BUTTONS
        if (!native_api_enabled.load()) return;
#endif
        const auto mac = companion_runtime_snapshot();
        for (const auto &current : shared_cards()) {
          if (current.id != id) continue;
          if (card_available(current, mac) && shortcut_application(current) == app &&
              companion_app_scoped_shortcut(current.config.entity) == shortcut &&
              companion_action_sender())
            companion_action_sender()(shortcut, request + "-keys", "new_window", target);
          return;
        }
      });
}

inline bool press_card(const std::string &id) {
  for (const auto &card : shared_cards()) {
    if (id != card.id) continue;
    if (!card_available(card, companion_runtime_snapshot())) return false;
    if (card.config.type == "subpage") return navigation_present_companion_subpage(card.target);
    if (card.config.type == "slider") return companion_toggle_mute(card.config.entity);
    char request[24];
    snprintf(request, sizeof(request), "ha-%08lx",
             static_cast<unsigned long>(companion_next_request_number()));
    if (const auto app = shortcut_application(card); !app.empty())
      return press_app_shortcut(card, app, request);
    return espdesktop::cards::invoke_saved_companion_card(card.config, request, card.focus);
  }
  return false;
}

}  // namespace espdesktop::home_assistant
