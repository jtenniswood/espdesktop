#include <cassert>
#include <string>

struct lv_obj_t {};
inline void lv_label_set_text(lv_obj_t *, const char *) {}

#include "companion_controls.h"
#include "companion_timezone.h"
#include "button_grid_config_parser.h"
#define ESPDESKTOP_SUBPAGE_PARSER_ONLY
#include "button_grid_subpages.h"
#include "finder_folder_sync.h"

using namespace esphome::companion;

static void assert_finder_folder_projection() {
  struct Tile {
    int cell;
    std::string id;
    std::string label;
  };
  struct Case {
    std::string order;
    std::vector<std::string> saved_ids;
    std::vector<CompanionAction> catalogue;
    int capacity;
    std::vector<Tile> expected;
  };
  const Case cases[] = {
#include "finder_folder_preview_cases.inc"
  };
  for (const auto &example : cases) {
    std::vector<SubpageBtn> buttons;
    for (const auto &id : example.saved_ids)
      buttons.push_back({id, "Saved label", "Auto", "Auto", "", "", "companion", "", ""});
    SubpageOrder order;
    parse_subpage_order(example.order, 9, buttons.size(), order);
    normalize_subpage_order_spans(order, 9, 3);
    const SubpageOrder saved = order;
    finder_project_folder_tiles(order, buttons, 9, 3, example.capacity, example.catalogue, "same_window");
    assert(buttons.size() == example.saved_ids.size() + example.expected.size());
    assert(order.back_pos == saved.back_pos && order.back_col_span == saved.back_col_span);
    for (size_t index = 0; index < example.saved_ids.size(); ++index)
      assert(buttons[index].entity == example.saved_ids[index] && buttons[index].label == "Saved label");
    size_t found = 0;
    for (int cell = 0; cell < 9; ++cell) {
      const auto slot = order.positions[cell];
      if (slot <= int(example.saved_ids.size())) {
        assert(slot == saved.positions[cell]);
        continue;
      }
      const auto &expected = example.expected.at(found++);
      const auto &tile = buttons[slot - 1];
      assert(cell == expected.cell && tile.entity == expected.id && tile.label == expected.label);
      assert(tile.icon == finder_folder_default_icon() && tile.options == "finder_open_behavior=same_window");
    }
    assert(found == example.expected.size());
  }
}

