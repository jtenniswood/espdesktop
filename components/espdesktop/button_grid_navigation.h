#pragma once

#include "button_grid_touch.h"

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

#include <functional>
#include <algorithm>
#include <vector>

#include "grid_navigation_service.h"
#include "grid_navigation_diagnostics.h"
#include "espdesktop_app_core.h"

// Implemented by button_grid_image.h; navigation calls this when a subpage
// becomes active after the S3 camera screensaver released image buffers.
inline void refresh_visible_image_cards();
inline void image_card_set_clock_bar_companion_icon(
    const std::string &entity_id, const std::string &icon_name,
    const std::string &source_url, bool use_cached_app_icon = false);
inline void navigation_refresh_subpage_label();
#ifdef USE_COMPANION
inline void companion_refresh_app_icon_visibility(bool release_hidden = false);
#endif

// ── Home Assistant-driven home-screen navigation ─────────────────────

struct NavigationHomeTargetEntry {
  int slot = 0;
  int display_order = 0;
  std::string label;
  std::string config;
  lv_obj_t *button = nullptr;
};

struct NavigationSubpageEntry {
  int parent_slot = 0;
  int slot = 0;
  int display_order = 0;
  std::string kind;
  lv_obj_t *owner_button = nullptr;
  uint64_t last_used = 0;
  lv_obj_t *screen = nullptr;
  lv_obj_t *back_button = nullptr;
  bool back_neutral_background = true;
  BtnSlot back_slot{};
  struct Card {
    int index = 0;
    lv_obj_t *button = nullptr;
    BtnSlot slot{};
    SubpageBtn definition{};
bool neutral_background = true;
    bool sensor_surface = false;
    bool secondary_surface = false;
    bool image_card = false;
    int display_order = 0;
  };
  std::vector<Card> cards;
};

inline NavigationSubpageEntry *navigation_find_slot(int slot);
inline bool navigation_restore_subpage_slot(int slot);
inline lv_obj_t *navigation_ensure_subpage(int slot);

inline std::function<lv_obj_t *(int)> &navigation_subpage_builder() {
  static std::function<lv_obj_t *(int)> builder;
  return builder;
}
inline void navigation_register_subpage(int slot, int display_order,
                                        const std::string &kind,
                                        lv_obj_t *screen);
inline void navigation_register_grid_screen_gesture(lv_obj_t *screen);

inline void navigation_release_subpage_runtime(NavigationSubpageEntry &entry);

using ButtonGridNavigationService =
    GridNavigationService<NavigationHomeTargetEntry, NavigationSubpageEntry>;

inline ButtonGridNavigationService &grid_navigation_service() {
  if (espdesktop::EspDesktopAppCore *core =
          espdesktop::active_espdesktop_app_core()) {
    return core->grid_navigation_service<ButtonGridNavigationService>();
  }
  // ESPHome may dispatch navigation cleanup while the core is still being
  // registered during startup. Preserve that state until core ownership is
  // available instead of turning the callback into a reboot.
  static ButtonGridNavigationService service;
  return service;
}

// Compatibility accessors for existing grid code. New runtime ownership lives
// in GridNavigationService so it can be migrated independently of the UI.
inline std::vector<NavigationHomeTargetEntry> &navigation_home_targets() {
  return grid_navigation_service().home_targets();
}

inline std::vector<NavigationSubpageEntry> &navigation_subpages() {
  return grid_navigation_service().subpages();
}

inline std::vector<lv_obj_t *> &navigation_grid_screens() {
  static std::vector<lv_obj_t *> screens;
  return screens;
}

inline std::string navigation_trim(const std::string &value) {
  size_t start = 0;
  while (start < value.size() &&
         std::isspace(static_cast<unsigned char>(value[start]))) {
    start++;
  }
  size_t end = value.size();
  while (end > start &&
         std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    end--;
  }
  return value.substr(start, end - start);
}

