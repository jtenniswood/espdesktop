#pragma once

#include <array>
#include <functional>
#include <optional>
#include <memory>
#include <string>
#include <vector>

#include "application_scene_runtime.h"
#include "grid_native_pages.h"
#include "page_store_runtime.h"
#include "panel_config_text_bindings.h"
#include "panel_config_representation.h"

namespace espdesktop {
// Retain EspDesktop's existing card drivers (including Companion). Only page
// definitions change: one prepared native graph feeds the established renderer.
class GridPageRuntime final : public ApplicationSceneRuntime {
  using Store = pages::PageStore;
  using Field = pages::CardField;
  struct Snapshot : GridNativePages {
    Snapshot(configuration::ConfigurationBuffer::Allocate allocate, configuration::ConfigurationBuffer::Release release) : storage(allocate, release) {}
    configuration::ConfigurationBuffer storage;
    struct Value {
      configuration::PanelConfigRecordType type;
      uint8_t slot;
      std::string key, value;
    };
    std::vector<Value> values;
    configuration::PanelConfigRecord *records{nullptr};
    size_t record_count{0};
    std::optional<bool> app_subpage_preference;
  };
  class Resources final : public pages::PageRuntimeResources {
  public:
    explicit Resources(GridPageRuntime &owner) : owner_(owner) {}
    bool prepare(const Store &store) override { return owner_.prepare_snapshot(store); }
    bool preparation_capacity_exceeded() const override { return owner_.capacity_exceeded_; }
    void discard_prepared() override { owner_.staged_.reset(); }
    void activate_prepared(const Store &store) override { owner_.activate_snapshot(store); }
    void retire_active() override { owner_.retire_snapshot(); }
  private:
    GridPageRuntime &owner_;
  };
  class Allocator final : public pages::PageArenaAllocator {
  public:
    Allocator(configuration::ConfigurationBuffer::Allocate allocate,
              configuration::ConfigurationBuffer::Release release)
        : allocate_(allocate), release_(release) {}
    void *allocate(size_t bytes) override {
      auto *value = allocate_(bytes);
      if (!value) ++failures_;
      return value;
    }
    size_t allocation_failure_count() const override { return failures_; }
    void release(void *value, size_t) override { release_(static_cast<uint8_t *>(value)); }
  private:
    configuration::ConfigurationBuffer::Allocate allocate_;
    configuration::ConfigurationBuffer::Release release_;
    size_t failures_{0};
  };
public:
  GridPageRuntime(const DeviceUiLimits &limits,
      configuration::PanelConfigTextBindings &bindings,
      configuration::ConfigurationBuffer::Allocate allocate,
      configuration::ConfigurationBuffer::Release release,
      std::function<void(bool)> publish_app_subpage_preference = {})
      : limits_(limits), bindings_(bindings), allocate_(allocate), release_(release),
        publish_app_subpage_preference_(std::move(publish_app_subpage_preference)),
        allocator_(allocate, release), resources_(*this), runtime_(limits_, allocator_, limits.page_store_bytes, &resources_) {}
  bool ready() const override { return bindings_.configured() && !stopped_; }
  bool maintenance_ready() const override { return ready(); }
  void loop() override {}
  void stop() override { stopped_ = true; grid_native_pages() = nullptr; }
  bool prepare(uint16_t version, const uint8_t *data, size_t size) override {
    allocation_failed_ = false; capacity_exceeded_ = false;
    return !stopped_ && runtime_.prepare(version, data, size);
  }
  bool prepare_write(uint16_t version, const uint8_t *data, size_t size) override {
    allocation_failed_ = false; capacity_exceeded_ = false;
    return !stopped_ && runtime_.prepare_write(version, data, size);
  }
  bool preparation_capacity_exceeded() const override {
    return runtime_.preparation_capacity_exceeded() || capacity_exceeded_;
  }
  bool preparation_allocation_failed() const override { return allocation_failed_ || runtime_.preparation_allocation_failed(); }
  void discard_prepared() override { runtime_.discard_prepared(); }
  bool activate_prepared(uint32_t generation, uint16_t version,
      const uint8_t *data, size_t size) override {
    published_ = false;
    return runtime_.activate_prepared(generation, version, data, size) && published_;
  }
  bool apply(uint16_t, const uint8_t *, size_t) override { return false; }
private:
  static std::string encoded(std::string_view value) {
    std::string out;
    constexpr char hex[] = "0123456789ABCDEF";
    for (unsigned char c : value) {
      if (c == '%' || c == ',' || c == ';' || c == '|' || c == ':') {
        out += '%'; out += hex[c >> 4]; out += hex[c & 15];
      } else out += char(c);
    }
    return out;
  }
  static std::string card(const Store &store, const pages::CardDefinition &definition, bool child) {
    static constexpr size_t child_order[] = {6, 0, 1, 2, 3, 4, 5, 7, 8};
    std::string out = child ? "" : "~";
    for (size_t i = 0; i < 9; ++i) {
      if (i) out += ',';
      const auto index = child ? child_order[i] : i;
      out += encoded(store.field(definition, static_cast<Field>(index)));
    }
    return out;
  }
  int key(const Store &store, pages::PageId id) const {
    if (!id) return 0;
    const auto *page = store.page(id);
    const auto *owner = page ? store.card(page->owner) : nullptr;
    if (!owner || owner->slot > 32) return -1;
    if (!page->parent) return owner->slot;
    const auto parent = key(store, page->parent);
    return parent > 0 && parent <= 32 ? 32 + (parent - 1) * 32 + owner->slot : -1;
  }
  bool prepare_snapshot(const Store &store) {
    capacity_exceeded_ = false;
    staged_.reset(new (std::nothrow) Snapshot(allocate_, release_));
    if (!staged_) { allocation_failed_ = true; return false; }
    size_t visible = limits_.slot_count;
    size_t secondary_widgets = 0;
    for (pages::PageId id = 1; id < store.page_count(); ++id) {
      const auto *page = store.page(id);
      if (!page->navigable) continue;
      // Count placements, including duplicate imported order tokens, and one
      // Back widget per page. Nesting cannot exceed the old renderer's worst
      // case of slot_count full secondary screens.
      ++secondary_widgets;
      auto order = store.string(page->order);
      bool back = false;
      for (size_t at = 0; at < order.size();) {
        const auto end = order.find(',', at);
        auto token = order.substr(at, end == std::string_view::npos ? end : end - at);
        while (!token.empty() && token.front() == ' ') token.remove_prefix(1);
        back |= !token.empty() && token.front() == 'B';
        if (end == std::string_view::npos) break;
        at = end + 1;
      }
      size_t cell = back ? 0 : 1;
      for (size_t at = 0; at < order.size() && cell < limits_.slot_count; ++cell) {
        const auto end = order.find(',', at);
        auto token = order.substr(at, end == std::string_view::npos ? end : end - at);
        while (!token.empty() && token.front() == ' ') token.remove_prefix(1);
        unsigned slot = 0;
        for (char c : token) { if (c < '0' || c > '9' || slot > 32) break; slot = slot * 10 + c - '0'; }
        if (slot && slot <= page->card_count) { ++visible; ++secondary_widgets; }
        if (end == std::string_view::npos) break;
        at = end + 1;
      }
    }
    if (visible > limits_.max_first_level_cards() ||
        secondary_widgets > size_t(limits_.slot_count) * limits_.slot_count) {
      capacity_exceeded_ = true; return false;
    }
    using Kind = configuration::PanelConfigRecordType;
    auto value = [&](Kind type, uint8_t slot, std::string key, std::string text) {
      staged_->values.push_back({type, slot, std::move(key), std::move(text)});
    };
    value(Kind::DEVICE_PROFILE, 0, "", limits_.device_profile);
    const auto *root = store.page(0);
    for (size_t i = 0; i < root->card_count; ++i) {
      const auto *definition = store.card(root->first_card + i);
      value(Kind::BUTTON, definition->slot, "", card(store, *definition, false));
    }
    for (pages::PageId id = 1; id < store.page_count(); ++id) {
      const auto *page = store.page(id);
      if (!page->navigable) continue;
      const int path = key(store, id);
      if (path < 1) return false;
      GridNativePage next;
      next.key = path; next.parent = key(store, page->parent);
      const auto *owner = store.card(page->owner);
      next.owner_slot = owner->slot;
      next.owner_config = card(store, *owner, false);
      next.config = "~" + std::string(store.string(page->order));
      for (size_t i = 0; i < page->card_count; ++i) {
        next.config += '|'; next.config += card(store, *store.card(page->first_card + i), true);
      }
      if (!next.parent) value(Kind::SUBPAGE, next.owner_slot, "", next.config);
      staged_->pages.push_back(std::move(next));
    }
    auto setting = [&](std::string_view name, std::string_view value) {
      if (name == "companion_auto_open_app_subpages") {
        if (value != "0" && value != "1") return false;
        staged_->app_subpage_preference = value == "1";
      }
      staged_->values.push_back({Kind::SETTING, 0, std::string(name), std::string(value)});
      return true;
    };
    if (store.source_version() == 1) {
      configuration::PanelConfigReader reader(store.source_document(), store.source_size());
      if (reader.begin() != configuration::PanelConfigStatus::OK) return false;
      configuration::PanelConfigRecord record;
      while (reader.next(&record) == configuration::PanelConfigStatus::OK)
        if (record.type == configuration::PanelConfigRecordType::SETTING && !setting(
            {reinterpret_cast<const char *>(record.key), record.key_size},
            {reinterpret_cast<const char *>(record.value), record.value_size})) return false;
    } else {
      configuration::PanelConfigV2Reader reader(store.source_document(), store.source_size());
      size_t size = 0;
      if (reader.workspace_bytes(&size) != configuration::PanelConfigStatus::OK) return false;
      configuration::ConfigurationBuffer scratch(allocate_, release_);
      auto *index = scratch.allocate(size);
      if (!index) { allocation_failed_ = true; return false; }
      if (reader.validate(index, size) != configuration::PanelConfigStatus::OK) return false;
      configuration::PanelConfigV2Record record;
      for (size_t i = 0; i < reader.record_count(); ++i) {
        reader.record(i, &record);
        if (record.kind == configuration::PanelConfigV2Kind::SETTING &&
            !setting(reader.string(record.id), reader.string(record.first))) return false;
      }
    }
    staged_->record_count = staged_->values.size();
    auto *memory = staged_->storage.allocate(staged_->record_count * sizeof(configuration::PanelConfigRecord));
    if (!memory) { allocation_failed_ = true; return false; }
    staged_->records = reinterpret_cast<configuration::PanelConfigRecord *>(memory);
    for (size_t i = 0; i < staged_->record_count; ++i) {
      const auto &owned = staged_->values[i];
      auto &record = *new (staged_->records + i) configuration::PanelConfigRecord{};
      record.type = owned.type; record.slot = owned.slot;
      record.key = reinterpret_cast<const uint8_t *>(owned.key.data()); record.key_size = owned.key.size();
      record.value = reinterpret_cast<const uint8_t *>(owned.value.data()); record.value_size = owned.value.size();
    }
    return bindings_.validate_runtime_records(staged_->records, staged_->record_count);
  }

  void activate_snapshot(const Store &) {
    active_ = std::move(staged_);
    grid_native_pages() = active_.get();
    published_ = bindings_.publish_runtime_records(active_->records, active_->record_count);
    // Apply only after the configuration service commits and activates this
    // snapshot. Old documents omit the setting and retain their switch value.
    if (active_->app_subpage_preference && publish_app_subpage_preference_)
      publish_app_subpage_preference_(*active_->app_subpage_preference);
    if (published_) bindings_.refresh_runtime_pages();
  }
  void retire_snapshot() { grid_native_pages() = nullptr; active_.reset(); }
  const DeviceUiLimits &limits_;
  configuration::PanelConfigTextBindings &bindings_;
  configuration::ConfigurationBuffer::Allocate allocate_;
  configuration::ConfigurationBuffer::Release release_;
  std::function<void(bool)> publish_app_subpage_preference_;
  Allocator allocator_;
  Resources resources_;
  std::unique_ptr<Snapshot> staged_, active_;
  pages::PageStoreRuntime runtime_;
  bool stopped_{false}, capacity_exceeded_{false}, allocation_failed_{false}, published_{false};
};
} // namespace espdesktop
