#pragma once

#ifdef USE_ESPDESKTOP_NATIVE_CARD_BUTTONS
#include "esphome/components/api/api_server.h"
#include "esphome/components/button/button.h"

namespace espdesktop::home_assistant {

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
    auto *server = esphome::api::global_api_server;
    if (server && server->get_noise_ctx().has_psk() && !id_.empty())
      press_card(id_);
  }

 private:
  std::string id_;
  std::string name_storage_;
};

class NativeCardButtons {
 public:
  void setup() {
    for (size_t i = 0; i < buttons_.size(); ++i) {
      buttons_[i].configure({}, "Unassigned EspDesktop card", 0);
      esphome::App.register_button(&buttons_[i]);
    }
  }

  void refresh() {
    const auto *store = grid_native_page_store();
    auto *server = esphome::api::global_api_server;
    if (!store || !server || hooks().fingerprint.empty()) return;
    const bool authorized = server->get_noise_ctx().has_psk();
    if (refreshed_ && generation_ == store->generation() && authorized == authorized_) return;
    refreshed_ = true;
    generation_ = store->generation();
    authorized_ = authorized;

    std::vector<Entry> entries;
    if (authorized) {
      const auto mac = companion_runtime_snapshot();
      for (const auto &card : shared_cards()) {
        const auto key = esphome::fnv1a_hash(card.id);
        if (!key || std::any_of(esphome::App.get_buttons().begin(), esphome::App.get_buttons().end(),
                               [&](const auto *button) {
                                 return !is_card(button) && button->get_object_id_hash() == key;
                               })) continue;
        auto name = card.config.label.empty()
            ? (card.config.type == "subpage" ? "Subpage" :
               companion_default_action_label(card.config.entity, card.config.sensor, &mac))
            : card.config.label;
        // Native Home Assistant identities include the entity name. The
        // card suffix distinguishes duplicates and same-name replacements.
        name += " · " + card.id.substr(0, 8);
        entries.push_back({card.id, std::move(name), key});
      }
      std::sort(entries.begin(), entries.end(), [](const auto &a, const auto &b) { return a.key < b.key; });
      for (size_t i = 0; i < entries.size();) {
        size_t end = i + 1;
        while (end < entries.size() && entries[end].key == entries[i].key) ++end;
        if (end == i + 1) ++i;
        else entries.erase(entries.begin() + i, entries.begin() + end);
      }
    }
    if (entries == entries_) return;
    // Clients list entities on connection. Close the old sessions before
    // replacing their snapshot so Home Assistant can request the new list.
    for (const auto &client : server->active_clients()) client->on_fatal_error();
    size_t index = 0;
    for (const auto &entry : entries) {
      if (index == buttons_.size()) break;
      buttons_[index++].configure(entry.id, entry.name, entry.key);
    }
    for (; index < buttons_.size(); ++index)
      buttons_[index].configure({}, "Unassigned EspDesktop card", 0);
    entries_ = std::move(entries);
  }

  bool is_card(const esphome::button::Button *button) const {
    return std::any_of(buttons_.begin(), buttons_.end(),
                       [&](const auto &entry) { return &entry == button; });
  }

 private:
  struct Entry {
    std::string id;
    std::string name;
    uint32_t key;
    bool operator==(const Entry &) const = default;
  };
  std::array<NativeCardButton, ESPDESKTOP_NATIVE_CARD_BUTTON_CAPACITY> buttons_;
  std::vector<Entry> entries_;
  uint32_t generation_{0};
  bool refreshed_{false};
  bool authorized_{false};
};

inline NativeCardButtons &native_buttons() {
  static NativeCardButtons buttons;
  return buttons;
}

}  // namespace espdesktop::home_assistant
#endif
