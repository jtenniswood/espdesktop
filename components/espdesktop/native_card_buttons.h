#pragma once

#ifdef USE_ESPDESKTOP_NATIVE_CARD_BUTTONS
#include <array>
#include <cstring>
#include <memory>
#include "esphome/components/api/api_server.h"
#include "esphome/components/button/button.h"
#include "esphome/core/entity_base.h"
#include "native_api_setting.h"
#include "device_ui_limits.h"

namespace espdesktop::home_assistant {

inline constexpr std::string_view NATIVE_CARD_NAME_SEPARATOR = " · ";
inline constexpr size_t NATIVE_CARD_NAME_ID_LENGTH = 8;

inline bool is_native_card_web_press(std::string_view path) {
  constexpr std::string_view prefix = "/button/";
  constexpr std::string_view action = "/press";
  constexpr size_t suffix_length = NATIVE_CARD_NAME_SEPARATOR.size() + NATIVE_CARD_NAME_ID_LENGTH;
  if (!path.starts_with(prefix) || !path.ends_with(action) ||
      path.size() < prefix.size() + suffix_length + action.size()) return false;
  const auto suffix = path.substr(path.size() - action.size() - suffix_length, suffix_length);
  return suffix.starts_with(NATIVE_CARD_NAME_SEPARATOR) &&
      std::all_of(suffix.begin() + NATIVE_CARD_NAME_SEPARATOR.size(), suffix.end(), [](char ch) {
        return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
      });
}

inline std::string native_card_label(const ParsedCfg &config, const CompanionRuntimeSnapshot &mac) {
  if (!config.label.empty()) return config.label;
  if (config.type == "subpage") return "Folder";
  auto label = companion_default_action_label(config.entity, config.sensor, &mac);
  if (label.empty() || label == config.entity) {
    if (config.entity.rfind("folder.", 0) == 0) return "File Folder";
    if (config.type == "companion_mac_lock") return "Lock Machine";
    return "Companion action";
  }
  return label;
}

inline std::string native_card_name(const SharedCard &card, const pages::PageStore &store,
                                    const CompanionRuntimeSnapshot &mac) {
  auto name = native_card_label(card.config, mac);
  const auto &entity = card.config.entity;
  const bool opens_folder = entity.rfind("folder.", 0) == 0;
  const bool opens_app = card.config.type == "companion" && entity.find('.') != std::string::npos &&
      entity.rfind("shortcut.", 0) != 0 && companion_encoded_url(card.config.sensor).empty();
  if (card.config.type == "subpage" || opens_folder || opens_app) name += " – Open";

  for (auto page_id = card.page; page_id != 0;) {
    const auto *page = store.page(page_id);
    if (!page) break;
    const auto *owner = store.card(page->owner);
    if (!owner || page->parent == pages::NO_PAGE) break;
    auto label = native_card_label(grid_saved_card_config(store, *owner), mac);
    name.insert(0, label + " – ");
    page_id = page->parent;
  }

  // Leave room for the ID suffix and preserve the last complete UTF-8 character.
  constexpr size_t max_label = esphome::ESPHOME_FRIENDLY_NAME_MAX_LEN -
      NATIVE_CARD_NAME_SEPARATOR.size() - NATIVE_CARD_NAME_ID_LENGTH;
  if (name.size() > max_label) {
    size_t length = max_label;
    while ((static_cast<unsigned char>(name[length]) & 0xc0) == 0x80) --length;
    name.resize(length);
  }
  name += NATIVE_CARD_NAME_SEPARATOR;
  name.append(card.id, 0, NATIVE_CARD_NAME_ID_LENGTH);
  return name;
}

// The active-screen text sensor is intentionally shared with Home Assistant;
// every other panel entity stays local to the display's web interface.
inline bool native_api_entity_exposed(esphome::EntityBase *entity) {
  if (entity == nullptr) return false;
  std::array<char, esphome::OBJECT_ID_MAX_LEN> buffer{};
  const auto object_id = entity->get_object_id_to(buffer);
  constexpr char active_screen[] = "active_screen";
  return object_id.size() == sizeof(active_screen) - 1 &&
         std::memcmp(object_id.c_str(), active_screen, sizeof(active_screen) - 1) == 0;
}

class NativeCardButton final : public esphome::button::Button {
 public:
  void configure(std::string id, std::string name, uint32_t key) {
    id_ = std::move(id);
    name_storage_ = std::move(name);
    configure_entity_(name_storage_.c_str(), key,
                      id_.empty() ? (1U << esphome::ENTITY_FIELD_INTERNAL_SHIFT) : 0);
  }

