#include <array>
#include <cassert>
#include <cstring>
#include <string>
#include "button_grid_subpage_parser.h"
#include "grid_layout_config.h"
#include "grid_native_page_cards.h"
#include "grid_page_runtime.h"
#include "panel_config_page_append.h"
#include "page_store_goldens.h"
using namespace espdesktop;
using namespace espdesktop::configuration;

struct Text final : PanelConfigTextValue {
  std::string current;
  int persistent_writes{0}, publications{0};
  const std::string &value() const override { return current; }
  bool set_value(const char *data, size_t size) override {
    ++persistent_writes; current.assign(data, size); return true;
  }
  bool publish_value(const char *data, size_t size) override {
    ++publications; const std::string next(data, size); current = next; return true;
  }
};
static bool fail_allocation = false;
static size_t fail_size = 0, last_allocation_size = 0;
static uint8_t *allocate(size_t size) {
  last_allocation_size = size;
  return (fail_allocation || size == fail_size) ? nullptr : static_cast<uint8_t *>(std::malloc(size));
}
int main() {
  const auto &limits = DEVICE_UI_PROFILES[8];
  Text order, color;
  std::array<Text, 9> buttons, subpages;
  PanelConfigTextBindings bindings;
  bindings.set_device_profile(limits.device_profile);
  bindings.set_button_order(&order); bindings.set_button_on_color(&color);
  for (size_t i = 0; i < buttons.size(); ++i) {
    std::array<PanelConfigTextValue *, 8> chunks{}; chunks[0] = &subpages[i];
    assert(bindings.set_button(i + 1, &buttons[i], chunks));
  }
  const auto assert_nested_page = [] {
    assert(grid_native_page(1) && grid_native_page(33));
    assert(grid_native_page(1)->parent == 0 && grid_native_page(33)->parent == 1);
    const auto owner = grid_layout_card_config(33, {});
    assert(owner.entity == "com.apple.Safari" && companion_app_shortcuts_enabled(owner));
    std::string order;
    std::vector<SubpageBtn> cards;
    assert(grid_read_native_subpage(33, order, cards));
    assert(order == "B,1" && cards.size() == 1);
    assert(cards[0].entity == "shortcut.command+l" && cards[0].label == "Address");
    assert(cards[0].icon == "Keyboard" && cards[0].icon_on == "Auto");
  };
  {
    GridPageRuntime runtime(limits, bindings, allocate, ConfigurationBuffer::release_host);
    assert(runtime.ready());
    assert(runtime.prepare_write(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    const auto runtime_record_bytes = last_allocation_size;
    assert(runtime.activate_prepared(7, 2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert_nested_page();
    const auto &store = *grid_native_pages()->store;
    const auto &page = *store.page(grid_native_page(33)->id);
    const auto &parent = *store.page(grid_native_page(1)->id);
    assert(page.parent == grid_native_page(1)->id);
    assert(parent.parent == 0);
    assert(store.string(page.order) == "B,1");
    assert(order.current == "1");
    const std::string stale_card = "light.stale;Wrong card;;;;;switch";
    const auto home_card = grid_layout_card_config(1, stale_card);
    assert(home_card.type == "subpage" && home_card.label == "Work");
    assert(grid_layout_card_config(2, stale_card).entity.empty());
    assert(grid_layout_card_config(33, stale_card).entity == "com.apple.Safari");
    assert(grid_layout_root_order("3") == "1");
    std::string folder_order;
    std::vector<SubpageBtn> folder_cards;
    assert(grid_read_native_subpage(1, folder_order, folder_cards));
    assert(folder_order == "B,1" && folder_cards.size() == 1);
    assert(folder_cards[0].entity == "com.apple.Safari");
    const auto legacy_folder = parse_subpage_config(subpages[0].current);
    assert(legacy_folder.size() == 1 && subpage_btn_same_definition(folder_cards[0], legacy_folder[0]));
    assert(!grid_read_native_subpage(2, folder_order, folder_cards));
    assert(order.persistent_writes == 0 && subpages[0].persistent_writes == 0);
    fail_allocation = true;
    assert(!runtime.prepare_write(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(runtime.preparation_allocation_failed());
    fail_allocation = false;
    assert_nested_page();
    // Fail only the runtime record-view allocation, after PageStore staged.
    fail_size = runtime_record_bytes;
    assert(!runtime.prepare(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(runtime.preparation_allocation_failed());
    fail_size = 0;
    assert_nested_page();
    assert(runtime.prepare(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(!runtime.preparation_allocation_failed());
    runtime.discard_prepared();
    auto invalid = std::array<uint8_t, sizeof(COMPANION_NESTED_DOCUMENT)>{};
    std::memcpy(invalid.data(), COMPANION_NESTED_DOCUMENT, invalid.size()); invalid[0] = 0;
    assert(!runtime.prepare_write(2, invalid.data(), invalid.size()));
    assert_nested_page();
  }
  assert(grid_native_pages() == nullptr);
  assert(grid_layout_card_config(1, "light.stale;Legacy card").label == "Legacy card");
  assert(grid_layout_root_order("3") == "3");
  {
    GridPageRuntime restored(limits, bindings, allocate, ConfigurationBuffer::release_host);
    assert(restored.prepare(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(restored.activate_prepared(7, 2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert_nested_page();
  }
  // Valid saved text can expand beyond a wire record when escaped for the
  // live grid. Boot and save preparation must retain it without changing the
  // strict saved-document reader's limits.
  {
    std::array<uint8_t, 8192> legacy{}; size_t size = 0;
    PanelConfigWriter writer(legacy.data(), legacy.size());
    assert(writer.begin() == PanelConfigStatus::OK);
    assert(writer.append_device_profile(reinterpret_cast<const uint8_t *>(limits.device_profile), std::strlen(limits.device_profile)) == PanelConfigStatus::OK);
    const std::string owner = ";Folder;;;;;subpage";
    assert(writer.append_button(1, reinterpret_cast<const uint8_t *>(owner.data()), owner.size()) == PanelConfigStatus::OK);
    const std::string page = "B,1|light.one:" + std::string(1500, ';') + ":Auto:Auto:::";
    assert(page.size() < 4095);
    assert(writer.append_subpage(1, reinterpret_cast<const uint8_t *>(page.data()), page.size()) == PanelConfigStatus::OK);
    assert(writer.finish(&size) == PanelConfigStatus::OK);
    PanelConfigReader strict(legacy.data(), size);
    assert(strict.validate() == PanelConfigStatus::OK);
    GridPageRuntime expanded(limits, bindings, allocate, ConfigurationBuffer::release_host);
    assert(expanded.prepare(1, legacy.data(), size));
    assert(expanded.activate_prepared(9, 1, legacy.data(), size));
    assert(subpages[0].current.size() > 4096);
    assert(subpages[0].current.find("%3B%3B") != std::string::npos);
    assert(subpages[0].persistent_writes == 0);
    std::array<uint8_t, 8192> rejected{};
    PanelConfigWriter saved_limits(rejected.data(), rejected.size());
    assert(saved_limits.begin() == PanelConfigStatus::OK);
    assert(saved_limits.append_subpage(1, reinterpret_cast<const uint8_t *>(subpages[0].current.data()), subpages[0].current.size()) == PanelConfigStatus::INVALID_ARGUMENT);
    assert(expanded.prepare_write(1, legacy.data(), size));
  }
  // Producer edits preserve the nested navigation and add Finder actions only
  // to the requested page, including labels with serialization delimiters.
  PanelConfigV2Reader reader(COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT));
  size_t needed = 0; assert(reader.workspace_bytes(&needed) == PanelConfigStatus::OK);
  std::vector<uint64_t> index((needed + 7) / 8);
  assert(reader.validate(index.data(), index.size() * 8) == PanelConfigStatus::OK);
  PanelConfigPageAppend edit(reader);
  std::vector<std::array<std::string, 9>> added{{"folder.trip", "Travel|Work", "Folder Outline", "Auto", "", "", "companion", "", "finder_open_behavior=same_window"}};
  assert(edit.append(2, "B,1,2", added));
  std::array<uint8_t, 40960> updated{}; size_t size = 0;
  assert(edit.finish(updated.data(), updated.size(), &size, allocate, ConfigurationBuffer::release_host));
  GridPageRuntime with_finder(limits, bindings, allocate, ConfigurationBuffer::release_host);
  assert(with_finder.prepare_write(2, updated.data(), size));
  assert(with_finder.activate_prepared(8, 2, updated.data(), size));
  assert(grid_native_page(33)->parent == 1);
  std::string updated_order;
  std::vector<SubpageBtn> updated_cards;
  assert(grid_read_native_subpage(33, updated_order, updated_cards));
  assert(updated_order == "B,1,2" && updated_cards.size() == 2);
  assert(updated_cards[0].entity == "shortcut.command+l");
  assert(updated_cards[1].entity == "folder.trip" && updated_cards[1].label == "Travel|Work");
  assert(companion_folder_open_behavior(parsed_cfg_from_subpage_btn(updated_cards[1])) == "same_window");

}
