#include <cassert>
#include <string>

struct lv_obj_t {};
inline void lv_label_set_text(lv_obj_t *, const char *) {}

#include "companion_controls.h"
#include "companion_timezone.h"
#include "button_grid_config_parser.h"
#include "button_grid_saved_config_static_generated.h"
#define ESPDESKTOP_SUBPAGE_PARSER_ONLY
#include "button_grid_subpages.h"
#include "finder_folder_sync.h"
#include "obs_live_subpage.h"

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
  {
    const std::string base = "appleshortcut.workflow;Shortcut;Flash;Auto;;;companion;;";
    assert(apple_shortcut_workflow_icon(parse_cfg(base)));
    const auto custom_flash = parse_cfg(base + "custom_icon,card_off_color=FF6363");
    assert(!apple_shortcut_workflow_icon(custom_flash));
    assert(custom_flash.icon == "Flash" && custom_flash.options == "custom_icon,card_off_color=FF6363");
    const auto legacy_custom = parse_cfg("appleshortcut.workflow;Shortcut;Timer;Auto;;;companion;;");
    assert(!apple_shortcut_workflow_icon(legacy_custom));
    const auto custom_subpage = parsed_cfg_from_subpage_btn(
        parse_subpage_config("~B,1|CP,appleshortcut.workflow,Shortcut,Flash,,,,,custom_icon").at(0));
    assert(!apple_shortcut_workflow_icon(custom_subpage));
    assert(cfg_option_token_present(custom_subpage.options, "custom_icon"));
    assert(companion_card_options_normalized(parse_cfg("com.apple.Safari;Safari;Flash;Auto;;;companion;;custom_icon")).empty());
  }
  {
    const std::string id = "appleshortcut.colored";
    const std::vector<CompanionAction> initial{{id, "Shortcut"}};
    auto colored = initial;
    colored.front().shortcut_color = 0;
    assert(apple_shortcut_catalogue_color(colored, id) == 0);
    assert(!apple_shortcut_catalogue_color(initial, id));
    assert(!apple_shortcut_catalogue_color(colored, "folder.home"));
    assert(initial != colored && !live_companion_catalogue_equal(initial, colored));
  }
  {
    const std::string a(32, 'a'), b(32, 'b'), c(32, 'c');
    const std::string prefix = "obs.transition.select.";
    const std::string token = ".11111111-1111-1111-1111-111111111111";
    CompanionRuntimeSnapshot snapshot;
    snapshot.actions = {{prefix + a + token, "Fade"}, {prefix + b, "Cut"}, {prefix + c + token, "Slide"}};
    const auto catalogue = obs_subpage_catalogue(snapshot, OBSSubpageKind::transitions);
    assert(catalogue.size() == 3 && catalogue.front().id == prefix + a);
    const auto folder = parse_cfg(";;Flip Horizontal;Auto;;;subpage;;subpage_kind=obs_transitions,obs_transition_order=" +
                                  c + "|!" + a);
    std::vector<SubpageBtn> cards{{"obs.take", "Take Live", "Arrow Right", "Auto", "", "", "companion", "", ""}};
    SubpageOrder order;
    parse_subpage_order("B,1", 4, cards.size(), order);
    normalize_subpage_order_spans(order, 4, 2);
    project_obs_subpage_tiles(order, cards, 4, 2, 4, catalogue, folder.options, OBSSubpageKind::transitions);
    assert(cards.size() == 3 && cards[0].entity == "obs.take" && cards[1].entity == prefix + c && cards[2].entity == prefix + b);
    assert(order.positions[1] == 1 && order.positions[2] == 2 && order.positions[3] == 3);
  }
  {
    const std::string camera = "obs.source." + std::string(32, 'a');
    const std::string game = "obs.source." + std::string(32, 'b');
    const std::string marker = "obs.source.visible." + std::string(32, 'a');
    const std::string command = camera + ".11111111-1111-1111-1111-111111111111";
    CompanionRuntimeSnapshot snapshot;
    snapshot.connected = true;
    snapshot.actions = {{"obs.sources", "Preview"}, {command, "Camera"}, {marker, "Camera"}, {game, "Game"}};
    const auto catalogue = obs_subpage_catalogue(snapshot, OBSSubpageKind::sources);
    assert(catalogue.size() == 2 && catalogue.front().id == camera);
    assert(companion_action_available(snapshot, camera) && !companion_action_available(snapshot, game));
    std::vector<SubpageBtn> cards;
    SubpageOrder order;
    parse_subpage_order("B", 4, cards.size(), order);
    project_obs_subpage_tiles(order, cards, 4, 2, 4, catalogue, "obs_source_order=!" + std::string(32, 'a'), OBSSubpageKind::sources);
    assert(cards.size() == 1 && cards.front().entity == game);
  }
  {
    const std::string mic = "obs.level.33333333-3333-3333-3333-333333333333";
    const std::string game = "obs.level.44444444-4444-4444-4444-444444444444";
    const std::string music = "obs.level.55555555-5555-5555-5555-555555555555";
    CompanionRuntimeSnapshot snapshot;
    snapshot.actions = {{mic, "Mic"}, {"obs.level.invalid", "Invalid"}, {game, "Game"}, {music, "Music"}};
    const auto catalogue = obs_subpage_catalogue(snapshot, OBSSubpageKind::audio);
    assert(catalogue.size() == 3 && catalogue.front().id == mic);
    const auto folder = parse_cfg(";;Microphone;Auto;;;subpage;;subpage_kind=obs_audio,obs_audio_order=" +
                                  std::string(32, '5') + "|!" + std::string(32, '3'));
    std::vector<SubpageBtn> cards{{"obs.take", "Take Live", "Arrow Right", "Auto", "", "", "companion", "", ""}};
    SubpageOrder order;
    parse_subpage_order("B,1", 4, cards.size(), order);
    normalize_subpage_order_spans(order, 4, 2);
    project_obs_subpage_tiles(order, cards, 4, 2, 4, catalogue, folder.options, OBSSubpageKind::audio);
    assert(cards.size() == 3 && cards[0].entity == "obs.take" && cards[1].entity == music && cards[2].entity == game);
    const auto fader = parsed_cfg_from_subpage_btn(cards[1]);
    assert(fader.type == "slider" && fader.label == "Music" && fader.icon == "Microphone");
    assert(companion_volume_control_valid(fader.entity));
  }
  {
    const std::string first = "obs.target.11111111-1111-1111-1111-111111111111";
    const std::string second = "obs.target.22222222-2222-2222-2222-222222222222";
    const std::string hidden = "obs.target.33333333-3333-3333-3333-333333333333";
    const std::string token = ".44444444-4444-4444-4444-444444444444";
    CompanionRuntimeSnapshot snapshot;
    snapshot.connected = true;
    snapshot.actions = {{first + token, "Gameplay"}, {second + token, "Break"}, {hidden + token, "Wrap Up"},
                        {"obs.program.11111111-1111-1111-1111-111111111111", "Program"}};
    const auto catalogue = obs_subpage_catalogue(snapshot, OBSSubpageKind::scenes);
    assert(catalogue.size() == 3 && catalogue.front().id == first);
    const auto folder = parse_cfg(";;Image Card Loading;Auto;;;subpage;;subpage_kind=obs_scenes,obs_scene_order=" +
                                  std::string(32, '2') + "|!" + std::string(32, '3'));
    std::vector<SubpageBtn> cards;
    SubpageOrder order;
    parse_subpage_order("B", 4, cards.size(), order);
    normalize_subpage_order_spans(order, 4, 2);
    project_obs_subpage_tiles(order, cards, 4, 2, 4, catalogue, folder.options, OBSSubpageKind::scenes);
    assert(cards.size() == 2 && cards[0].entity == second && cards[1].entity == first);
    const auto scene = parsed_cfg_from_subpage_btn(cards[0]);
    assert(scene.type == "companion" && scene.label == "Break" && scene.icon == "Image Card Loading");
    assert(companion_obs_scene_card(scene.entity) && companion_action_available(snapshot, scene.entity));
    cards.clear();
    SubpageOrder after_delete;
    parse_subpage_order("B", 4, 0, after_delete);
    const auto customized = parse_cfg(";;Image Card Loading;Auto;;;subpage;;subpage_kind=obs_scenes,generated_card_exclusions=" +
                                      std::string(32, '1'));
    project_obs_subpage_tiles(after_delete, cards, 4, 2, 4, catalogue, customized.options, OBSSubpageKind::scenes);
    assert(cards.size() == 2 && cards[0].entity == second && cards[1].entity == hidden);

    cards.clear();
    SubpageOrder footer;
    parse_subpage_order("B", 9, 0, footer);
    project_obs_subpage_tiles(footer, cards, 9, 3, 9, catalogue, "", OBSSubpageKind::scenes);
    assert(cards.size() == 6);
    assert(footer.positions[7] == 1 && footer.col_span[0] == 2 && footer.positions[8] == 0);
    assert(cards[0].entity == "obs.take" && footer.positions[6] == 2 && cards[1].entity == "obs.transition");
    assert(footer.positions[5] == 3 && cards[2].entity == "obs.brb");

    std::vector<SubpageBtn> landscape_cards{{first, "Edited scene", "Image", "Auto", "", "", "companion", "", ""}};
    SubpageOrder landscape;
    parse_subpage_order("B,1b", 15, landscape_cards.size(), landscape);
    normalize_subpage_order_spans(landscape, 15, 5);
    project_obs_subpage_tiles(landscape, landscape_cards, 15, 5, 15, catalogue,
        "generated_card_exclusions=" + std::string(32, '3'), OBSSubpageKind::scenes);
    assert(landscape.positions[1] == 1 && landscape.col_span[0] == 2 && landscape.row_span[0] == 2);
    assert(landscape.positions[13] == 2 && landscape.col_span[1] == 2 && landscape_cards[1].entity == "obs.take");
    assert(landscape_cards.size() == 5 && landscape_cards.back().entity == second);

    CompanionRuntimeSnapshot blocked = snapshot;
    blocked.actions[0].obs_available = false;
    assert(!companion_action_available(blocked, first));

    cards.resize(1);
    SubpageOrder manual_take;
    parse_subpage_order("B,1", 9, 1, manual_take);
    project_obs_subpage_tiles(manual_take, cards, 9, 3, 9, catalogue,
        "generated_card_exclusions=brb", OBSSubpageKind::scenes);
    assert(manual_take.positions[1] == 1 && manual_take.col_span[0] == 1);
    assert(cards.size() == 5 && cards[1].entity == "obs.transition");


  }
  assert_finder_folder_projection();
  for (const std::string_view hidden : {"inactive|hidden", "v1.JTckIJacIAYKAAxN8jFSi5"}) {
    const std::string saved_id = "appleshortcut.saved";
    const std::string new_id = "appleshortcut.new";
    auto buttons = parse_subpage_config("~B,1|CP,appleshortcut.saved,Saved,Flash|CP,appleshortcut.hidden,Hidden,Flash");
    SubpageOrder order;
    parse_subpage_order("B,1", 4, buttons.size(), order);
    normalize_subpage_order_spans(order, 4, 2);
    project_apple_shortcut_tiles(order, buttons, 4, 2, 3,
        {{saved_id, "Saved"}, {"appleshortcut.hidden", "Hidden"}, {new_id, "New"},
         {"appleshortcut.extra", "Extra"}, {"folder.project", "Project"}}, hidden);
    assert(order.back_pos == 0 && order.positions[1] == 1 && order.positions[2] == 2 && order.positions[3] == 0);
    assert(buttons.size() == 2 && buttons.front().entity == saved_id && buttons.back().entity == new_id);
  }
  const auto mac_lock = normalize_parsed_cfg(
      ParsedCfg{"shortcut.command+a", "", "", "", "url.invalid", "%", "companion_mac_lock", "1", ""});
  assert(mac_lock.entity == "shortcut.command+control+q" && mac_lock.sensor.empty());
  assert(mac_lock.label == "Lock Machine" && mac_lock.icon == "Lock");
  for (const auto *type : {"companion", "companion_mac_lock"}) {
    const auto legacy = normalize_parsed_cfg(
        ParsedCfg{mac_lock.entity, "Mac Lock", "Shield", "Auto", "", "", type, "", ""});
    assert(legacy.type == mac_lock.type && legacy.label == mac_lock.label && legacy.icon == "Shield");
  }
  const auto explicit_shortcut = normalize_parsed_cfg(
      ParsedCfg{mac_lock.entity, "Mac Lock", "Lock", "Auto", "", "", "companion", "", "app_shortcut_preset=custom"});
  assert(explicit_shortcut.type == "companion" && explicit_shortcut.label == "Mac Lock");
  const auto mac_lock_subpage = parse_subpage_config("~1|ML,,Lock Work Mac,Shield");
  assert(mac_lock_subpage.size() == 1);
  const auto subpage_lock = parsed_cfg_from_subpage_btn(mac_lock_subpage.front());
  assert(subpage_lock.type == mac_lock.type && subpage_lock.entity == mac_lock.entity);
  assert(subpage_lock.label == "Lock Work Mac" && subpage_lock.icon == "Shield");
  const auto lock_runtime = espdesktop::cards::card_runtime_registry_service().context_for(
      mac_lock.type, mac_lock.sensor);
  assert(lock_runtime.runtime.driver == espdesktop::card_runtime::CardDriverId::COMPANION);
  assert(lock_runtime.allow_in_subpage && companion_shortcut_action_valid(mac_lock.entity));

  const auto shortcuts_page = normalize_parsed_cfg(ParsedCfg{
      "", "Apple Shortcuts", "Flash", "Auto", "", "", "subpage", "",
      "subpage_connector=mac_companion,subpage_kind=apple_shortcuts"});
  assert(shortcuts_page.type == "subpage" && shortcuts_page.entity.empty() && shortcuts_page.sensor.empty());
  assert(shortcuts_page.label == "Apple Shortcuts" && shortcuts_page.icon == "Flash");
  assert(cfg_option_value(shortcuts_page.options, "subpage_kind") == "apple_shortcuts");
  assert(!companion_app_shortcuts_enabled(shortcuts_page));

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
    assert(runtime.app_subpage_mode() == CompanionAppSubpageMode::CARD);
    assert(runtime.pending_auto_subpage_action().empty());
    runtime.set_app_subpage_mode(CompanionAppSubpageMode::FOCUS);
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
    runtime.set_app_subpage_mode(CompanionAppSubpageMode::FOCUS);
    runtime.set_focused_actions({"first.app"});
    assert(runtime.take_wake_subpage_action() == "first.app");
    assert(runtime.pending_auto_subpage_action().empty());
    assert(runtime.take_wake_subpage_action() == "first.app");  // No new focus event required.
    runtime.set_focused_actions({"second.app"});
    assert(runtime.take_wake_subpage_action() == "second.app");
    runtime.set_app_subpage_mode(CompanionAppSubpageMode::MANUAL);
    assert(runtime.take_wake_subpage_action().empty());
    runtime.set_app_subpage_mode(CompanionAppSubpageMode::FOCUS);
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
  assert(live_companion_catalogue_equal(folders, folders));
  assert(!live_companion_catalogue_equal(folders, {{"folder.one", "Different"}, folders[1]}));

  // Exercise the real translation tables at the device-label boundary.
  assert(std::string(companion_volume_control_label("media.input_mute")) == "Input State");
  assert(std::string(companion_volume_control_label("media.output_mute")) == "Mute");
  set_espdesktop_language("de");
  assert(std::string(companion_volume_control_label("media.input_mute")) == "Eingangsstatus");
  assert(std::string(companion_volume_control_label("media.output_volume")) == "Lautstärke");
  assert(std::string(companion_volume_control_label("media.input_volume")) == "Mikro");
  assert(companion_default_action_label("", "url.https%3A%2F%2Fexample.com") == "URL öffnen");
  assert(companion_default_action_label("") == "Anwendung");
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
  {
    CompanionRuntimeSnapshot obs;
    const std::string take_action = "obs.take.45f44c62-1c70-4706-8930-f3ec000db026";
    obs.actions = {{take_action, "Take Live: BRB"}, {"obs.status.stream", "Stream: Live"}};
    obs.connected = true;
    assert(companion_action_available(obs, "obs.take"));
    assert(companion_published_action(obs, "obs.take")->id == take_action);
    assert(companion_default_action_label("obs.take", "", &obs) == "Take Live: BRB");
    const std::string record_action = "obs.output.record.45f44c62-1c70-4706-8930-f3ec000db026";
    obs.actions.push_back({record_action, "Start Recording"});
    assert(companion_obs_output_card("obs.output.record"));
    assert(!companion_obs_output_card(record_action));
    for (const auto *mode : {"", "both", "unknown"}) {
      assert(companion_obs_needs_confirmation("obs.output.record", mode, "Start Recording"));
      assert(companion_obs_needs_confirmation("obs.output.record", mode, "Stop Recording"));
    }
    assert(companion_obs_needs_confirmation("obs.output.stream", "on", "Start Streaming"));
    assert(!companion_obs_needs_confirmation("obs.output.stream", "on", "Stop Streaming"));
    assert(!companion_obs_needs_confirmation("obs.output.stream", "off", "Start Streaming"));
    assert(companion_obs_needs_confirmation("obs.output.stream", "off", "Stop Streaming"));
    assert(companion_obs_needs_confirmation("obs.output.stream", "on", "Unknown direction"));
    assert(!companion_obs_needs_confirmation("obs.output.record", "none", "Start Recording"));
    assert(!companion_obs_needs_confirmation("obs.replay.buffer", "", "Legacy label", OBSCardState::toggle_off));
    assert(companion_obs_needs_confirmation("obs.replay.buffer", "", "Legacy label", OBSCardState::toggle_on));
    assert(companion_obs_needs_confirmation("obs.output.record", "off", "Legacy label", OBSCardState::output_paused));
    for (const auto *toggle : {"obs.studio", "obs.replay.buffer"}) {
      assert(companion_obs_confirmation_supported(toggle));
      assert(!companion_obs_needs_confirmation(toggle, "", "Off"));
      assert(companion_obs_needs_confirmation(toggle, "", "On"));
      assert(companion_obs_needs_confirmation(toggle, "on", "Off"));
      assert(!companion_obs_needs_confirmation(toggle, "on", "On"));
      assert(companion_obs_needs_confirmation(toggle, "both", "Off"));
      assert(companion_obs_needs_confirmation(toggle, "both", "On"));
      assert(!companion_obs_needs_confirmation(toggle, "none", "On"));
    }
    assert(companion_action_available(obs, "obs.output.record"));
    assert(!companion_action_available(obs, "obs.output.stream"));
    assert(companion_published_action(obs, "obs.output.record")->id == record_action);
    assert(companion_default_action_label("obs.output.record", "", &obs) == "Start Recording");
    const std::string brb_action = "obs.brb.45f44c62-1c70-4706-8930-f3ec000db026";
    obs.actions.push_back({brb_action, "Resume"});
    assert(companion_action_available(obs, "obs.brb"));
    assert(companion_published_action(obs, "obs.brb")->id == brb_action);
    obs.actions.back() = {"obs.brb", "BRB Check OBS"};
    assert(!companion_action_available(obs, "obs.brb"));
    assert(companion_default_action_label("obs.brb", "", &obs) == "BRB Check OBS");
    const std::string adaptive_scene = "obs.target.69da3f8f-7f62-4abe-a594-4e40dd579858";
    const std::string armed_scene = adaptive_scene + ".45f44c62-1c70-4706-8930-f3ec000db026";
    obs.actions.push_back({armed_scene, "Preview Gameplay"});
    assert(companion_obs_scene_target(adaptive_scene));
    assert(!companion_obs_scene_target(armed_scene));
    assert(companion_action_available(obs, adaptive_scene));
    assert(companion_published_action(obs, adaptive_scene)->id == armed_scene);
    assert(companion_obs_status_card("obs.status.stream"));
    obs.connected = false;
    assert(!companion_action_available(obs, "obs.take"));
    assert(companion_default_action_label("obs.status.stream", "", &obs) == espdesktop_i18n("Unavailable"));
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
  assert(companion_default_action_label("") == "Application");
  assert(companion_metric_card_should_disable(false, false));
  assert(!companion_metric_card_should_disable(false, true));
  assert(!companion_metric_card_should_disable(true, false));

  const std::string folder_action = "folder.00000000-0000-0000-0000-000000000001";
  int focus_registration_updates = 0;
  companion_set_focus_registrations({});
  companion_focus_registrations_changed_handler() = [&focus_registration_updates] {
    ++focus_registration_updates;
  };
  const std::string focus_url = "https://example.com/";
  const std::string focus_url_id = companion_url_card_focus_id(
      "url." + companion_encode_url_focus_value(focus_url));
  companion_set_focus_registrations({{focus_url_id, focus_url}});
  assert(focus_registration_updates == 1);
  companion_set_focus_registrations({{focus_url_id, focus_url}});
  assert(focus_registration_updates == 1);
  companion_focus_registrations_changed_handler() = {};
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
  companion_set_app_subpage_mode("card");
  assert(companion_app_subpage_opens_on_press("com.apple.Safari"));
  companion_set_app_subpage_mode("focus");
  assert(!companion_app_subpage_opens_on_press("com.apple.Safari"));
  companion_set_focused_action("com.apple.Safari");
  assert(companion_app_subpage_opens_on_press("com.apple.Safari"));
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
  companion_set_app_subpage_mode("manual");
  assert(companion_app_subpage_manual());
  assert(!companion_app_subpage_opens_on_press("com.apple.finder"));
  assert(companion_pending_auto_subpage_action().empty());
  assert(!companion_consume_subpage_return_request());
  companion_set_focused_action("com.apple.finder");
  assert(companion_action_active("com.apple.finder"));
  assert(companion_app_subpage_opens_on_press("com.apple.finder"));
  assert(companion_pending_auto_subpage_action().empty());
  assert(!companion_consume_subpage_return_request());
  companion_set_focused_actions({"com.apple.Safari", "webapp.google-docs"});
  assert(!companion_action_active("webapp.google-docs"));
  assert(companion_pending_auto_subpage_action().empty());
  assert(!companion_consume_subpage_return_request());
  companion_set_app_subpage_mode("focus");
  assert(!companion_app_subpage_manual());
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

  CompanionCatalogueLimits catalogue_limits;
  for (int index = 0; index < 256; ++index)
    assert(catalogue_limits.retain("obs.scene." + std::to_string(index), false));
  assert(!catalogue_limits.retain("obs.status.stream", false));
  assert(catalogue_limits.retain("obs.sources", false));
  for (int index = 0; index < 96; ++index)
    assert(catalogue_limits.retain("obs.source." + std::to_string(index), false));
  assert(!catalogue_limits.retain("obs.source.overflow", false));
  for (int index = 0; index < 16; ++index)
    assert(catalogue_limits.retain("input.level." + std::to_string(index), true));
  assert(!catalogue_limits.retain("input.level.overflow", true));
  for (int index = 0; index < 256; ++index)
    assert(catalogue_limits.retain("com.example.App" + std::to_string(index), false));
  assert(!catalogue_limits.retain("com.example.Overflow", false));

  const char *system_controls[] = {"media.output_volume", "media.input_volume",
                                  "media.output_mute", "media.input_mute", "media.cough"};
  for (const auto *control : system_controls) companion_set_value(control, 100);
  for (int index = 0; index < 256; ++index) {
    const std::string id = "app.volume.com.example.Player" + std::to_string(index);
    companion_set_value(id, 35);
    int level = 0;
    assert(companion_value(id, level) && level == 35);
  }
  for (int index = 0; index < 16; ++index) {
    const std::string id = "input.level." + std::string(63, 'a') + "0123456789abcdef"[index];
    companion_set_value(id, 45);
    int level = 0;
    assert(companion_value(id, level) && level == 45);
  }
  const std::string obs_level = "obs.level.69da3f8f-7f62-4abe-a594-4e40dd579858";
  const std::string obs_meter = "obs.meter.69da3f8f-7f62-4abe-a594-4e40dd579858";
  assert(companion_writable_value_control_valid(obs_level));
  assert(!companion_writable_value_control_valid(obs_meter));
  companion_set_value(obs_level, 72);
  companion_set_value(obs_meter, 85);
  assert(companion_value(obs_level, output_volume) && output_volume == 72);
  assert(!companion_value(obs_meter, output_volume));
  companion_remove_value(obs_level);
  companion_remove_value(obs_meter);
  const std::string overflow_input = "input.level." + std::string(64, 'b');
  companion_set_value(overflow_input, 45);
  assert(!companion_value(overflow_input, output_volume));
  companion_set_value("app.volume.com.example.Overflow", 35);
  assert(!companion_value("app.volume.com.example.Overflow", output_volume));
  for (int index = 0; index < 256; ++index)
    companion_remove_value("app.volume.com.example.Player" + std::to_string(index));
  for (const auto *control : system_controls) companion_remove_value(control);
  for (int index = 0; index < 16; ++index)
    companion_remove_value("input.level." + std::string(63, 'a') + "0123456789abcdef"[index]);
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
  std::string shortcut_target, sent_action, sent_request;
  register_companion_action_sender([&](const std::string &action, const std::string &request, const std::string &, const std::string &app) {
    sent_action = action;
    sent_request = request;
    shortcut_target = app;
    ++guarded_invocations; return true;
  });
  companion_set_focused_actions({"A"});
  companion_runtime_service().set_application_highlight("B");
  assert(!invoke_companion_action_for_app("shortcut.control+w", "guard-B", "B", "new_window", "custom", 0));
  assert(!invoke_companion_action_for_app("shortcut.control+w", "guard-A", "A", "new_window", "custom", 0));
  assert(guarded_invocations == 0);
  companion_set_focused_actions({"B"});
  assert(invoke_companion_action_for_app("shortcut.control+w", "confirmed-B", "B", "new_window", "custom", 0));
  assert(guarded_invocations == 1);
  assert(invoke_companion_action_for_app("shortcut.control+w", "standalone", "", "new_window", "custom", 0));
  assert(guarded_invocations == 2 && sent_action == "shortcut.control+w" && shortcut_target.empty());
  assert(companion_shortcut_action_valid("shortcut.scoped.command+k~command+s"));
  assert(companion_shortcut_action_valid("shortcut.scoped.shift+keypadenter"));
  assert(!companion_shortcut_action_valid("shortcut.scoped.a~b~c~d"));
  assert(!companion_shortcut_action_valid("shortcut.scoped.command+command+a"));
  assert(!invoke_companion_action_for_app("shortcut.scoped.space", "unscoped", "", "new_window", "custom", 0));
  assert(companion_app_scoped_shortcut("shortcut.command+w") == "shortcut.scoped.command+w");
  assert(companion_app_scoped_shortcut("shortcut.escape-twice") == "shortcut.scoped.escape~escape");
  assert(companion_app_scoped_shortcut("shortcut.scoped.command+k~command+s") ==
         "shortcut.scoped.command+k~command+s");
  assert(companion_app_scoped_shortcut("com.apple.Safari").empty());
  const auto original_actions = companion_runtime_snapshot().actions;
  companion_set_actions({{"com.apple.Safari", "Safari"}});
  {
    constexpr auto preset = "com.apple.Safari:0";
    const int before = guarded_invocations;
    assert(invoke_companion_action_for_app("shortcut.command+w", "preset", "", "new_window", preset, 0));
    assert(guarded_invocations == before + 1 && sent_action == "com.apple.Safari" && shortcut_target.empty());
    companion_deliver_action_result("other-preset", "activated");
    assert(guarded_invocations == before + 1);
    companion_deliver_action_result("preset", "activated");
    companion_deliver_action_result("preset", "activated");
    assert(guarded_invocations == before + 2 && sent_action == "shortcut.scoped.command+w");
    assert(sent_request == "preset-keys" && shortcut_target == "com.apple.Safari");

    assert(invoke_companion_action_for_app("shortcut.scoped.tab", "preset-denied", "", "new_window", preset, 0));
    companion_deliver_action_result("preset-denied", "not_allowed");
    assert(guarded_invocations == before + 3 && sent_action == "com.apple.Safari");
    assert(!invoke_companion_action_for_app("shortcut.command+w", "missing", "", "new_window", "com.example.Missing:0", 0));
    assert(guarded_invocations == before + 3);

    companion_set_focused_action("com.apple.Safari");
    assert(invoke_companion_action_for_app("shortcut.command+w", "same-app", "com.apple.Safari", "new_window", preset, 0));
    assert(guarded_invocations == before + 4 && sent_action == "shortcut.scoped.command+w");
    assert(sent_request == "same-app" && shortcut_target == "com.apple.Safari");
  }
  companion_set_actions({{"com.adobe.PremierePro.26", "Premiere Pro"}});
  assert(companion_shortcut_launch_target("com.adobe.PremierePro") == "com.adobe.PremierePro.26");
  const std::string web_app = "com.apple.Safari.WebApp.01234567-89ab-cdef-0123-456789abcdef";
  const std::string other_web_app = "com.apple.Safari.WebApp.11234567-89ab-cdef-0123-456789abcdef";
  companion_set_actions({{web_app, "Web App"}, {other_web_app, "Other Web App"}});
  assert(companion_shortcut_launch_target("com.apple.Safari.WebApp").empty());
  companion_set_focused_action(web_app);
  assert(companion_shortcut_launch_target("com.apple.Safari.WebApp") == web_app);
  companion_set_actions({{"com.apple.Safari", "Safari"}});
  const int before_launch = guarded_invocations;
  int shortcut_runs = 0;
  assert(companion_activate_then("com.apple.Safari", "ha-launch", 1000, [&]() { ++shortcut_runs; }));
  assert(guarded_invocations == before_launch + 1);
  assert(shortcut_runs == 0);
  companion_deliver_action_result("other-launch", "activated");
  assert(shortcut_runs == 0);
  companion_deliver_action_result("ha-launch", "activated");
  companion_deliver_action_result("ha-launch", "activated");
  assert(shortcut_runs == 1);
  assert(companion_activate_then("com.apple.Safari", "ha-denied", 1000, [&]() { ++shortcut_runs; }));
  companion_deliver_action_result("ha-denied", "not_allowed");
  assert(shortcut_runs == 1);
  assert(!companion_activate_then("com.example.Missing", "ha-missing", 1000, [&]() { ++shortcut_runs; }));
  companion_deliver_action_result("ha-missing", "activated");
  assert(shortcut_runs == 1);
  companion_set_actions(original_actions);
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
    const auto press_request = mute_request;
    assert(companion_value(control, output_volume) && output_volume == 0);
    assert(companion_runtime_service().displayed_mute_value(control, output_volume) == 100);
    assert(companion_toggle_mute(control)); // A second tap uses the preview.
    assert(mute_value == 0);
    companion_set_value(control, 100); // The first reply can arrive late.
    companion_deliver_action_result(press_request, "performed");
    assert(companion_runtime_service().displayed_mute_value(control, 100) == 0);
    companion_deliver_action_result(mute_request, "not_allowed");
    assert(companion_runtime_service().displayed_mute_value(control, 100) == 100);
    assert(companion_toggle_mute(control));
    companion_deliver_action_result(mute_request, "performed");
    companion_set_value(control, 0);
    companion_set_value(control, 100); // An external change wins after confirmation.
    assert(companion_runtime_service().displayed_mute_value(control, 100) == 100);
    assert(companion_toggle_mute(control));
    companion_expire_action_results(100);
    companion_expire_action_results(800);
    assert(companion_runtime_service().displayed_mute_value(control, 100) == 100);
    assert(!invoke_companion_value(control, 50, "invalid-mute"));
    companion_remove_value(control);
    assert(!companion_toggle_mute(control));
  }
  companion_set_value("media.cough", 0);
  companion_runtime_service().preview_mute("media.cough", 100, "cough-press");
  assert(companion_runtime_service().displayed_mute_value("media.cough", 0) == 100);
  companion_runtime_service().preview_mute("media.cough", 0, "cough-release");
  companion_set_value("media.cough", 100);
  companion_deliver_action_result("cough-press", "performed");
  assert(companion_runtime_service().displayed_mute_value("media.cough", 100) == 0);
  companion_deliver_action_result("cough-release", "performed");
  companion_set_value("media.cough", 0);
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

  // Apple Shortcuts report "performed" after the process exits successfully.
  // Even with all app activation slots occupied, each shortcut keeps its own result.
  int shortcut_completions = 0;
  const auto completed = [&] { shortcut_completions++; };
  const auto performed = CompanionActionSuccess::PERFORMED;
  assert(companion_expect_action_result("shortcut-first", completed, 0, performed));
  assert(companion_expect_action_result("shortcut-second", completed, 0, performed));
  assert(companion_expect_action_result("shortcut-failed", completed, 0, performed));
  assert(companion_expect_action_result("shortcut-denied", completed, 0, performed));
  assert(companion_expect_action_result("shortcut-wrong-status", completed, 0, performed));
  companion_deliver_action_result("shortcut-denied", "not_allowed");
  companion_deliver_action_result("shortcut-failed", "failed");
  companion_deliver_action_result("shortcut-wrong-status", "activated");
  assert(shortcut_completions == 0);
  companion_deliver_action_result("shortcut-second", "performed");
  assert(shortcut_completions == 1);
  companion_deliver_action_result("shortcut-first", "performed");
  companion_deliver_action_result("shortcut-second", "performed");
  assert(shortcut_completions == 2);
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

  ParsedCfg computer_card;
  computer_card.type = "companion";
  computer_card.entity = "app.example";
  assert(companion_card_computer(computer_card).empty());
  computer_card.options = "computer=0011223344556677";
  assert(companion_card_computer(computer_card) == "0011223344556677");
  computer_card.options = "computer=not-a-computer-id";
  assert(companion_card_computer(computer_card).empty());
  computer_card.type = "action";
  computer_card.options = "computer=0011223344556677";
  assert(companion_card_computer(computer_card).empty());

  // Simple Companion cards keep the per-card computer binding while dropping
  // unknown saved option tokens.
  struct SavedCard {
    std::string entity, label, icon, icon_on, sensor, unit, type, precision, options;
  };
  SavedCard volume;
  volume.type = "companion_output_volume";
  volume.options = "legacy,junk,computer=0011223344556677";
  assert(normalize_saved_config_static(volume));
  assert(volume.options == "computer=0011223344556677");
  SavedCard app_volume;
  app_volume.type = "companion_app_volume";
  app_volume.entity = "app.volume.com.example.Player";
  app_volume.options = "junk,computer=0011223344556677";
  assert(normalize_saved_config_static(app_volume));
  assert(app_volume.options == "computer=0011223344556677");
  SavedCard mac_lock_card;
  mac_lock_card.type = "companion_mac_lock";
  mac_lock_card.options = "computer=0011223344556677";
  assert(normalize_saved_config_static(mac_lock_card));
  assert(mac_lock_card.options == "computer=0011223344556677");

  // App and statistics cards keep the binding when their options are rebuilt.
  ParsedCfg app_card;
  app_card.type = "companion";
  app_card.entity = "com.apple.Safari";
  app_card.options = "computer=0011223344556677,app_shortcuts";
  const auto normalized_app = normalize_parsed_cfg(app_card);
  assert(companion_card_computer(normalized_app) == "0011223344556677");
  assert(cfg_option_token_present(normalized_app.options, "app_shortcuts"));
  ParsedCfg stat_card;
  stat_card.type = "companion";
  stat_card.entity = "stat.cpu";
  stat_card.options = "computer=0011223344556677,stat_labels_off";
  const auto normalized_stat = normalize_parsed_cfg(stat_card);
  assert(companion_card_computer(normalized_stat) == "0011223344556677");
  assert(cfg_option_token_present(normalized_stat.options, "stat_labels_off"));

  // Companion cards inside a subpage also keep the binding.
  SubpageBtn subpage_card;
  subpage_card.type = "companion";
  subpage_card.entity = "com.apple.Safari";
  subpage_card.options = "computer=0011223344556677";
  const auto normalized_subpage = normalize_subpage_btn(subpage_card);
  assert(companion_card_computer(parsed_cfg_from_subpage_btn(normalized_subpage)) ==
         "0011223344556677");
  return 0;
}