 protected:
  void press_action() override {
    if (native_api_actions_available() && !id_.empty()) press_card(id_);
  }

 private:
  std::string id_;
  std::string name_storage_;
};

static_assert(ESPDESKTOP_NATIVE_CARD_BUTTON_CAPACITY == espdesktop::DEVICE_UI_LIMITS.max_cards());

class NativeCardButtons {
 public:
  void setup(const esphome::EntityBase *display_power) {
    // The panel editor includes internal entities. Keep the existing
    // editor and diagnostic controls local to the display's web interface.
#define ENTITY_TYPE_(type, singular, plural, count, upper) \
    for (auto *entity : esphome::App.get_##plural()) \
      if (!native_api_entity_exposed(entity) && entity != display_power) entity->set_internal(true);
#define ENTITY_CONTROLLER_TYPE_(type, singular, plural, count, upper, callback) \
    ENTITY_TYPE_(type, singular, plural, count, upper)
#include "esphome/core/entity_types.h"
#undef ENTITY_CONTROLLER_TYPE_
#undef ENTITY_TYPE_
  }

  void refresh() {
    const auto *store = grid_native_page_store();
    auto *server = esphome::api::global_api_server;
    if (!store || !server || hooks().fingerprint.empty()) return;
    const bool authorized = native_api_actions_available();
    const auto catalogue = authorized ? companion_runtime_service().action_catalogue_generation() : 0;
    const bool resync = native_button_resync_requested.exchange(false) && authorized;
    if (!resync && refreshed_ && generation_ == store->generation() && authorized == authorized_ &&
        catalogue == catalogue_generation_) return;
    refreshed_ = true;
    generation_ = store->generation();
    authorized_ = authorized;
    catalogue_generation_ = catalogue;

    std::vector<Entry> entries;
    if (authorized) {
      const auto mac = companion_runtime_snapshot();
      for (const auto &card : shared_cards()) {
        const auto key = esphome::fnv1a_hash(card.id);
        if (!key || std::any_of(esphome::App.get_buttons().begin(), esphome::App.get_buttons().end(),
                               [&](const auto *button) {
                                 return !is_card(button) && button->get_object_id_hash() == key;
                               })) continue;
        entries.push_back({card.id, native_card_name(card, *store, mac), key});
      }
      std::sort(entries.begin(), entries.end(), [](const auto &a, const auto &b) { return a.key < b.key; });
      for (size_t i = 0; i < entries.size();) {
        size_t end = i + 1;
        while (end < entries.size() && entries[end].key == entries[i].key) ++end;
        if (end == i + 1) ++i;
        else entries.erase(entries.begin() + i, entries.begin() + end);
      }
    }
    if (!resync && entries == entries_) return;
    // Clients list entities on connection. Close the old sessions before
    // replacing their snapshot so Home Assistant can request the new list.
    for (const auto &client : server->active_clients()) client->on_fatal_error();
    if (entries == entries_) return;
    size_t index = 0;
    for (const auto &entry : entries) {
      if (index >= buttons_.size()) {
        auto button = std::make_unique<NativeCardButton>();
        button->configure(entry.id, entry.name, entry.key);
        esphome::App.register_button(button.get());
        buttons_.push_back(std::move(button));
      } else {
        buttons_[index]->configure(entry.id, entry.name, entry.key);
      }
      ++index;
    }
    for (; index < buttons_.size(); ++index)
      buttons_[index]->configure({}, "Unassigned EspDesktop card", 0);
    entries_ = std::move(entries);
  }

  bool is_card(const esphome::button::Button *button) const {
    return std::any_of(buttons_.begin(), buttons_.end(),
                       [&](const auto &entry) { return entry.get() == button; });
  }

 private:
  struct Entry {
    std::string id;
    std::string name;
    uint32_t key;
    bool operator==(const Entry &) const = default;
  };
  // Keep registered addresses stable and only allocate as the layout grows.
  std::vector<std::unique_ptr<NativeCardButton>> buttons_;
  std::vector<Entry> entries_;
  uint32_t generation_{0};
  uint32_t catalogue_generation_{0};
  bool refreshed_{false};
  bool authorized_{false};
};

inline NativeCardButtons &native_buttons() {
  static NativeCardButtons buttons;
  return buttons;
}

}  // namespace espdesktop::home_assistant
#endif
