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

static bool fail_allocation = false;
static uint8_t *allocate(size_t size) {
  return fail_allocation ? nullptr : static_cast<uint8_t *>(std::malloc(size));
}
int main() {
  const auto &limits = DEVICE_UI_PROFILES[8];
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
    int refreshes = 0;
    GridPageRuntime runtime(limits, allocate, ConfigurationBuffer::release_host, [&] {
      assert_nested_page();
      ++refreshes;
    });
    assert(runtime.ready());
    assert(runtime.prepare_write(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(refreshes == 0);
    assert(runtime.activate_prepared(7, 2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(refreshes == 1);
    assert_nested_page();
    const auto &store = *grid_native_pages()->store;
    const auto &page = *store.page(grid_native_page(33)->id);
    const auto &parent = *store.page(grid_native_page(1)->id);
    assert(page.parent == grid_native_page(1)->id);
    assert(parent.parent == 0);
    assert(store.string(page.order) == "B,1");
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
    assert(!grid_read_native_subpage(2, folder_order, folder_cards));
    fail_allocation = true;
    assert(!runtime.prepare_write(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(runtime.preparation_allocation_failed());
    fail_allocation = false;
    assert_nested_page();
    assert(runtime.prepare(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(!runtime.preparation_allocation_failed());
    runtime.discard_prepared();
    auto invalid = std::array<uint8_t, sizeof(COMPANION_NESTED_DOCUMENT)>{};
    std::memcpy(invalid.data(), COMPANION_NESTED_DOCUMENT, invalid.size()); invalid[0] = 0;
    assert(!runtime.prepare_write(2, invalid.data(), invalid.size()));
    assert_nested_page();
    assert(refreshes == 1);
  }
  assert(grid_native_pages() == nullptr);
  assert(grid_layout_card_config(1, "light.stale;Legacy card").label == "Legacy card");
  assert(grid_layout_root_order("3") == "3");
  {
    GridPageRuntime restored(limits, allocate, ConfigurationBuffer::release_host);
    assert(restored.prepare(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert(restored.activate_prepared(7, 2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
    assert_nested_page();
  }
  // Imported text with delimiters is read from the active page directly.
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
    GridPageRuntime expanded(limits, allocate, ConfigurationBuffer::release_host);
    assert(expanded.prepare(1, legacy.data(), size));
    assert(expanded.activate_prepared(9, 1, legacy.data(), size));
    std::string order;
    std::vector<SubpageBtn> cards;
    assert(grid_read_native_subpage(1, order, cards));
    assert(order == "B,1" && cards.size() == 1);
    assert(cards[0].label == std::string(1500, ';'));
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
  GridPageRuntime with_finder(limits, allocate, ConfigurationBuffer::release_host);
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

  constexpr std::string_view preference_key = "companion_auto_open_app_subpages";
  auto write_preference = [&](std::string_view name, std::string_view value) {
    PanelConfigPageAppend edit(reader);
    assert(edit.set_setting(name, value));
    assert(edit.finish(updated.data(), updated.size(), &size, allocate, ConfigurationBuffer::release_host));
  };

  using Scalar = panel_settings::ScalarSetting;
  std::vector<bool> applied;
  GridPageRuntime preference(limits, allocate, ConfigurationBuffer::release_host, {}, {}, {},
      [&](Scalar setting, std::string_view value) {
        if (setting == Scalar::COMPANION_AUTO_OPEN_APP_SUBPAGES) applied.push_back(value == "1");
      });
  assert(preference.scalar_setting_value(Scalar::COMPANION_AUTO_OPEN_APP_SUBPAGES) == "1");
  write_preference(preference_key, "0");
  assert(preference.prepare_write(2, updated.data(), size));
  assert(applied.empty());
  assert(preference.activate_prepared(9, 2, updated.data(), size));
  assert(applied == std::vector<bool>{false});
  write_preference(preference_key, "invalid");
  assert(!preference.prepare_write(2, updated.data(), size));
  assert(applied == std::vector<bool>{false});
  assert(preference.prepare_write(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
  assert(preference.activate_prepared(10, 2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
  assert((applied == std::vector<bool>{false, true}));

  PanelConfigWriter v1(updated.data(), updated.size());
  assert(v1.begin() == PanelConfigStatus::OK);
  assert(v1.append_device_profile(reinterpret_cast<const uint8_t *>(limits.device_profile),
      std::strlen(limits.device_profile)) == PanelConfigStatus::OK);
  const uint8_t disabled[] = "0";
  assert(v1.append_setting(reinterpret_cast<const uint8_t *>(preference_key.data()), preference_key.size(),
      disabled, sizeof(disabled) - 1) == PanelConfigStatus::OK);
  assert(v1.finish(&size) == PanelConfigStatus::OK);
  assert(preference.prepare_write(1, updated.data(), size));
  assert((applied == std::vector<bool>{false, true}));
  assert(preference.activate_prepared(11, 1, updated.data(), size));
  assert((applied == std::vector<bool>{false, true, false}));

  const auto assert_old_theme = [](const ThemeSettings &settings) {
    assert(settings.mode == ThemeMode::AUTO && settings.auto_method == ThemeAutoMethod::SUNRISE_SUNSET);
    assert(settings.light_start == 417 && settings.dark_start == 1205);
    assert(settings.sunrise_offset == -35 && settings.sunset_offset == 12);
  };
  std::optional<ThemeSettings> current;
  int theme_layout_refreshes = 0;
  GridPageRuntime theme(limits, allocate, ConfigurationBuffer::release_host,
      [&] { ++theme_layout_refreshes; },
      [&](const std::optional<ThemeSettings> &value) { current = value; });
  write_preference(DISPLAY_THEME_PREFERENCES_KEY, "1,auto,sun,417,1205,-35,12");
  assert(theme.prepare_write(2, updated.data(), size));
  assert(!current);
  assert(theme.activate_prepared(10, 2, updated.data(), size));
  assert(current);
  assert_old_theme(*current);

  write_preference(DISPLAY_THEME_PREFERENCES_KEY, "1,light,time,420,1200,0,0");
  assert(theme.prepare_write(2, updated.data(), size));
  theme.discard_prepared();
  assert(current);
  assert_old_theme(*current);
  for (const auto invalid : {"2,auto,sun,417,1205,-35,12", "1,auto,sun,417,1205,-181,12",
                             "1,auto,sun,1440,1205,-35,12", "1,auto,sun,417,1205,-35",
                             "1,auto,sun,417,1205,-35,12,0", "1,auto,sun,417,1205,-35,12x"}) {
    write_preference(DISPLAY_THEME_PREFERENCES_KEY, invalid);
    assert(!theme.prepare_write(2, updated.data(), size));
    assert(current);
    assert_old_theme(*current);
  }

  // Large flat documents can be durably stored in v1. An entity write
  // creates or edits the theme without touching their saved cards.
  assert(theme_layout_refreshes == 1);
  write_preference(DISPLAY_THEME_PREFERENCES_KEY, "1,light,time,420,1200,0,0");
  assert(theme.prepare_write(2, updated.data(), size));
  assert(theme.activate_prepared(11, 2, updated.data(), size));
  assert(current && current->mode == ThemeMode::LIGHT && theme_layout_refreshes == 1);

  assert(v1.begin() == PanelConfigStatus::OK);
  assert(v1.append_device_profile(reinterpret_cast<const uint8_t *>(limits.device_profile),
      std::strlen(limits.device_profile)) == PanelConfigStatus::OK);
  const uint8_t card[] = "light.kitchen;Kitchen";
  assert(v1.append_button(1, card, sizeof(card) - 1) == PanelConfigStatus::OK);
  assert(v1.finish(&size) == PanelConfigStatus::OK);
  std::array<uint8_t, 256> rewritten{};
  size_t rewritten_size = 0;
  assert(panel_config_set_setting_v1(updated.data(), size, DISPLAY_THEME_PREFERENCES_KEY,
      "1,light,time,480,1260,25,-60", rewritten.data(), rewritten.size(), &rewritten_size));
  assert(theme.prepare_write(1, rewritten.data(), rewritten_size));
  assert(current && current->mode == ThemeMode::LIGHT);
  assert(theme.activate_prepared(12, 1, rewritten.data(), rewritten_size));
  assert(theme_layout_refreshes == 2);
  assert(current && encode_display_theme_preferences(*current) == "1,light,time,480,1260,25,-60");
  assert(grid_layout_card_config(1, {}).entity == "light.kitchen");

  assert(panel_config_set_setting_v1(rewritten.data(), rewritten_size, DISPLAY_THEME_PREFERENCES_KEY,
      "1,auto,sun,417,1205,-35,12", updated.data(), updated.size(), &size));
  assert(theme.prepare_write(1, updated.data(), size));
  assert(theme.activate_prepared(13, 1, updated.data(), size));
  assert_old_theme(*current);
  assert(theme_layout_refreshes == 2 && grid_layout_card_config(1, {}).entity == "light.kitchen");


  int schedule_applies = 0, schedule_layout_refreshes = 0;
  std::optional<ScreenSchedulePreferences> schedule;
  GridPageRuntime schedule_runtime(limits, allocate, ConfigurationBuffer::release_host,
      [&] { ++schedule_layout_refreshes; }, {},
      [&](const std::optional<ScreenSchedulePreferences> &value) { schedule = value; ++schedule_applies; });
  write_preference(SCREEN_SCHEDULE_PREFERENCES_KEY, "1,1,7,19,clock,60,10,15,10,C0FFEE");
  assert(schedule_runtime.prepare_write(2, updated.data(), size));
  assert(schedule_applies == 0);
  assert(schedule_runtime.activate_prepared(14, 2, updated.data(), size));
  assert(schedule_applies == 1 && schedule_layout_refreshes == 1);
  assert(schedule && schedule->enabled && schedule->night_mode == ScheduledNightMode::CLOCK &&
      std::string_view(schedule->clock_color.data()) == "C0FFEE");

  write_preference(SCREEN_SCHEDULE_PREFERENCES_KEY, "1,0,24,22,dim,120,20,5,3,FFFFFF");
  assert(!schedule_runtime.prepare_write(2, updated.data(), size));
  assert(schedule_applies == 1 && schedule->enabled);
  write_preference(SCREEN_SCHEDULE_PREFERENCES_KEY, "1,0,9,22,dim,120,20,5,3,FFFFFF");
  assert(schedule_runtime.prepare_write(2, updated.data(), size));
  schedule_runtime.discard_prepared();
  assert(schedule_applies == 1 && schedule->enabled);
  assert(schedule_runtime.prepare_write(2, updated.data(), size));
  assert(schedule_runtime.activate_prepared(15, 2, updated.data(), size));
  assert(schedule_applies == 2 && schedule_layout_refreshes == 1);
  assert(schedule && !schedule->enabled && schedule->on_hour == 9 && schedule->off_hour == 22 &&
      schedule->wake_timeout == 120 && schedule->dimmed_brightness == 5);
  assert(encode_screen_schedule_preferences(*schedule) == "1,0,9,22,dim,120,20,5,3,FFFFFF");
  assert(schedule_runtime.prepare_write(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
  assert(schedule_runtime.activate_prepared(16, 2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
  assert(schedule_applies == 3 && !schedule);

  std::vector<std::pair<Scalar, std::string>> published;
  GridPageRuntime scalar_runtime(limits, allocate, ConfigurationBuffer::release_host,
      {}, {}, {}, [&](Scalar setting, std::string_view value) { published.emplace_back(setting, value); });
  assert(scalar_runtime.scalar_setting_value(Scalar::SCREEN_CARD_CURVE) == "Large");
  write_preference("screen_card_curve", "Medium");
  assert(scalar_runtime.prepare_write(2, updated.data(), size) && published.empty());
  assert(scalar_runtime.activate_prepared(17, 2, updated.data(), size));
  assert(published.size() == 1 && published.back().first == Scalar::SCREEN_CARD_CURVE);
  assert(published.back().second == "Medium");
  assert(scalar_runtime.scalar_setting_value(Scalar::SCREEN_CARD_CURVE) == "Medium");
  assert(scalar_runtime.prepare_write(2, updated.data(), size));
  assert(scalar_runtime.activate_prepared(18, 2, updated.data(), size));
  assert(published.size() == 1);
  write_preference("screen_card_curve", "invalid");
  assert(!scalar_runtime.prepare_write(2, updated.data(), size));
  assert(published.size() == 1 && scalar_runtime.scalar_setting_value(Scalar::SCREEN_CARD_CURVE) == "Medium");
  assert(scalar_runtime.prepare_write(2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
  assert(scalar_runtime.activate_prepared(19, 2, COMPANION_NESTED_DOCUMENT, sizeof(COMPANION_NESTED_DOCUMENT)));
  assert(published.size() == 2 && published.back().second == "Large");
  write_preference("screensaver_timeout", "3601");
  assert(!scalar_runtime.prepare_write(2, updated.data(), size));
  write_preference("screensaver_timeout", "3600");
  assert(scalar_runtime.prepare_write(2, updated.data(), size));
  assert(scalar_runtime.activate_prepared(20, 2, updated.data(), size));
  assert(published.back().first == Scalar::SCREENSAVER_TIMEOUT && published.back().second == "3600");
  assert_nested_page();
}