inline std::string navigation_lower(const std::string &value) {
  std::string out = value;
  for (char &ch : out) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return out;
}

inline void navigation_hide_modals() {
  control_modal_close_nested_menu();
  control_modal_force_close_active();
}

inline void navigation_close_modals_for_display_takeover() {
  control_modal_close_nested_menu();
  control_modal_force_close_active();
}

inline bool navigation_return_home(lv_obj_t *main_page_obj) {
  navigation_hide_modals();
  if (main_page_obj == nullptr) {
    ESP_LOGW("navigation", "Main page is not ready");
    return false;
  }
  if (lv_scr_act() != main_page_obj) {
    lv_scr_load_anim(main_page_obj, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
  }
  navigation_refresh_subpage_label();
  return true;
}

inline void navigation_consume_touch_press(lv_obj_t *button) {
  // Share pointer consumption and contrast restoration with other buttons.
  consume_button_touch_press(button);
}

// Present the new page before image recovery can run cached HA callbacks or
// start a camera/artwork request. Otherwise that work delays the first frame.
inline void navigation_present_page_before_image_refresh(uint32_t started) {
  lv_obj_t *screen = lv_scr_act();
  if (screen == nullptr) return;
  ESP_LOGD("ui_latency", "Navigation draw start at=%u", unsigned(esphome::millis()));
  lv_refr_now(lv_obj_get_display(screen));
  const auto drawn = esphome::millis();
  grid_navigation_diagnostics().back_frame_ms.store(drawn - started, std::memory_order_relaxed);
  ESP_LOGD("ui_latency", "Navigation draw done at=%u", unsigned(drawn));
  refresh_visible_image_cards();
  ESP_LOGD("ui_latency", "Navigation images done at=%u", unsigned(esphome::millis()));
}

inline bool navigation_display_mode_allows_grid_gesture() {
  espdesktop::EspDesktopAppCore *core =
      espdesktop::active_espdesktop_app_core();
  if (core == nullptr) return false;
  const auto is_interactive_grid_mode = [](espdesktop::DisplayMode mode) {
    return mode == espdesktop::DisplayMode::ACTIVE ||
           mode == espdesktop::DisplayMode::DIMMED;
  };
  return is_interactive_grid_mode(core->display().current_mode()) &&
         is_interactive_grid_mode(core->display().target_mode());
}

struct NavigationGridGesturePress {
  lv_indev_t *device = nullptr;
  lv_obj_t *screen = nullptr;
  lv_point_t start{};
};

inline NavigationGridGesturePress &navigation_grid_gesture_press(lv_indev_t *device) {
  static std::vector<NavigationGridGesturePress> presses;
  for (auto &press : presses) {
    if (press.device == device) return press;
  }
  presses.push_back({device, nullptr, {}});
  return presses.back();
}

inline void navigation_grid_screen_gesture(lv_event_t *event) {
  if (event == nullptr) return;
  const auto code = lv_event_get_code(event);
  if (code != LV_EVENT_PRESSED && code != LV_EVENT_RELEASED && code != LV_EVENT_GESTURE) return;
  lv_indev_t *indev = lv_indev_active();
  if (indev == nullptr) return;
  auto &press = navigation_grid_gesture_press(indev);
  if (code == LV_EVENT_PRESSED || code == LV_EVENT_RELEASED) press.screen = nullptr;
  if (code == LV_EVENT_RELEASED) return;
  if (!navigation_display_mode_allows_grid_gesture() ||
      screen_lock_enabled() || control_modal_active().overlay != nullptr ||
      control_modal_nested_active().overlay != nullptr) return;

  lv_obj_t *screen = lv_scr_act();
  if (screen == nullptr ||
      std::find(navigation_grid_screens().begin(), navigation_grid_screens().end(),
                screen) == navigation_grid_screens().end()) return;

  if (code == LV_EVENT_PRESSED) {
    press.screen = screen;
    lv_indev_get_point(indev, &press.start);
    return;
  }
  if (press.screen != screen) return;
  const lv_point_t start = press.start;
  press.screen = nullptr;
  const auto direction = lv_indev_get_gesture_dir(indev);
  if (direction == LV_DIR_RIGHT) {
    const lv_coord_t screen_width = lv_obj_get_width(screen);
    const lv_coord_t swipe_start_x = start.x;
    if (screen_width <= 0 || swipe_start_x < 0 ||
        swipe_start_x > screen_width / 6) return;

    for (const auto &entry : navigation_subpages()) {
      if (entry.screen != screen || entry.back_button == nullptr ||
          !lv_obj_is_valid(entry.back_button)) continue;
      // Use the same Back action as a direct press on the subpage.
      lv_indev_wait_release(indev);
      ESP_LOGD("ui_latency", "Swipe back recognized at=%u", unsigned(esphome::millis()));
      lv_obj_send_event(entry.back_button, LV_EVENT_PRESSED, nullptr);
      ESP_LOGD("ui_latency", "Swipe back finished at=%u", unsigned(esphome::millis()));
      return;
    }
  }
}

inline void navigation_register_grid_screen_gesture(lv_obj_t *screen) {
  if (screen == nullptr) return;
  auto &screens = navigation_grid_screens();
  if (std::find(screens.begin(), screens.end(), screen) == screens.end()) {
    screens.push_back(screen);
  }
  static std::vector<lv_indev_t *> registered_devices;
  lv_indev_t *indev = nullptr;
  while ((indev = lv_indev_get_next(indev)) != nullptr) {
    if (lv_indev_get_type(indev) != LV_INDEV_TYPE_POINTER ||
        std::find(registered_devices.begin(), registered_devices.end(), indev) !=
            registered_devices.end()) {
      continue;
    }
    // Recognize a short, deliberate swipe, including slower finger movement.
    // LVGL defaults to 50 px and resets gesture travel below 3 px per sample.
    lv_indev_set_gesture_min_distance(indev, 24);
    lv_indev_set_gesture_min_velocity(indev, 1);
    // Record the real touch-down point; get_vect() is only the last sample.
    lv_indev_add_event_cb(indev, navigation_grid_screen_gesture,
                          LV_EVENT_PRESSED, nullptr);
    lv_indev_add_event_cb(indev, navigation_grid_screen_gesture,
                          LV_EVENT_RELEASED, nullptr);
    lv_indev_add_event_cb(indev, navigation_grid_screen_gesture,
                          LV_EVENT_GESTURE, nullptr);
    registered_devices.push_back(indev);
  }
}

inline void navigation_clear_home_targets() {
  grid_navigation_service().clear_home_targets();
}

inline void navigation_clear_subpages(lv_obj_t *main_page_obj) {
  lv_obj_t *active = lv_scr_act();
  for (const auto &entry : navigation_subpages()) {
    if (entry.screen != nullptr && entry.screen == active) {
      // Move off the page before destroying its labels and live card contexts.
      if (!navigation_return_home(main_page_obj)) return;
      break;
    }
  }
  for (auto &entry : navigation_subpages()) {
    if (entry.screen != nullptr) {
      card_background_unregister_page(entry.screen);
  navigation_release_subpage_runtime(entry);
      clock_bar_clear_responsive_grid_cards(entry.screen);
      lv_obj_del(entry.screen);
    }
  }
  grid_navigation_service().clear_subpages();
  navigation_subpage_builder() = {};
  navigation_grid_screens().clear();
  navigation_register_grid_screen_gesture(main_page_obj);
  clock_bar_clear_button_grid_pages();
  navigation_refresh_subpage_label();
}

inline void navigation_register_home_target(int slot, int display_order,
                                            const std::string &label,
                                            const std::string &config,
                                            lv_obj_t *button) {
  if (slot <= 0 || button == nullptr) return;
  NavigationHomeTargetEntry entry;
  entry.slot = slot;
  entry.display_order = display_order;
  entry.label = navigation_trim(label);
  if (!espdesktop::grid_native_page_store()) entry.config = config;
  entry.button = button;
  for (auto &target : navigation_home_targets()) {
    if (target.slot == slot) {
      target = std::move(entry);
      return;
    }
  }
  navigation_home_targets().push_back(std::move(entry));
}

// The device supplies the clock-bar refresh with its visibility and temperature state.
inline std::function<void()> &navigation_subpage_clock_bar_refresh() {
  static std::function<void()> refresh;
  return refresh;
}

inline void navigation_subpage_screen_changed(lv_event_t *) {
  // The device refresh includes the title and icon visibility pass. Do not
  // repeat it here while the new page is waiting to draw.
  ESP_LOGD("ui_latency", "Subpage refresh start at=%u", unsigned(esphome::millis()));
  auto &refresh = navigation_subpage_clock_bar_refresh();
  if (refresh) refresh();
  else navigation_refresh_subpage_label();
  ESP_LOGD("ui_latency", "Subpage refresh done at=%u", unsigned(esphome::millis()));
}

inline void navigation_register_subpage(int slot, int display_order,
                                        const std::string &kind,
                                        lv_obj_t *screen) {
  if (slot <= 0) return;
  auto *entry = navigation_find_slot(slot);
  if (!entry) {
    navigation_subpages().emplace_back();
    entry = &navigation_subpages().back();
    entry->slot = slot;
  }
  entry->display_order = display_order;
  entry->kind = navigation_lower(navigation_trim(kind));
  entry->screen = screen;
  if (!screen) return;
  clock_bar_register_button_grid_page(screen);
  // Both events run after LVGL has changed the active screen. Unloading also
  // restores temperatures immediately when returning home or opening another UI.
  lv_obj_add_event_cb(screen, navigation_subpage_screen_changed,
                      LV_EVENT_SCREEN_LOADED, nullptr);
  lv_obj_add_event_cb(screen, navigation_subpage_screen_changed,
                      LV_EVENT_SCREEN_UNLOADED, nullptr);
}

inline int navigation_slot_from_target(const std::string &target) {
  std::string value = navigation_lower(navigation_trim(target));
  const std::string prefix = "slot:";
  if (value.rfind(prefix, 0) != 0) return -1;
  value = navigation_trim(value.substr(prefix.size()));
  if (value.empty()) return -1;
  int slot = 0;
  for (char ch : value) {
    if (ch < '0' || ch > '9') return -1;
    slot = slot * 10 + (ch - '0');
    if (slot > MAX_GRID_SLOTS) return -1;
  }
  return slot;
}

inline NavigationHomeTargetEntry *navigation_find_label_target(
    const std::string &target, bool *duplicate_found = nullptr) {
  if (duplicate_found) *duplicate_found = false;
  std::string wanted = navigation_lower(navigation_trim(target));
  if (wanted.empty()) return nullptr;

  NavigationHomeTargetEntry *best = nullptr;
  for (auto &entry : navigation_home_targets()) {
    if (entry.button == nullptr || entry.label.empty()) continue;
    if (navigation_lower(entry.label) != wanted) continue;
    if (best == nullptr || entry.display_order < best->display_order) {
      if (best != nullptr && duplicate_found) *duplicate_found = true;
      best = &entry;
    } else if (duplicate_found) {
      *duplicate_found = true;
    }
  }
  return best;
}

inline NavigationHomeTargetEntry *navigation_find_slot_target(int slot) {
  if (slot <= 0) return nullptr;
  for (auto &entry : navigation_home_targets()) {
    if (entry.slot == slot && entry.button != nullptr) return &entry;
  }
  return nullptr;
}

inline NavigationSubpageEntry *navigation_find_first_kind(const std::string &kind) {
  std::string wanted = navigation_lower(navigation_trim(kind));
  if (wanted.empty()) return nullptr;
  NavigationSubpageEntry *best = nullptr;
  for (auto &entry : navigation_subpages()) {
    if (entry.kind != wanted) continue;
    if (best == nullptr || entry.display_order < best->display_order) {
      best = &entry;
    }
  }
  return best;
}

inline NavigationSubpageEntry *navigation_find_slot(int slot) {
  if (slot <= 0) return nullptr;
  for (auto &entry : navigation_subpages()) {
    if (entry.slot == slot) return &entry;
  }
  return nullptr;
}

inline void card_background_unregister_page(lv_obj_t *page);

inline void navigation_release_subpage_screen(NavigationSubpageEntry &entry) {
  if (!entry.screen) return;
  card_background_unregister_page(entry.screen);
  navigation_release_subpage_runtime(entry);
  clock_bar_unregister_button_grid_page(entry.screen);
  auto &screens = navigation_grid_screens();
  screens.erase(std::remove(screens.begin(), screens.end(), entry.screen), screens.end());
  lv_obj_del(entry.screen);
  entry.screen = nullptr;
  entry.back_button = nullptr;
  entry.back_slot = {};
  decltype(entry.cards){}.swap(entry.cards);
  // The parent screen owned the nested buttons and their callback contexts.
  for (auto &child : navigation_subpages()) {
    if (child.parent_slot != entry.slot) continue;
    child.owner_button = nullptr;
    for (auto &target : navigation_home_targets())
      if (target.slot == child.slot) target.button = nullptr;
  }
}

inline void navigation_trim_subpage_cache(size_t limit, int protected_slot) {
  if (!navigation_subpage_builder()) return;
  while (true) {
    size_t resident = 0;
    NavigationSubpageEntry *oldest = nullptr;
    for (auto &entry : navigation_subpages()) {
      if (!entry.screen) continue;
      ++resident;
      if (entry.screen == lv_scr_act() || entry.slot == protected_slot) continue;
      const auto &pages = navigation_subpages();
      // A resident child still uses the parent's screen as its Back target.
      if (std::any_of(pages.begin(), pages.end(), [&](const auto &child) {
            return child.screen && child.parent_slot == entry.slot;
          })) continue;
      if (!oldest || entry.last_used < oldest->last_used) oldest = &entry;
    }
    if (resident <= limit || !oldest) return;
    navigation_release_subpage_screen(*oldest);
    grid_navigation_diagnostics().pages_evicted.fetch_add(1, std::memory_order_relaxed);
  }
}

inline lv_obj_t *navigation_ensure_subpage(int slot) {
  auto *entry = navigation_find_slot(slot);
  if (!entry) return nullptr;
  auto &build = navigation_subpage_builder();
  if (!entry->screen && build) {
    const int parent = entry->parent_slot;
    if (parent && !navigation_ensure_subpage(parent)) return nullptr;
    // An active nested screen can pin a parent while another parent is built.
    // Four entries cover that transition and leave Home permanently resident.
    constexpr size_t MAX_RESIDENT_SUBPAGES = 4;
    navigation_trim_subpage_cache(MAX_RESIDENT_SUBPAGES - 1, parent);
    const auto started = esphome::millis();
    if (!build(slot)) return nullptr;
    entry = navigation_find_slot(slot);
    const auto elapsed = esphome::millis() - started;
    grid_navigation_diagnostics().page_build_ms.store(elapsed, std::memory_order_relaxed);
    grid_navigation_diagnostics().pages_built.fetch_add(1, std::memory_order_relaxed);
    ESP_LOGD("ui_latency", "Built secondary page %d in %u ms", slot, unsigned(elapsed));
  }
  static uint64_t use_order = 0;
  entry->last_used = ++use_order;
  return entry->screen;
}

inline lv_obj_t *navigation_screen_for_button(lv_obj_t *button) {
  if (!button) return nullptr;
  for (const auto &entry : navigation_subpages())
    if (entry.owner_button == button) return navigation_ensure_subpage(entry.slot);
  return nullptr;
}

inline int navigation_subpage_slot_for_screen(lv_obj_t *screen) {
  if (screen == nullptr) return 0;
  for (const auto &entry : navigation_subpages()) {
    if (entry.screen == screen) return entry.slot;
  }
  return 0;
}

inline int navigation_active_subpage_slot() {
  return navigation_subpage_slot_for_screen(lv_scr_act());
}

struct NavigationOpenFrame {
  lv_obj_t *target = nullptr;
  lv_display_t *display = nullptr;
  uint32_t started = 0;
};

inline NavigationOpenFrame &navigation_open_frame() {
  static NavigationOpenFrame frame;
  return frame;
}

inline void navigation_begin_page_open(lv_obj_t *screen, uint32_t started) {
  if (!navigation_subpage_builder() || !screen || screen == lv_scr_act()) return;
  auto &frame = navigation_open_frame();
  auto *display = lv_obj_get_display(screen);
  if (frame.display != display) {
    lv_display_add_event_cb(display, [](lv_event_t *) {
      auto &pending = navigation_open_frame();
      if (!pending.target) return;
      if (pending.target == lv_scr_act())
        grid_navigation_diagnostics().page_open_frame_ms.store(
            esphome::millis() - pending.started, std::memory_order_relaxed);
      pending.target = nullptr;
    }, LV_EVENT_REFR_READY, nullptr);
    frame.display = display;
  }
  frame.target = screen;
  frame.started = started;
}

inline void navigation_show_companion_subpage(lv_obj_t *screen, bool from_card) {
  lv_obj_t *active = lv_scr_act();
  if (active == screen) return;
  grid_navigation_service().companion_page_history.opened(
      navigation_subpage_slot_for_screen(active),
      navigation_subpage_slot_for_screen(screen),
      from_card ? CompanionPageSource::CARD : CompanionPageSource::MAC_FOCUS);
  lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
}

inline std::string navigation_active_subpage_label() {
  const int slot = navigation_active_subpage_slot();
  NavigationSubpageEntry *entry = navigation_find_slot(slot);
  NavigationHomeTargetEntry *parent = navigation_find_slot_target(slot);
  if (entry == nullptr || parent == nullptr) return "";
  // The app's identity is shown on its return-home card instead of the clock bar.
  if (entry->kind == "app_shortcuts") return "";
  return parent->label;
}

inline void navigation_refresh_subpage_label() {
#ifdef USE_COMPANION
  companion_refresh_app_icon_visibility();
#endif
  if (network_status_modal_ui().overlay) {
    set_clock_bar_companion_subpage_label(espdesktop_i18n(std::string("Settings")));
    image_card_set_clock_bar_companion_icon("", "", "");
    return;
  }
  set_clock_bar_companion_subpage_label(navigation_active_subpage_label());
  image_card_set_clock_bar_companion_icon("", "", "");
}

inline NavigationSubpageEntry *navigation_companion_subpage_for_action(
    const std::string &action) {
  if (action.empty()) return nullptr;
  if (navigation_subpage_builder()) {
    for (auto &entry : navigation_subpages()) {
      if (entry.kind != "app_shortcuts") continue;
      if (grid_layout_card_config(entry.slot, {}).entity == action) return &entry;
    }
    return nullptr;
  }
  for (const auto &parent : navigation_home_targets()) {
    const ParsedCfg config = grid_layout_card_config(parent.slot, parent.config);
    if (!companion_app_shortcuts_enabled(config) || config.entity != action) continue;
    auto *entry = navigation_find_slot(parent.slot);
    if (entry && entry->screen) return entry;
  }
  return nullptr;
}

inline bool navigation_allows_companion_focus() {
  const auto *app = espdesktop::active_espdesktop_app_core();
  return !app || app->display_lifecycle().allows_focus_navigation();
}

inline bool navigation_present_companion_subpage(int slot) {
  const auto started = esphome::millis();
  auto *screen = navigation_ensure_subpage(slot);
  if (!screen) return false;
  navigation_hide_modals();
  navigation_begin_page_open(screen, started);
  navigation_show_companion_subpage(screen, /*from_card=*/false);
  return true;
}

inline bool navigation_present_focused_app_after_sleep() {
  const auto *app = espdesktop::active_espdesktop_app_core();
  if (!app || !app->display_lifecycle().blank_page_active()) return false;
  const auto action = companion_take_wake_subpage_action();
  const auto *entry = navigation_companion_subpage_for_action(action);
  return entry && navigation_present_companion_subpage(entry->slot);
}

inline bool navigation_return_from_companion_shortcuts_if_needed(
    lv_obj_t *main_page_obj) {
  if (!navigation_allows_companion_focus()) return false;
  const std::string closed_app = companion_consume_closed_app_subpage_action();
  const bool focus_changed = companion_consume_subpage_return_request();
  if (!focus_changed && closed_app.empty()) return false;
  const int slot = navigation_active_subpage_slot();
  NavigationSubpageEntry *entry = navigation_find_slot(slot);
  NavigationHomeTargetEntry *parent = navigation_find_slot_target(slot);
  if (entry == nullptr || entry->kind != "app_shortcuts" || parent == nullptr) return false;
  const ParsedCfg parent_config = grid_layout_card_config(parent->slot, parent->config);
  if (!companion_app_shortcuts_enabled(parent_config)) return false;
  const bool current_app_closed = !closed_app.empty() && closed_app == parent_config.entity;
  const bool return_on_app_switch = companion_return_home_on_app_switch();
  const std::string requested = companion_pending_auto_subpage_action();
  const bool focus_has_page = (focus_changed || current_app_closed) && return_on_app_switch &&
      (requested == parent_config.entity || navigation_companion_subpage_for_action(requested));
  const auto decision = decide_companion_page_exit(
      focus_changed, current_app_closed, return_on_app_switch, focus_has_page);
  if (decision.discard_focus_request && !requested.empty()) {
    companion_consume_auto_subpage_action(requested);
  }
  if (!decision.return_to_previous) return false;
  auto &history = grid_navigation_service().companion_page_history;
  const int return_slot = history.previous(slot, entry->parent_slot);
  if (return_slot > 0 && navigation_restore_subpage_slot(return_slot)) {
    navigation_hide_modals();
    return true;
  }
  history.clear();
  return navigation_return_home(main_page_obj);
}

inline bool navigation_open_companion_subpage_if_requested(
    lv_obj_t *main_page_obj) {
  if (!navigation_allows_companion_focus()) return false;
  const std::string requested = companion_pending_auto_subpage_action();
  if (requested.empty()) return false;
  NavigationSubpageEntry *active = navigation_find_slot(navigation_active_subpage_slot());
  if (!companion_return_home_on_app_switch() && active && active->kind == "app_shortcuts") {
    companion_consume_auto_subpage_action(requested);
    return false;
  }
  NavigationSubpageEntry *entry = navigation_companion_subpage_for_action(requested);
  if (entry == nullptr || !companion_consume_auto_subpage_action(requested)) return false;
  return navigation_present_companion_subpage(entry->slot);
}

inline bool navigation_restore_subpage_slot(int slot) {
  auto *screen = navigation_ensure_subpage(slot);
  if (!screen) return false;
  lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
  refresh_visible_image_cards();
  return true;
}

inline void navigation_register_subpage_back_button(int slot,
                                                    const BtnSlot &back_slot,
                                                    bool neutral_background = true) {
  NavigationSubpageEntry *entry = navigation_find_slot(slot);
  if (entry != nullptr) {
    entry->back_button = back_slot.btn;
    entry->back_neutral_background = neutral_background;
    entry->back_slot = back_slot;
  }
}

inline void navigation_register_subpage_card(int slot, int index,
                                             const BtnSlot &card_slot,
                                             const SubpageBtn &definition,
                                             bool neutral_background,
                                             bool sensor_surface,
                                             bool secondary_surface = false,
                                             bool image_card = false) {
  if (index <= 0 || card_slot.btn == nullptr) return;
  NavigationSubpageEntry *entry = navigation_find_slot(slot);
  if (entry == nullptr) return;
  entry->cards.push_back({index, card_slot.btn, card_slot, definition,
                          neutral_background, sensor_surface, secondary_surface, image_card,
                          static_cast<int>(entry->cards.size())});
}

inline void navigation_retire_subpage(int slot, lv_obj_t *main_page_obj) {
  std::vector<NavigationSubpageEntry> &entries = navigation_subpages();
  for (auto it = entries.begin(); it != entries.end(); ++it) {
    if (it->slot != slot) continue;
    if (it->screen != nullptr && it->screen == lv_scr_act()) {
      navigation_return_home(main_page_obj);
    }
    navigation_release_subpage_screen(*it);
    entries.erase(it);
    return;
  }
}

inline NavigationSubpageEntry::Card *navigation_subpage_card(
    NavigationSubpageEntry &entry, int index) {
  for (auto &card : entry.cards) {
    if (card.index == index) return &card;
  }
  return nullptr;
}

inline lv_obj_t *navigation_subpage_card_button(
    const NavigationSubpageEntry &entry, int index) {
  for (const auto &card : entry.cards) {
    if (card.index == index) return card.button;
  }
  return nullptr;
}

inline bool navigation_open_first_kind(const std::string &kind,
                                       lv_obj_t *main_page_obj) {
  navigation_hide_modals();
  NavigationSubpageEntry *target = navigation_find_first_kind(kind);
  if (target == nullptr) {
    ESP_LOGW("navigation", "No subpage of kind '%s'", navigation_trim(kind).c_str());
    return false;
  }
  auto *screen = navigation_ensure_subpage(target->slot);
  if (!screen) return false;
  lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
  refresh_visible_image_cards();
  return true;
}

inline bool navigation_activate_home_target(NavigationHomeTargetEntry *target,
                                            lv_obj_t *main_page_obj) {
  if (target == nullptr || target->button == nullptr) return false;
  if (!navigation_return_home(main_page_obj)) return false;
  handle_button_click(target->config, target->slot, target->button);
  return true;
}

inline bool espdesktop_navigate(const std::string &target,
                                lv_obj_t *main_page_obj) {
  std::string normalized = navigation_lower(navigation_trim(target));
  if (normalized.empty()) {
    ESP_LOGW("navigation", "Navigation target is empty");
    return false;
  }

  if (normalized == "home" || normalized == "main") {
    return navigation_return_home(main_page_obj);
  }

  navigation_hide_modals();

  bool duplicate_found = false;
  NavigationHomeTargetEntry *label_target =
    navigation_find_label_target(target, &duplicate_found);
  if (label_target != nullptr) {
    if (duplicate_found) {
      ESP_LOGW("navigation",
        "Multiple home-screen cards are labelled '%s'; activating slot %d",
        navigation_trim(target).c_str(), label_target->slot);
    }
    return navigation_activate_home_target(label_target, main_page_obj);
  }

  int slot = navigation_slot_from_target(target);
  if (slot > 0) {
    NavigationHomeTargetEntry *slot_target = navigation_find_slot_target(slot);
    if (slot_target != nullptr) {
      return navigation_activate_home_target(slot_target, main_page_obj);
    }
    ESP_LOGW("navigation", "Slot %d is not a configured home-screen card", slot);
    return false;
  }

  ESP_LOGW("navigation", "No home-screen card labelled '%s'", navigation_trim(target).c_str());
  return false;
}