int main() {
  assert_finder_folder_projection();
  const auto mac_lock = normalize_parsed_cfg(
      ParsedCfg{"shortcut.command+a", "", "", "", "url.invalid", "%", "companion_mac_lock", "1", ""});
  assert(mac_lock.entity == "shortcut.command+control+q" && mac_lock.sensor.empty());
  assert(mac_lock.label == "Mac Lock" && mac_lock.icon == "Lock");
  const auto mac_lock_subpage = parse_subpage_config("~1|ML,,Lock Work Mac,Shield");
  assert(mac_lock_subpage.size() == 1);
  const auto subpage_lock = parsed_cfg_from_subpage_btn(mac_lock_subpage.front());
  assert(subpage_lock.type == mac_lock.type && subpage_lock.entity == mac_lock.entity);
  assert(subpage_lock.label == "Lock Work Mac" && subpage_lock.icon == "Shield");
  const auto lock_runtime = espdesktop::cards::card_runtime_registry_service().context_for(
      mac_lock.type, mac_lock.sensor);
  assert(lock_runtime.runtime.driver == espdesktop::card_runtime::CardDriverId::COMPANION);
  assert(lock_runtime.allow_in_subpage && companion_shortcut_action_valid(mac_lock.entity));

  const auto saved_page = parse_subpage_config("~B,1|companion,com.example.RemoteEditor,Editor,,,,,,app_shortcuts");
  assert(saved_page.size() == 1);
  auto saved_app = parsed_cfg_from_subpage_btn(saved_page.front());
  assert(companion_app_shortcuts_enabled(saved_app));
  assert(std::string_view(companion_shortcut_page_back_icon(saved_app.icon)) == "Monitor");
  saved_app.icon = "Pencil";
  assert(std::string_view(companion_shortcut_page_back_icon(saved_app.icon)) == "Pencil");
  saved_app.entity = "shortcut.command+l";
  assert(!companion_app_shortcuts_enabled(saved_app));

  // Fast app colour is visual-only, independent of the slower contextual focus.
  {
    CompanionRuntimeService runtime;
    runtime.set_connected(true);
    runtime.set_focused_actions({"com.apple.Safari", "webapp.google-docs"});
    assert(runtime.shortcut_page_ready("com.apple.Safari"));
    assert(!runtime.shortcut_page_ready("com.example.RemoteEditor"));
    runtime.set_keyboard_actions_supported(false);
    assert(!runtime.shortcut_page_ready("com.apple.Safari"));
    runtime.set_keyboard_actions_supported(true);
    runtime.consume_auto_subpage_action("com.apple.Safari");
    runtime.set_application_highlight("com.apple.finder");
    auto state = runtime.snapshot();
    assert(state.application_highlight_known && state.application_highlight_id == "com.apple.finder");
    assert(state.focused_action_ids.empty());
    assert(!runtime.shortcut_page_ready("com.apple.Safari"));
    assert(runtime.pending_auto_subpage_action().empty());
    assert(runtime.consume_focus_refresh_request());
    runtime.consume_refresh_request();
    runtime.set_application_highlight("com.apple.finder");
    assert(!runtime.consume_refresh_request());
    assert(!runtime.consume_focus_refresh_request());
    runtime.set_focused_actions({"folder.one"});
    assert(runtime.shortcut_page_ready("com.apple.finder"));
    assert(runtime.snapshot().application_highlight_id == "com.apple.finder");
    assert(runtime.pending_auto_subpage_action() == "com.apple.finder");
    runtime.set_connected(false);
    assert(!runtime.shortcut_page_ready("com.apple.finder"));
    assert(!runtime.snapshot().application_highlight_known);
  }
  // A confirmed window loss is separate from automatic opening and switching.
  {
    CompanionRuntimeService runtime;
    const std::string app = "com.apple.Safari";
    runtime.set_connected(true);
    runtime.set_auto_open_app_subpages(false);
    runtime.set_application_highlight(app);
    assert(!runtime.set_focused_actions({app}));
    assert(!runtime.set_focused_actions({}));
    assert(runtime.pending_auto_subpage_action().empty());
    assert(runtime.consume_closed_app_subpage_action() == app);
    assert(runtime.consume_closed_app_subpage_action().empty());

    runtime.set_focused_actions({app});
    runtime.set_focused_actions({});
    runtime.set_focused_actions({app});
    assert(runtime.consume_closed_app_subpage_action().empty());  // Window reopened.
    runtime.set_application_highlight("");
    runtime.set_focused_actions({});
    assert(runtime.consume_closed_app_subpage_action().empty());  // Switched apps.
  }
  {
    CompanionRuntimeService runtime;
    runtime.set_connected(true);
    runtime.set_focused_actions({"first.app"});
    assert(runtime.take_wake_subpage_action() == "first.app");
    assert(runtime.pending_auto_subpage_action().empty());
    assert(runtime.take_wake_subpage_action() == "first.app");  // No new focus event required.
    runtime.set_focused_actions({"second.app"});
    assert(runtime.take_wake_subpage_action() == "second.app");
    runtime.set_auto_open_app_subpages(false);
    assert(runtime.take_wake_subpage_action().empty());
    runtime.set_auto_open_app_subpages(true);
    runtime.set_connected(false);
    assert(runtime.take_wake_subpage_action().empty());
  }
  assert(std::string(companion_volume_control_label("media.output_volume")) == "Volume");
  assert(std::string(companion_volume_control_label("media.input_volume")) == "Mic");
  assert(companion_json_payload_valid(R"({"label":"A, B | C"})", 12000));
  assert(!companion_json_payload_valid(std::string("{\"label\":\"bad\nvalue\"}"), 12000));
  assert(!companion_json_payload_valid("{}", 1));
  assert(companion_remote_definition_capacity_available("application", 255));
  assert(!companion_remote_definition_capacity_available("application", 256));
  assert(!companion_remote_definition_capacity_available("webapp", 0));

  const std::string page = "~B,1,,|companion,folder.one,My folder,Folder Outline,Auto,,,,";
  const std::vector<CompanionAction> folders = {{"folder.one", "Changed"}, {"folder.two", "A,B|C"}};
  const auto saved = parse_subpage_config(page);
  auto project = [](auto buttons, const auto &catalogue) {
    SubpageOrder order;
    parse_subpage_order("B,1,,", 4, buttons.size(), order);
    normalize_subpage_order_spans(order, 4, 2);
    finder_project_folder_tiles(order, buttons, 4, 2, 4, catalogue, "same_window");
    return buttons;
  };
  const auto live = project(saved, folders);
  assert(live.size() == 2 && live[0].label == "My folder" && live[1].label == "A,B|C");
  assert(live[1].options == "finder_open_behavior=same_window");
  assert(project(saved, std::vector<CompanionAction>{}).size() == 1);
  assert(project(saved, folders)[1].label == live[1].label);
  auto concurrent_edit = saved;
  concurrent_edit[0].label = "Renamed while offline";
  const auto restored = project(concurrent_edit, folders);
  assert(restored[0].label == "Renamed while offline" && restored.size() == 2);
  assert(saved.size() == 1 && saved[0].label == "My folder");
  assert(finder_folder_catalogue_equal(folders, folders));
  assert(!finder_folder_catalogue_equal(folders, {{"folder.one", "Different"}, folders[1]}));

  // Exercise the real translation tables at the device-label boundary.
  assert(std::string(companion_volume_control_label("media.input_mute")) == "Mute");
  assert(std::string(companion_volume_control_label("media.output_mute")) == "Mute");
  set_espdesktop_language("de");
  assert(std::string(companion_volume_control_label("media.input_mute")) == "Stumm");
  assert(std::string(companion_volume_control_label("media.output_volume")) == "Lautstärke");
  assert(std::string(companion_volume_control_label("media.input_volume")) == "Mikro");
  assert(companion_default_action_label("", "url.https%3A%2F%2Fexample.com") == "URL öffnen");
  assert(companion_default_action_label("") == "Mac-App");
  assert(companion_default_action_label("com.apple.Safari") == "com.apple.Safari");
  assert(companion_shortcut_label("shortcut.command+space") == "\U000F0633" "Leertaste");
  assert(companion_shortcut_label("shortcut.command+home") == "\U000F0633" "Pos1");
  assert(companion_shortcut_label("shortcut.command+a") == "\U000F0633" "A");
  assert(companion_shortcut_label("shortcut.command+left") == "\U000F0633\U000F004D");
  set_espdesktop_language("en");
  assert(std::string(espdesktop_i18n_key(companion_metric_suffix_key("stat.battery"))) == "left");
  assert(std::string(espdesktop_i18n_key(companion_metric_suffix_key("stat.cpu"))) == "used");
  assert(std::string(espdesktop_i18n_key(companion_metric_suffix_key("stat.storage_free:external"))) == "free");
  assert(!companion_connected());
  assert(!companion_card_refresh_requested().load());
  const std::string athena = "com.apple.Safari.WebApp.27234284-164C-41C9-97DD-7189CD41B456";
  assert(companion_athena_shortcut_target(athena + ":100") == athena);
  assert(companion_athena_shortcut_target(athena + ":2").empty());
  assert(companion_athena_shortcut_target("com.apple.Safari:100").empty());
  assert(companion_shortcut_action_valid("shortcut.command+a"));
  assert(companion_shortcut_label("shortcut.command+a") == "\U000F0633" "A");
  assert(companion_shortcut_action_valid("shortcut.control+shift+tab"));
  assert(companion_shortcut_label("shortcut.control+shift+tab") == "\U000F0634\U000F0636" "Tab");
  assert(companion_shortcut_action_valid("shortcut.option+f20"));
  assert(companion_shortcut_label("shortcut.left") == "\U000F004D");
  assert(companion_shortcut_label("shortcut.right") == "\U000F0054");
  assert(companion_shortcut_label("shortcut.space") == "Space");
  assert(companion_shortcut_label("shortcut.function+f") == "Fn F");
  assert(!companion_shortcut_action_valid("shortcut.a"));
  assert(!companion_shortcut_action_valid("shortcut.function+g"));
  assert(companion_shortcut_label("shortcut.option+f20") == "\U000F0635" "F20");
  assert(companion_shortcut_label("shortcut.command+left") == "\U000F0633\U000F004D");

  assert(!companion_shortcut_action_valid("shortcut.shift+a"));
  assert(!companion_shortcut_action_valid("shortcut.command+command+a"));
  assert(!companion_shortcut_action_valid("shortcut.command+volumeup"));
  assert(!companion_shortcut_action_valid("shortcut.command+f21"));
  assert(!companion_shortcut_action_valid("com.apple.Safari"));
  assert(companion_shortcut_label("shortcut.f6") == "F6");
  assert(companion_shortcut_label("shortcut.shift+f6") == "\U000F0636" "F6");
  assert(companion_shortcut_label("shortcut.escape-twice") == "Esc Esc");
  assert(companion_shortcut_label("shortcut.9") == "9");
  assert(!companion_shortcut_action_valid("shortcut.0"));
  assert(!companion_shortcut_action_valid("shortcut.shift+f7"));
  assert(!companion_shortcut_action_valid("shortcut.escape-thrice"));
  assert(companion_shortcut_label("shortcut.tab") == "Tab");
  assert(companion_shortcut_label("shortcut.escape") == "Esc");
  assert(!companion_shortcut_action_valid("shortcut.enter"));
  {
    CompanionRuntimeSnapshot keyboard_only;
    keyboard_only.connected = true;
    assert(!companion_action_available(keyboard_only, "shortcut.tab"));
    keyboard_only.keyboard_actions_supported = true;
    // The Mac verifies Safari is active. A standalone keyboard card does not need app-launch approval.
    assert(companion_action_available(keyboard_only, "shortcut.tab"));
    assert(companion_action_available(keyboard_only, "shortcut.escape"));
  }
  assert(companion_shortcut_label("shortcut.shift+escape") == "\U000F0636" "Esc");
  assert(!companion_shortcut_action_valid("shortcut.shift+tab"));

  ParsedCfg finder_launch;
  finder_launch.type = "companion";
  finder_launch.entity = "com.apple.finder";
  finder_launch.options = "app_shortcuts,app_shortcuts_auto_switch";
  assert(companion_app_shortcuts_enabled(finder_launch));
  assert(companion_card_options_normalized(finder_launch) == "app_shortcuts");

  ParsedCfg safari_launch;
  safari_launch.type = "companion";
  safari_launch.entity = "com.apple.Safari";
  safari_launch.options = "app_shortcuts";
  assert(companion_app_icon_enabled(safari_launch));
  assert(companion_app_shortcuts_enabled(safari_launch));
  assert(companion_card_options_normalized(safari_launch) == "app_shortcuts");
  safari_launch.options = "app_shortcuts,app_shortcuts_auto_switch";
  assert(companion_app_shortcuts_enabled(safari_launch));
  assert(companion_card_options_normalized(safari_launch) == "app_shortcuts");
  safari_launch.options =
    "app_shortcuts,app_shortcuts_auto_switch,app_shortcuts_tabs=3%7C0";
  assert(companion_app_shortcut_tabs_normalized(safari_launch) == "3|0");
  assert(companion_card_options_normalized(safari_launch) ==
         "app_shortcuts,app_shortcuts_tabs=3%7C0");
  safari_launch.options = "app_shortcuts,app_shortcuts_tabs=none";
  assert(companion_app_shortcut_tabs_normalized(safari_launch) == "none");
  safari_launch.options = "app_shortcuts,app_shortcuts_tabs=9%7C3%7C3%7C0";
  assert(companion_app_shortcut_tabs_normalized(safari_launch) == "9|3|0");
  ParsedCfg codex_launch = safari_launch;
  codex_launch.entity = "com.openai.codex";
  assert(companion_app_icon_enabled(codex_launch));
  assert(companion_app_shortcuts_enabled(codex_launch));
  ParsedCfg slack_launch = safari_launch;
  slack_launch.entity = "com.tinyspeck.slackmacgap";
  assert(companion_app_shortcuts_enabled(slack_launch));
  ParsedCfg edited_preset;
  edited_preset.type = "companion";
  edited_preset.entity = "shortcut.command+left";
  edited_preset.options = "app_shortcut_preset=com.apple.Safari%3A0";
  assert(companion_shortcut_preset_normalized(edited_preset) == "com.apple.Safari:0");
  assert(companion_card_options_normalized(edited_preset) ==
         "app_shortcut_preset=com.apple.Safari%3A0");
  edited_preset.options = "app_shortcut_preset=com.apple.Safari%3A9";
  assert(companion_shortcut_preset_normalized(edited_preset) == "com.apple.Safari:9");
  edited_preset.options = "app_shortcut_preset=custom";
  assert(companion_shortcut_preset_normalized(edited_preset) == "custom");
  safari_launch.sensor = "url.https%3A%2F%2Fexample.com";
  assert(!companion_app_shortcuts_enabled(safari_launch));

  for (const std::string raw : {"webapp.google-docs;Docs;Web;Auto;;;companion;;app_shortcuts",
                                "~webapp.google-docs,Docs,Web,Auto,,,companion,,app_shortcuts"}) {
    const auto retired = parse_cfg(raw);
    assert(card_runtime_type_retired(retired.type) && retired.entity.empty() && retired.options.empty());
  }
  const auto retired_child = parse_subpage_config("~B,1|companion,webapp.google-docs,Docs,Web,Auto");
  assert(retired_child.size() == 1 && card_runtime_type_retired(retired_child[0].type));
  assert(retired_child[0].entity.empty());

  ParsedCfg companion_stat_subpage;
  companion_stat_subpage.type = "subpage";
  companion_stat_subpage.entity = "stat.network_throughput";
  companion_stat_subpage.options = "subpage_kind=companion_stat";
  assert(std::string(subpage_companion_stat_default_label(companion_stat_subpage.entity)) == "Network");

  const std::string url_config = "url.https%3A%2F%2Fexample.com%2Fdashboard%3Froom%3Doffice";
  assert(companion_encoded_url(url_config) == "https%3A%2F%2Fexample.com%2Fdashboard%3Froom%3Doffice");
  assert(companion_encoded_url("url.file%3A%2F%2Fetc%2Fpasswd").empty());
  assert(companion_encoded_url("url.javascript%3Aalert(1)").empty());
  assert(companion_encoded_url("url.https%3A%2F%2Fexample.com|INVOKE").empty());
  assert(companion_encoded_url("url." + std::string(129, 'a')).empty());
  assert(companion_default_action_label("shortcut.command+a") == "\U000F0633" "A");
  assert(companion_default_action_label("com.apple.Safari") == "com.apple.Safari");
  assert(companion_default_action_label("com.apple.Safari", url_config) == "Open URL");
  assert(companion_default_action_label("") == "Mac App");
  assert(companion_metric_card_should_disable(false, false));
  assert(!companion_metric_card_should_disable(false, true));
  assert(!companion_metric_card_should_disable(true, false));

  const std::string folder_action = "folder.00000000-0000-0000-0000-000000000001";
  int focus_registration_updates = 0;
  companion_runtime_service().focus_registrations_changed_handler = [&focus_registration_updates] {
    ++focus_registration_updates;
  };
  const std::string focus_url = "https://example.com/";
  const std::string focus_url_id = companion_url_card_focus_id(
      "url." + companion_encode_url_focus_value(focus_url));
  companion_set_focus_registrations({{focus_url_id, focus_url}});
  assert(focus_registration_updates == 1);
  companion_set_focus_registrations({{focus_url_id, focus_url}});
  assert(focus_registration_updates == 1);
  companion_runtime_service().focus_registrations_changed_handler = {};
  companion_set_actions({{"com.apple.Safari", "Safari"}, {folder_action, "Projects"}});
  assert(companion_default_action_label("com.apple.Safari") == "Safari");
  std::string resolved_label;
  assert(companion_default_action_label_with_fallback("com.apple.Safari", "", resolved_label) == "Safari");
  companion_set_actions({});
  assert(companion_default_action_label_with_fallback("com.apple.Safari", "", resolved_label) == "Safari");
  const auto retired_window = parse_cfg("window.minimize;Old;Monitor;Auto;;;companion");
  assert(card_runtime_type_retired(retired_window.type) && retired_window.entity.empty());
  const auto window_subpage = parse_subpage_config("~B,1,2|CP,window.minimize,Old|CP,shortcut.command%2Ba,Keep");
  assert(window_subpage.size() == 2);
  assert(card_runtime_type_retired(window_subpage[0].type) && window_subpage[0].entity.empty());
  assert(window_subpage[1].type == "companion" && window_subpage[1].entity == "shortcut.command+a");
  // A saved window action stays unavailable even if an older peer supplies its identifier.
  companion_set_actions({{"com.apple.Safari", "Safari"}, {folder_action, "Projects"}, {"window.left", "Left"}});
  companion_set_keyboard_actions_supported(true);
  assert(companion_card_refresh_requested().load());
  companion_set_connected(true);
  assert(companion_connected());
  assert(companion_action_available("shortcut.command+a"));
  assert(!companion_action_available("window.left"));
  companion_set_keyboard_actions_supported(false);
  assert(!companion_action_available("shortcut.command+a"));
  assert(!companion_action_available("window.close"));
  assert(!companion_action_available("window.not-real"));
  assert(companion_metric_key_valid("stat.ip_address:en0"));
  CompanionRuntimeSnapshot network_snapshot;
  network_snapshot.connected = true;
  network_snapshot.system_metrics.network_interfaces = {{"en0", "Wi-Fi", "192.168.1.10"}, {"en1", "Ethernet", "10.0.0.2"}};
  assert(companion_network_address(network_snapshot, "stat.ip_address:en1") == "10.0.0.2");
  assert(companion_network_address(network_snapshot, "stat.ip_address:en2") == "--");
  assert(companion_network_address(network_snapshot, "stat.ip_address") == "192.168.1.10");
  network_snapshot.system_metrics.network_interfaces[0].address.clear();
  assert(companion_network_address(network_snapshot, "stat.ip_address") == "10.0.0.2");
  assert(companion_network_address(network_snapshot, "stat.ip_address:en0") == "--");
  assert(companion_network_address(network_snapshot, "stat.ip_address:") == "--");
  network_snapshot.system_metrics.network_interfaces[1].address.clear();
  assert(companion_network_address(network_snapshot, "stat.ip_address") == "--");
  network_snapshot.connected = false;
  assert(companion_network_address(network_snapshot, "stat.ip_address") == "--");
  assert(companion_network_address(network_snapshot, "stat.ip_address:en0") == "--");
  assert(companion_metric_key_valid("stat.cpu"));
  assert(!companion_metric_key_valid("sensor.cpu"));
  assert(std::string(companion_metric_label_key("stat.memory")) == "memory");
  assert(std::string(companion_metric_default_unit("stat.network_throughput")) == "MB/s");
  CompanionSystemMetricsSnapshot metrics;
  metrics.generation = 1;
  metrics.cpu_usage_percent = 42.5f;
  metrics.memory_usage_percent = 61.0f;
  metrics.storage_usage_percent = 73.0f;
  metrics.network_throughput_kbps = 512.5f;
  metrics.storage_devices.push_back({"external-volume", "External drive", 42.0f});
  companion_set_system_metrics(metrics);
  float metric_value = 0.0f;
  assert(companion_metric_value(companion_runtime_snapshot(), "stat.cpu", metric_value));
  assert(metric_value == 42.5f);
  assert(companion_metric_value(companion_runtime_snapshot(), "stat.memory_free", metric_value));
  assert(metric_value == 39.0f);
  assert(companion_metric_value(companion_runtime_snapshot(), "stat.storage_free", metric_value));
  assert(metric_value == 27.0f);
  assert(companion_metric_key_valid("stat.storage:external-volume"));
  assert(!companion_metric_key_valid("stat.cpu:external-volume"));
  assert(!companion_metric_key_valid("stat.storage:"));
  assert(companion_metric_value(companion_runtime_snapshot(), "stat.storage:external-volume", metric_value));
  assert(metric_value == 42.0f);
  assert(companion_metric_value(companion_runtime_snapshot(), "stat.storage_free:external-volume", metric_value));
  assert(metric_value == 58.0f);
  assert(!companion_metric_value(companion_runtime_snapshot(), "stat.storage:missing-volume", metric_value));
  metrics.storage_devices.clear();
  companion_set_system_metrics(metrics);
  assert(!companion_metric_value(companion_runtime_snapshot(), "stat.storage:external-volume", metric_value));
  assert(companion_metric_value(companion_runtime_snapshot(), "stat.network_throughput", metric_value));
  assert(metric_value == 512.5f / 1024.0f);
  assert(!companion_metric_value(companion_runtime_snapshot(), "stat.battery", metric_value));
  assert(companion_return_home_on_app_switch());
  companion_set_return_home_on_app_switch(false);
  assert(!companion_return_home_on_app_switch());
  companion_set_return_home_on_app_switch(true);
  assert(companion_return_home_on_app_switch());
  companion_set_focused_action("com.apple.Safari");
  assert(companion_pending_auto_subpage_action() == "com.apple.Safari");
  assert(companion_consume_auto_subpage_action("com.apple.Safari"));
  assert(companion_pending_auto_subpage_action().empty());
  assert(companion_action_focused("com.apple.Safari"));
  assert(!companion_action_focused("com.google.Chrome"));
  assert(!companion_action_focused(folder_action));
  companion_set_focused_action(folder_action);
  assert(companion_action_focused(folder_action));
  assert(!companion_action_focused("com.apple.Safari"));
  assert(companion_consume_subpage_return_request());
  assert(companion_pending_auto_subpage_action() == "com.apple.finder");
  assert(!companion_consume_auto_subpage_action("com.apple.Safari"));
  assert(companion_consume_auto_subpage_action("com.apple.finder"));
  companion_set_focused_action(folder_action);
  assert(companion_pending_auto_subpage_action().empty());
  assert(!companion_consume_subpage_return_request());
  companion_set_focused_action("folder.second");
  assert(companion_action_focused("com.apple.finder"));
  assert(!companion_action_focused(folder_action));
  assert(!companion_consume_subpage_return_request());
  assert(companion_pending_auto_subpage_action().empty());
  companion_set_focused_action("com.apple.finder");
  assert(companion_action_focused("com.apple.finder"));
  assert(!companion_action_focused("folder.second"));
  assert(!companion_consume_subpage_return_request());
  companion_set_focused_action("com.apple.Safari");
  assert(!companion_action_focused("com.apple.finder"));
  assert(companion_consume_subpage_return_request());
  companion_set_focused_actions({"com.apple.Safari", "webapp.google-docs", "urlcard.0123456789abcdef"});
  assert(companion_action_focused("com.apple.Safari"));
  assert(!companion_action_focused("webapp.google-docs"));
  assert(companion_pending_auto_subpage_action() == "com.apple.Safari");
  assert(!companion_consume_subpage_return_request());
  assert(companion_consume_auto_subpage_action("com.apple.Safari"));
  companion_set_focused_action("");
  assert(companion_consume_subpage_return_request());
  assert(!companion_consume_subpage_return_request());
  // Manual mode clears pending navigation, keeps focus feedback, and never
  // opens or returns from a page because another app becomes focused.
  companion_set_focused_action("com.apple.Safari");
  assert(!companion_pending_auto_subpage_action().empty());
  companion_set_auto_open_app_subpages(false);
  assert(!companion_auto_open_app_subpages());
  assert(companion_pending_auto_subpage_action().empty());
  assert(!companion_consume_subpage_return_request());
  companion_set_focused_action("com.apple.finder");
  assert(companion_action_active("com.apple.finder"));
  assert(companion_pending_auto_subpage_action().empty());
  assert(!companion_consume_subpage_return_request());
  companion_set_focused_actions({"com.apple.Safari", "webapp.google-docs"});
  assert(!companion_action_active("webapp.google-docs"));
  assert(companion_pending_auto_subpage_action().empty());
  assert(!companion_consume_subpage_return_request());
  companion_set_auto_open_app_subpages(true);
  assert(companion_auto_open_app_subpages());
  assert(companion_pending_auto_subpage_action().empty());
  companion_set_focused_action("com.apple.finder");
  assert(companion_pending_auto_subpage_action() == "com.apple.finder");
  assert(companion_consume_subpage_return_request());
  assert(companion_consume_auto_subpage_action("com.apple.finder"));
  companion_set_focused_action("");
  companion_consume_subpage_return_request();
  assert(companion_volume_control_valid("media.output_volume"));
  assert(companion_volume_control_valid("media.input_volume"));
  assert(!companion_volume_control_valid("media.screen_brightness"));
  companion_set_value("media.output_volume", 72);
  int output_volume = 0;
  assert(companion_value("media.output_volume", output_volume));
  assert(output_volume == 72);
  companion_remove_value("media.output_volume");
  assert(!companion_value("media.output_volume", output_volume));
  companion_set_focused_actions({"com.apple.Safari", "webapp.google-docs"});
  companion_runtime_service().set_application_highlight("com.apple.finder");
  assert(companion_action_active("com.apple.finder", true));
  assert(!companion_action_active("com.apple.Safari", true));
  assert(!companion_action_active("com.apple.finder"));
  assert(!companion_action_active("webapp.google-docs", true));
  companion_set_focused_actions({"folder.one"});
  assert(companion_action_active("com.apple.finder", true));
  assert(companion_action_active("folder.one"));
  int guarded_invocations = 0;
  companion_set_keyboard_actions_supported(true);
  std::string shortcut_target;
  register_companion_action_sender([&](const std::string &, const std::string &, const std::string &, const std::string &app) {
    shortcut_target = app;
    ++guarded_invocations; return true;
  });
  companion_set_focused_actions({"A"});
  companion_runtime_service().set_application_highlight("B");
  assert(!invoke_companion_action_for_app("shortcut.control+w", "guard-B", "B"));
  assert(!invoke_companion_action_for_app("shortcut.control+w", "guard-A", "A"));
  assert(guarded_invocations == 0);
  companion_set_focused_actions({"B"});
  assert(invoke_companion_action_for_app("shortcut.control+w", "confirmed-B", "B"));
  assert(guarded_invocations == 1);
  assert(invoke_companion_action_for_app("shortcut.control+w", "standalone", ""));
  assert(guarded_invocations == 2);
  assert(companion_shortcut_action_valid("shortcut.scoped.command+k~command+s"));
  assert(companion_shortcut_action_valid("shortcut.scoped.shift+keypadenter"));
  assert(!companion_shortcut_action_valid("shortcut.scoped.a~b~c~d"));
  assert(!companion_shortcut_action_valid("shortcut.scoped.command+command+a"));
  assert(!invoke_companion_action_for_app("shortcut.scoped.space", "unscoped", ""));
  assert(invoke_companion_action_for_app("shortcut.scoped.space", "app-preset", "", "new_window", "org.videolan.vlc:12"));
  assert(shortcut_target == "org.videolan.vlc");
  companion_set_value("media.output_volume", 72);
  bool volume_invoked = false;
  register_companion_value_sender([&volume_invoked](const std::string &control, int value,
                                                     const std::string &request) {
    volume_invoked = control == "media.output_volume" && value == 64 && request == "volume-1";
    return volume_invoked;
  });
  assert(!invoke_companion_value("media.output_volume", -1, "volume-toggle"));
  assert(!volume_invoked);
  assert(invoke_companion_value("media.output_volume", 64, "volume-1"));
  assert(volume_invoked);
  std::string mute_control, mute_request;
  int mute_value = -1;
  register_companion_value_sender([&](const std::string &control, int value, const std::string &request) {
    mute_control = control; mute_value = value; mute_request = request; return true;
  });
  assert(!companion_toggle_mute("media.input_mute")); // No confirmed state yet.
  for (const auto *control : {"media.input_mute", "media.output_mute"}) {
    companion_set_value(control, 0);
    assert(companion_toggle_mute(control));
    assert(mute_control == control && mute_value == 100 && !mute_request.empty());
    companion_set_value(control, 100);
    assert(companion_toggle_mute(control));
    assert(mute_value == 0);
    assert(!invoke_companion_value(control, 50, "invalid-mute"));
    companion_remove_value(control);
    assert(!companion_toggle_mute(control));
  }
  companion_set_value("media.input_mute", 100);
  companion_set_connected(false);
  assert(!companion_toggle_mute("media.input_mute"));
  companion_set_connected(true);

  assert(companion_url_available("com.apple.Safari", url_config));
  assert(companion_url_available("com.google.Chrome", url_config));
  assert(companion_url_available("system.default_browser", url_config));
  // A valid URL card can be matched against the active tab by its configured URL.
  companion_set_focused_application("com.apple.Safari");
  assert(companion_application_focused("com.apple.Safari"));
  assert(companion_card_focus_allowed(url_config));
  assert(companion_card_focus_allowed(""));
  assert(companion_action_available(folder_action));
  bool invoked = false;
  register_companion_url_sender([&invoked](const std::string &url, const std::string &request, bool new_window) {
    invoked = url.rfind("https%3A%2F%2F", 0) == 0 &&
              (new_window ? request == "test-window" : request == "test-tab");
    return invoked;
  });
  ParsedCfg url_card;
  url_card.type = "companion";
  url_card.sensor = url_config;
  assert(invoke_companion_url(url_config, "test-tab", companion_url_opens_new_window(url_card)));
  assert(invoked);
  url_card.options = "url_open_behavior=new_window";
  url_card = normalize_parsed_cfg(url_card);
  assert(invoke_companion_url(url_config, "test-window", companion_url_opens_new_window(url_card)));
  bool navigated = false;
  companion_expect_action_result("launch-1", [&navigated]() { navigated = true; });
  companion_deliver_action_result("another-request", "performed");
  assert(!navigated);
  companion_deliver_action_result("launch-1", "not_allowed");
  assert(!navigated);
  companion_deliver_action_result("launch-1", "performed");
  assert(!navigated);
  companion_expect_action_result("launch-2", [&navigated]() { navigated = true; });
  companion_deliver_action_result("launch-2", "performed");
  assert(!navigated);
  companion_expect_action_result("launch-3", [&navigated]() { navigated = true; });
  companion_deliver_action_result("launch-3", "opened");
  assert(!navigated);
  companion_expect_action_result("launch-4", [&navigated]() { navigated = true; });
  companion_deliver_action_result("launch-4", "activated");
  assert(navigated);
  navigated = false;
  companion_expect_action_result("launch-focus", "com.apple.Safari",
                                 [&navigated]() { navigated = true; });
  companion_set_focused_application("com.apple.Safari");
  assert(navigated);
  companion_deliver_action_result("launch-focus", "activated");
  assert(navigated);
  int completion_order = 0;
  int first_completion = 0;
  int second_completion = 0;
  assert(companion_expect_action_result("parallel-1", [&]() {
    first_completion = ++completion_order;
  }, 100));
  assert(companion_expect_action_result("parallel-2", [&]() {
    second_completion = ++completion_order;
  }, 200));
  companion_deliver_action_result("parallel-2", "activated");
  companion_deliver_action_result("parallel-1", "activated");
  assert(second_completion == 1);
  assert(first_completion == 2);
  assert(companion_expect_action_result("expires", [&]() {
    completion_order++;
  }, 300));
  assert(companion_expire_action_results(299) == 0);
  assert(companion_expire_action_results(300) == 1);
  companion_deliver_action_result("expires", "activated");
  assert(completion_order == 2);
  for (size_t index = 0; index < CompanionPendingActions::MAX_PENDING; index++) {
    assert(companion_expect_action_result("bounded-" + std::to_string(index), []() {}));
  }
  assert(!companion_expect_action_result("bounded-overflow", []() {}));
  companion_cancel_action_result();
  companion_set_timezone_id("Europe/London");
  assert(companion_timezone_id() == "Europe/London");
  assert(companion_timezone_changed());
  assert(companion_take_timezone_changed());
  assert(!companion_timezone_changed());
  companion_set_connected(false);
  assert(!companion_url_available("system.default_browser", url_config));
  assert(!invoke_companion_url(url_config, "offline-url"));
  assert(companion_consume_subpage_return_request());
  companion_set_timezone_id("");
  assert(companion_timezone_id().empty());
  assert(companion_timezone_changed());
  assert(companion_take_timezone_changed());
  assert(!companion_timezone_changed());
  assert(!companion_metric_value(companion_runtime_snapshot(), "stat.cpu", metric_value));
  assert(!companion_application_focused("com.apple.Safari"));
  assert(!companion_action_active("media.play_pause"));
  companion_set_connected(true);
  assert(!companion_action_available("media.play_pause"));
  assert(!companion_value("media.output_volume", output_volume));
  return 0;
}
