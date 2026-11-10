#pragma once

#include <array>
#include <functional>
#include <memory>
#include <new>
#include <optional>
#include <string_view>
#include <utility>
#include <vector>

#include "application_scene_runtime.h"
#include "display_brightness_preferences.h"
#include "display_theme_preferences.h"
#include "grid_native_pages.h"
#include "page_store_runtime.h"
#include "panel_config_document.h"
#include "panel_config_document_v2.h"
#include "screen_schedule_preferences.h"


namespace espdesktop {
// Retain EspDesktop's existing card drivers (including Companion). Only page
// definitions change: one prepared native graph feeds the established renderer.
class GridPageRuntime final : public ApplicationSceneRuntime {
  using Store = pages::PageStore;
  using ScalarValues = std::array<std::optional<std::string_view>, panel_settings::SCALAR_RULES.size()>;
  struct Snapshot : GridNativePages {
    std::optional<ThemeSettings> theme_preferences;
    std::string accent;
    std::string schedule_record;
    std::optional<ScreenSchedulePreferences> schedule;
    std::string_view brightness_record;
    DisplayBrightnessPreferences brightness;
    // These views borrow strings from the staged PageStore arena. Activation
    // publishes them before that arena can be retired.
    ScalarValues scalars;
    bool refresh_layout{true};
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
      configuration::ConfigurationBuffer::Allocate allocate,
      configuration::ConfigurationBuffer::Release release,
      std::function<void()> refresh_layout = {},
      std::function<void(const std::optional<ThemeSettings> &)> publish_theme_preferences = {},
      std::function<void(const std::optional<ScreenSchedulePreferences> &)> publish_schedule = {},
      std::function<void(panel_settings::ScalarSetting, std::string_view)> publish_scalar = {},
      std::function<void(const DisplayBrightnessPreferences &)> publish_brightness = {})
      : limits_(limits), allocate_(allocate), release_(release),
        refresh_layout_(std::move(refresh_layout)),
        publish_theme_preferences_(std::move(publish_theme_preferences)),
        publish_schedule_(std::move(publish_schedule)), publish_scalar_(std::move(publish_scalar)),
        publish_brightness_(std::move(publish_brightness)),
        allocator_(allocate, release), resources_(*this), runtime_(limits_, allocator_, limits.page_store_bytes, &resources_) {}
  bool ready() const override { return !stopped_; }
  std::string_view scalar_setting_value(panel_settings::ScalarSetting setting) const {
    return scalar_value(active_.get(), size_t(setting));
  }
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
    return runtime_.activate_prepared(generation, version, data, size);
  }
  bool apply(uint16_t, const uint8_t *, size_t) override { return false; }
private:
  static std::string_view scalar_value(const Snapshot *snapshot, size_t index) {
    const auto fallback = panel_settings::SCALAR_RULES[index].default_value;
    return snapshot ? snapshot->scalars[index].value_or(fallback) : fallback;
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
  // Compare before activation, while both arenas are still available.
  // String identities are local to each arena, so compare their contents.
  static bool same_layout(const Store &before, const Store &after) {
    if (before.page_count() != after.page_count() || before.card_count() != after.card_count()) return false;
    for (pages::PageId id = 0; id < after.page_count(); ++id) {
      const auto &left = *before.page(id);
      const auto &right = *after.page(id);
      if (left.parent != right.parent || left.owner != right.owner ||
          left.first_card != right.first_card || left.card_count != right.card_count ||
          left.navigable != right.navigable || left.runtime_card_mask != right.runtime_card_mask ||
          before.string(left.order) != after.string(right.order)) return false;
    }
    for (pages::CardId id = 0; id < after.card_count(); ++id) {
      const auto &left = *before.card(id);
      const auto &right = *after.card(id);
      if (left.slot != right.slot || left.target != right.target) return false;
      for (size_t index = 0; index < left.fields.size(); ++index)
        if (before.string(left.fields[index]) != after.string(right.fields[index])) return false;
    }
    return true;
  }
  bool prepare_snapshot(const Store &store) {
    capacity_exceeded_ = false;
    staged_.reset(new (std::nothrow) Snapshot);
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
    for (pages::PageId id = 1; id < store.page_count(); ++id) {
      const auto *page = store.page(id);
      if (!page->navigable) continue;
      const int path = key(store, id);
      if (path < 1) return false;
      GridNativePage next;
      next.key = path; next.parent = key(store, page->parent);
      next.id = id;
      const auto *owner = store.card(page->owner);
      next.owner_slot = owner->slot;
      staged_->pages.push_back(std::move(next));
    }
    auto setting = [&](std::string_view name, std::string_view value) {
      if (name == "button_on_color") {
        staged_->accent = value;
      } else if (name == DISPLAY_THEME_PREFERENCES_KEY) {
        staged_->theme_preferences = parse_display_theme_preferences(value);
        if (!staged_->theme_preferences) return false;
      } else if (name == SCREEN_SCHEDULE_PREFERENCES_KEY) {
        staged_->schedule = parse_screen_schedule_preferences(value);
        if (!staged_->schedule) return false;
        staged_->schedule_record = value;
      } else if (name == DISPLAY_BRIGHTNESS_PREFERENCES_KEY) {
        const auto brightness = parse_display_brightness_preferences(value);
        if (!brightness) return false;
        staged_->brightness = *brightness;
        staged_->brightness_record = value;
      } else {
        const auto index = panel_settings::scalar_setting_index(name);
        if (index < staged_->scalars.size()) {
          if (!panel_settings::SCALAR_RULES[index].valid(value)) return false;
          staged_->scalars[index] = value;
        }
      }
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
    staged_->refresh_layout = !active_ || active_->accent != staged_->accent ||
        !same_layout(*active_->store, store);
    return true;
  }

  void activate_snapshot(const Store &store) {
    const bool schedule_changed = !active_ || active_->schedule_record != staged_->schedule_record;
    const auto previous = std::move(active_);
    active_ = std::move(staged_);
    active_->store = &store;
    grid_native_pages() = active_.get();
    // Apply only after the configuration service commits and activates this snapshot.
    if (publish_theme_preferences_) publish_theme_preferences_(active_->theme_preferences);
    if (schedule_changed && publish_schedule_) publish_schedule_(active_->schedule);
    if (publish_brightness_ && active_->brightness_record != (previous ? previous->brightness_record : std::string_view{}))
      publish_brightness_(active_->brightness);
    if (publish_scalar_) {
      for (size_t index = 0; index < active_->scalars.size(); ++index) {
        const auto value = scalar_value(active_.get(), index);
        if (value != scalar_value(previous.get(), index))
          publish_scalar_(static_cast<panel_settings::ScalarSetting>(index), value);
      }
    }
    if (active_->refresh_layout && refresh_layout_) refresh_layout_();
  }
  void retire_snapshot() { grid_native_pages() = nullptr; active_.reset(); }
  const DeviceUiLimits &limits_;
  configuration::ConfigurationBuffer::Allocate allocate_;
  configuration::ConfigurationBuffer::Release release_;
  std::function<void()> refresh_layout_;
  std::function<void(const std::optional<ThemeSettings> &)> publish_theme_preferences_;
  std::function<void(const std::optional<ScreenSchedulePreferences> &)> publish_schedule_;
  std::function<void(panel_settings::ScalarSetting, std::string_view)> publish_scalar_;
  std::function<void(const DisplayBrightnessPreferences &)> publish_brightness_;
  Allocator allocator_;
  Resources resources_;
  std::unique_ptr<Snapshot> staged_, active_;
  pages::PageStoreRuntime runtime_;
  bool stopped_{false}, capacity_exceeded_{false}, allocation_failed_{false};
};
} // namespace espdesktop
